import { GeocodeService } from './geocode.service';
import { PrismaService } from '../../prisma/prisma.service';

// Prisma giả: lưu AppSetting trong Map (mô phỏng cache DB).
function fakePrisma(): PrismaService {
  const store = new Map<string, unknown>();
  return {
    appSetting: {
      findUnique: async ({ where: { key } }: { where: { key: string } }) =>
        store.has(key) ? { key, value: store.get(key) } : null,
      upsert: async ({
        where: { key },
        update,
        create,
      }: {
        where: { key: string };
        update: { value: unknown };
        create: { value: unknown };
      }) => {
        store.set(key, update?.value ?? create?.value);
        return {};
      },
    },
    room: { findMany: async () => [] },
  } as unknown as PrismaService;
}

const hit = (results: unknown[]) => ({ ok: true, status: 200, data: results });
// display_name mặc định NHIỀU thành phần (địa chỉ cụ thể) để qua chốt chặn độ thô.
const nominatimRow = (
  lat: number,
  lng: number,
  importance: number,
  name = 'Số 1 Phố Test, Phường Test, Quận Test, Hà Nội, Việt Nam',
) => ({ display_name: name, lat: String(lat), lon: String(lng), importance });

function makeService() {
  // minInterval 0 + maxRetries 0 để test nhanh, không chờ rate-limit/backoff.
  const svc = new GeocodeService(fakePrisma(), {
    minIntervalMs: 0,
    maxRetries: 0,
    timeoutMs: 50,
  });
  const spy = jest.spyOn(
    svc as unknown as {
      httpFetch: (
        url: string,
      ) => Promise<{ ok: boolean; status: number; data: unknown }>;
    },
    'httpFetch',
  );
  return { svc, spy };
}

describe('GeocodeService — cache / ambiguous / timeout', () => {
  it('cache MISS gọi Nominatim; lần 2 cùng địa chỉ là cache HIT (không gọi lại)', async () => {
    const { svc, spy } = makeService();
    spy.mockResolvedValue(hit([nominatimRow(21.05, 105.76, 0.7)]));

    const r1 = await svc.resolve('ĐH Công nghiệp');
    expect(r1.status).toBe('OK');
    expect(r1.fromCache).toBe(false);
    expect(r1.latitude).toBeCloseTo(21.05, 2);

    const r2 = await svc.resolve('ĐH Công nghiệp');
    expect(r2.status).toBe('OK');
    expect(r2.fromCache).toBe(true);

    // TUYỆT ĐỐI không geocode lại địa chỉ đã cache -> đúng 1 lần gọi mạng.
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('nhiều kết quả mơ hồ -> AMBIGUOUS, không tự chọn, trả candidates', async () => {
    const { svc, spy } = makeService();
    spy.mockResolvedValue(
      hit([
        nominatimRow(21.05, 105.76, 0.5, 'A'),
        nominatimRow(20.9, 105.9, 0.46, 'B'),
      ]),
    );

    const r = await svc.resolve('Trần Phú');
    expect(r.status).toBe('AMBIGUOUS');
    expect(r.candidates?.length).toBe(2);
    expect(r.latitude).toBeUndefined();

    // AMBIGUOUS vẫn được cache -> lần 2 không gọi lại mạng.
    const r2 = await svc.resolve('Trần Phú');
    expect(r2.fromCache).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('kết quả trội rõ (gap importance lớn) -> OK top-1', async () => {
    const { svc, spy } = makeService();
    spy.mockResolvedValue(
      hit([nominatimRow(21.05, 105.76, 0.8), nominatimRow(20.9, 105.9, 0.3)]),
    );
    const r = await svc.resolve('Nhổn Hà Nội');
    expect(r.status).toBe('OK');
    expect(r.latitude).toBeCloseTo(21.05, 2);
  });

  it('timeout / lỗi mạng -> GEOCODE_FAILED và KHÔNG cache (thử lại lần sau)', async () => {
    const { svc, spy } = makeService();
    spy.mockRejectedValue(new Error('AbortError: timeout'));

    const r1 = await svc.resolve('địa chỉ nào đó');
    expect(r1.status).toBe('GEOCODE_FAILED');

    // Không cache lỗi -> lần 2 gọi mạng lại.
    spy.mockResolvedValue(hit([nominatimRow(21.0, 105.8, 0.7)]));
    const r2 = await svc.resolve('địa chỉ nào đó');
    expect(r2.status).toBe('OK');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('kết quả quá thô (chỉ tới thành phố) -> NOT_FOUND, không gán tâm thành phố', async () => {
    const { svc, spy } = makeService();
    // Nominatim lùi về cả thành phố khi không tìm ra địa chỉ cụ thể.
    spy.mockResolvedValue(hit([nominatimRow(21.0283, 105.854, 0.9, 'Hà Nội, Việt Nam')]));
    const r = await svc.resolve('Nhà 8 ngõ 2 ngách xyz không có thật');
    expect(r.status).toBe('NOT_FOUND');
    expect(r.latitude).toBeUndefined();
  });

  it('không có kết quả -> NOT_FOUND (được cache)', async () => {
    const { svc, spy } = makeService();
    spy.mockResolvedValue(hit([]));
    const r = await svc.resolve('địa điểm không tồn tại xyz');
    expect(r.status).toBe('NOT_FOUND');
    const r2 = await svc.resolve('địa điểm không tồn tại xyz');
    expect(r2.fromCache).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
