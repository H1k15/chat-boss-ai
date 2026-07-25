import { Room } from '@prisma/client';
import { RoomMatcherService } from './room-matcher.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { GeocodeService } from '../../geocode/geocode.service';

// Geocode giả: mặc định "tắt" để các test khu vực không đụng tới. Test khoảng
// cách sẽ truyền stub cấu hình resolve/roomPointCached riêng.
const offGeocode = (): GeocodeService =>
  ({
    isEnabled: () => false,
    resolve: jest.fn(),
    geocodeRoom: jest.fn().mockResolvedValue(undefined),
  }) as unknown as GeocodeService;

describe('RoomMatcherService — ưu tiên khu vực', () => {
  const room = (over: Partial<Room>): Room =>
    ({
      id: over.roomCode ?? 'r1',
      roomCode: 'P001',
      area: 'Gò Vấp',
      address: null,
      price: 3000000,
      roomType: null,
      utilities: [],
      wc: null,
      freeHours: false,
      parking: false,
      petAllowed: false,
      peopleCountMax: null,
      size: null,
      furniture: null,
      note: null,
      imageLinks: [],
      videoLinks: [],
      ...over,
    }) as unknown as Room;

  // Prisma giả: trả danh sách phòng cho trước, không cấu hình area_groups
  // (rơi về DEFAULT_AREA_GROUPS — Phú Diễn và Đức Diễn cùng cụm Bắc Từ Liêm).
  const matcherWith = (rooms: Room[], geocode: GeocodeService = offGeocode()) =>
    new RoomMatcherService(
      {
        room: { findMany: jest.fn().mockResolvedValue(rooms) },
        appSetting: { findUnique: jest.fn().mockResolvedValue(null) },
      } as unknown as PrismaService,
      geocode,
    );

  const ducDien = room({
    roomCode: 'P103',
    area: 'Nhà 16 ngõ 23 ngách 29 Đức Diễn',
    price: 2000000,
  });
  const linhNam = room({
    roomCode: 'P306',
    area: 'Nhà 141 ngõ 467 Lĩnh Nam',
    price: 3500000,
    utilities: ['may_lanh', 'tu_lanh'],
  });
  const phuDien = room({
    roomCode: 'P201',
    area: 'Nhà 5 ngõ 100 Phú Diễn',
    price: 2500000,
  });

  it('khách hỏi Phú Diễn: Đức Diễn (cùng cụm, ~2km) xếp trước Lĩnh Nam (~20km)', async () => {
    const matched = await matcherWith([linhNam, ducDien]).match({
      area: 'Phú Diễn',
      budgetMax: 3500000,
    });

    expect(matched.map((r) => r.roomCode)).toEqual(['P103', 'P306']);
    expect(matched[0].areaRelation).toBe('nearby');
    expect(matched[1].areaRelation).toBe('other');
  });

  it('phòng đúng khu luôn xếp trước phòng lân cận, kể cả điểm tiện ích thấp hơn', async () => {
    const matched = await matcherWith([linhNam, ducDien, phuDien]).match({
      area: 'Phú Diễn',
      budgetMax: 3500000,
      requirements: ['may_lanh', 'tu_lanh'],
    });

    expect(matched.map((r) => r.roomCode)).toEqual(['P201', 'P103', 'P306']);
    expect(matched[0].areaRelation).toBe('exact');
  });

  it('so khớp khu không phụ thuộc dấu/chữ hoa ("phu dien")', async () => {
    const matched = await matcherWith([linhNam, phuDien]).match({
      area: 'phu dien',
    });
    expect(matched[0].roomCode).toBe('P201');
    expect(matched[0].areaRelation).toBe('exact');
  });

  it('khách chưa nói khu vực: không gắn areaRelation, xếp theo điểm', async () => {
    const matched = await matcherWith([ducDien, linhNam]).match({
      budgetMax: 3500000,
    });
    expect(matched).toHaveLength(2);
    for (const m of matched) expect(m.areaRelation).toBeUndefined();
  });
});

describe('RoomMatcherService — lọc theo bán kính (geocode)', () => {
  const room = (over: Partial<Room>): Room =>
    ({
      id: over.roomCode ?? 'r1',
      roomCode: 'P001',
      area: 'Đức Diễn',
      address: 'addr',
      price: 3000000,
      roomType: null,
      utilities: [],
      wc: null,
      freeHours: false,
      parking: false,
      petAllowed: false,
      peopleCountMax: null,
      size: null,
      furniture: null,
      note: null,
      imageLinks: [],
      videoLinks: [],
      latitude: null,
      longitude: null,
      ...over,
    }) as unknown as Room;

  // Tâm (điểm mốc) + toạ độ 2 phòng (lưu ở CỘT DB) để test Haversine + lọc bán kính.
  const CENTER = { lat: 21.05, lng: 105.76 };
  const near = room({
    roomCode: 'P100',
    area: 'Đức Diễn',
    price: 2000000,
    latitude: 21.055, // gần tâm (< 1km)
    longitude: 105.762,
  } as Partial<Room>);
  const far = room({
    roomCode: 'P200',
    area: 'Lĩnh Nam',
    price: 2500000,
    latitude: 21.12, // xa tâm (> 8km)
    longitude: 105.83,
  } as Partial<Room>);

  const geocodeStub = (over: Partial<GeocodeService>): GeocodeService =>
    ({
      isEnabled: () => true,
      resolve: jest.fn(),
      geocodeRoom: jest.fn().mockResolvedValue(undefined),
      writeRoomCoords: jest.fn(),
      ...over,
    }) as unknown as GeocodeService;

  const matcherWith = (rooms: Room[], geocode: GeocodeService) =>
    new RoomMatcherService(
      {
        room: { findMany: jest.fn().mockResolvedValue(rooms) },
        appSetting: { findUnique: jest.fn().mockResolvedValue(null) },
      } as unknown as PrismaService,
      geocode,
    );

  it('bán kính 3km: giữ phòng trong bán kính, loại phòng xa, gắn distanceKm', async () => {
    const geocode = geocodeStub({
      resolve: jest.fn().mockResolvedValue({
        status: 'OK',
        latitude: CENTER.lat,
        longitude: CENTER.lng,
        fromCache: true,
      }),
      // Phòng đã có toạ độ ở cột DB -> matcher dùng trực tiếp, không gọi geocodeRoom.
    });

    const { rooms, location } = await matcherWith([far, near], geocode).matchDetailed({
      targetLocation: 'ĐH Công nghiệp',
      area: 'Nhổn',
      radiusKm: 3,
      distanceRequirement: 'within',
    });

    expect(location.status).toBe('OK');
    expect(rooms.map((r) => r.roomCode)).toEqual(['P100']); // chỉ phòng gần
    expect(rooms[0].distanceKm).toBeGreaterThan(0);
    expect(rooms[0].distanceKm).toBeLessThanOrEqual(3);
  });

  it('mốc AMBIGUOUS: không lọc theo km, trả trạng thái để nhân viên xác nhận', async () => {
    const geocode = geocodeStub({
      resolve: jest.fn().mockResolvedValue({
        status: 'AMBIGUOUS',
        candidates: [
          { displayName: 'A', lat: 21, lng: 105 },
          { displayName: 'B', lat: 20, lng: 106 },
        ],
        fromCache: false,
      }),
    });

    const { rooms, location } = await matcherWith([near, far], geocode).matchDetailed({
      targetLocation: 'Trần Phú',
      area: 'Đức Diễn',
      radiusKm: 3,
    });

    expect(location.status).toBe('AMBIGUOUS');
    expect(location.candidates?.length).toBe(2);
    expect(location.usedAreaFallback).toBe(true);
    // Không gán khoảng cách bịa.
    for (const r of rooms) expect(r.distanceKm).toBeUndefined();
  });

  it('geocode NOT_FOUND: fallback lọc theo khu, không báo khoảng cách', async () => {
    const geocode = geocodeStub({
      resolve: jest
        .fn()
        .mockResolvedValue({ status: 'NOT_FOUND', fromCache: false }),
    });

    const { rooms, location } = await matcherWith([near, far], geocode).matchDetailed({
      targetLocation: 'chỗ nào đó không có thật',
      area: 'Đức Diễn',
      radiusKm: 3,
    });

    expect(location.status).toBe('NOT_FOUND');
    expect(location.usedAreaFallback).toBe(true);
    // Vẫn trả phòng (fallback khu), giá giữ nguyên, không có distanceKm.
    expect(rooms.length).toBeGreaterThan(0);
    expect(rooms[0].price).toBe(near.price);
    for (const r of rooms) expect(r.distanceKm).toBeUndefined();
  });

  it('không hỏi khoảng cách: location = NONE, hành xử như cũ', async () => {
    const geocode = geocodeStub({});
    const { rooms, location } = await matcherWith([near, far], geocode).matchDetailed({
      area: 'Đức Diễn',
    });
    expect(location.status).toBe('NONE');
    expect(rooms.length).toBeGreaterThan(0);
    expect(geocode.resolve).not.toHaveBeenCalled();
  });
});
