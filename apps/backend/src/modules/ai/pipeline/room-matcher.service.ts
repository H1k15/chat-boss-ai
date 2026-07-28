import { Injectable } from '@nestjs/common';
import { Room, RoomStatus } from '@prisma/client';
import { appSettingKey } from '../../../common/tenant';
import {
  AreaRelation,
  ExtractedInfo,
  LocationResolution,
  MatchedRoom,
} from '@cba/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { deaccent } from '../../../common/vietnamese';
import { GeocodeService } from '../../geocode/geocode.service';
import { haversineKm } from '../../geocode/haversine';
import { DEFAULT_AREA_GROUPS } from './area-groups';
import { DEFAULT_LANDMARKS, Landmark } from './landmarks';

/** Ứng viên phòng trong lúc chấm — kèm quan hệ khu và khoảng cách (nếu tính được). */
interface Candidate {
  room: Room;
  relation: AreaRelation;
  score: number;
  distanceKm?: number;
}

/**
 * Một yêu cầu của khách được thoả mãn bởi phòng nào.
 *
 * Không phải mã nào cũng nằm trong mảng `utilities`: WC riêng, giờ giấc, chỗ
 * để xe và thú cưng là các CỘT RIÊNG trong bảng rooms. Bảng ánh xạ này là nơi
 * duy nhất biết điều đó, để việc chấm điểm không bỏ sót phòng hợp lệ.
 */
const REQUIREMENT_PREDICATES: Record<string, (room: Room) => boolean> = {
  gac: (r) => r.utilities.includes('gac') || /gác/i.test(r.roomType ?? ''),
  wc_rieng: (r) => r.wc === 'rieng',
  may_lanh: (r) => r.utilities.includes('may_lanh'),
  tu_lanh: (r) => r.utilities.includes('tu_lanh'),
  nem: (r) => r.utilities.includes('nem'),
  gio_tu_do: (r) => r.freeHours,
  de_xe: (r) => r.parking,
  thu_cung: (r) => r.petAllowed,
};

/** Thứ tự ưu tiên theo khu vực — số nhỏ xếp trước. */
const RELATION_RANK: Record<AreaRelation, number> = {
  exact: 0,
  nearby: 1,
  other: 2,
};

// [3] Lọc phòng phù hợp — THUẦN LOGIC, KHÔNG dùng LLM.
// Đây là "nguồn sự thật" về phòng để bước sinh câu trả lời không bịa.
@Injectable()
export class RoomMatcherService {
  // Số phòng tối đa được geocode NGAY trong 1 request (khi cache miss). Phần còn
  // lại dựa cache hoặc rơi về lọc theo khu. Warm trước bằng POST /geocode/warm-rooms.
  private readonly inlineGeocodeMax = Number(
    process.env.GEOCODE_INLINE_ROOM_MAX || 8,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly geocode: GeocodeService,
  ) {}

  /** Giữ chữ ký cũ cho các nơi chỉ cần danh sách phòng (care task, /rooms/match). */
  async match(info: ExtractedInfo, limit = 3): Promise<MatchedRoom[]> {
    return (await this.matchDetailed(info, limit)).rooms;
  }

  /**
   * Lọc phòng + (nếu khách hỏi theo khoảng cách) phân giải điểm mốc và lọc theo
   * bán kính bằng Haversine. Trả kèm trạng thái geocode để nhân viên xử lý ca
   * AMBIGUOUS. Khoảng cách CHỈ là một tiêu chí; SafetyGuard ở bước sau không đổi.
   */
  async matchDetailed(
    info: ExtractedInfo,
    limit = 3,
  ): Promise<{ rooms: MatchedRoom[]; location: LocationResolution }> {
    const rooms = await this.prisma.room.findMany({
      // Chỉ phòng CÒN TRỐNG. Phòng đã cọc/đã thuê không bao giờ được đưa cho
      // AI tư vấn — đây là biện pháp chống rủi ro "dữ liệu phòng sai".
      //
      // KHÔNG lọc cứng khu vực ở SQL: so khớp khu cần bỏ dấu + hiểu khu lân
      // cận, làm ở dưới. Lọc cứng từng khiến khách hỏi "Phú Diễn" (chưa có
      // phòng) bị gợi ý phòng cách 20km ngang hàng phòng cách 2km.
      where: {
        status: RoomStatus.AVAILABLE,
        // Nới trần ngân sách 10%: khách nói "tầm 3tr5" thường vẫn xem phòng
        // 3tr8. Lọc cứng ở đây sẽ giấu mất phòng mà khách thực sự muốn xem.
        ...(info.budgetMax
          ? { price: { lte: Math.round(info.budgetMax * 1.1) } }
          : {}),
        // Loại phòng nhỏ hơn số người khách cần ở.
        ...(info.peopleCount
          ? {
              OR: [
                { peopleCountMax: null },
                { peopleCountMax: { gte: info.peopleCount } },
              ],
            }
          : {}),
      },
      take: 200,
    });

    // Dịch điểm mốc khách nêu ("gần ĐH Công nghiệp") thành khu chuẩn ("Nhổn")
    // TRƯỚC khi chấm — nếu không có mốc nào khớp thì giữ nguyên khu khách gõ.
    let area = info.area;
    if (area) {
      const landmarks = await this.loadLandmarks();
      area = this.resolveLandmark(area, landmarks);
    }
    // info dùng cho chấm điểm/hiển thị lấy theo khu đã dịch (nếu có đổi).
    const info2 = area === info.area ? info : { ...info, area };

    const groups = area ? await this.loadAreaGroups() : [];

    const candidates: Candidate[] = rooms.map((room) => {
      const relation = this.areaRelation(room, area, groups);
      return { room, relation, score: this.score(room, info2, relation) };
    });

    // Khu vực là tiêu chí ƯU TIÊN TUYỆT ĐỐI: đúng khu > gần khu > khu khác.
    // Không để điểm ngân sách/tiện ích kéo một phòng xa vượt lên phòng gần.
    const areaSort = (a: Candidate, b: Candidate): number =>
      RELATION_RANK[a.relation] - RELATION_RANK[b.relation] || b.score - a.score;

    // Có ràng buộc khoảng cách bằng SỐ (bán kính / tối đa) -> geocode + lọc km.
    const effRadius = info.radiusKm ?? info.maxDistanceKm;
    const target = info.targetLocation;
    let location: LocationResolution = { status: 'NONE' };

    if (effRadius && target && this.geocode.isEnabled()) {
      // area (đã dịch landmark) làm ngữ cảnh khử nhập nhằng cho điểm mốc.
      location = await this.applyDistance(candidates, target, effRadius, area);
    }

    if (location.status !== 'OK') {
      candidates.sort(areaSort); // fallback theo khu (hoặc không hỏi khoảng cách)
    }

    const top = candidates
      .slice(0, limit)
      .map((c) =>
        this.toMatchedRoom(
          c.room,
          c.score,
          area ? c.relation : undefined,
          c.distanceKm,
        ),
      );
    return { rooms: top, location };
  }

  /**
   * Geocode điểm mốc + tính khoảng cách Haversine cho phòng, rồi LỌC theo bán
   * kính. Mọi tính toán bằng CODE (model không đụng con số km).
   *
   * - Mốc AMBIGUOUS: KHÔNG tự chọn -> trả trạng thái để nhân viên xác nhận, giữ
   *   thứ tự theo khu (không báo khoảng cách).
   * - Mốc NOT_FOUND / lỗi geocode: fallback theo khu, KHÔNG báo khoảng cách giả.
   * - Phòng chưa có toạ độ (cache miss vượt ngân sách inline): giữ nếu đúng/gần
   *   khu (fallback), KHÔNG gán khoảng cách bịa.
   *
   * SẮP XẾP candidates tại chỗ khi status = OK và trả LocationResolution.
   */
  private async applyDistance(
    candidates: Candidate[],
    target: string,
    radiusKm: number,
    contextArea?: string,
  ): Promise<LocationResolution> {
    const ctx =
      contextArea && contextArea !== target ? contextArea : undefined;
    const geo = await this.geocode.resolve(target, ctx);

    if (geo.status === 'AMBIGUOUS') {
      return {
        status: 'AMBIGUOUS',
        target,
        radiusKm,
        candidates: geo.candidates,
        usedAreaFallback: true,
      };
    }
    if (
      geo.status !== 'OK' ||
      geo.latitude === undefined ||
      geo.longitude === undefined
    ) {
      return {
        status: geo.status === 'NOT_FOUND' ? 'NOT_FOUND' : 'GEOCODE_FAILED',
        target,
        radiusKm,
        usedAreaFallback: true,
      };
    }

    const center = { lat: geo.latitude, lng: geo.longitude };
    let inlineBudget = this.inlineGeocodeMax;

    for (const c of candidates) {
      let pt: { lat: number; lng: number } | undefined;
      // 1) Đã có toạ độ trong DB -> dùng ngay, KHÔNG gọi API (#4).
      if (c.room.latitude != null && c.room.longitude != null) {
        pt = { lat: c.room.latitude, lng: c.room.longitude };
      } else if (inlineBudget > 0) {
        // 2) Chưa có -> geocode ngay (rate-limited) trong hạn ngân sách + ghi DB.
        inlineBudget--;
        pt = await this.geocode.geocodeRoom({
          roomCode: c.room.roomCode,
          address: c.room.address,
          area: c.room.area,
        });
      }
      if (pt) c.distanceKm = Number(haversineKm(center, pt).toFixed(2));
    }

    // Lọc: khoảng cách BIẾT & vượt bán kính -> loại. CHƯA BIẾT -> giữ nếu
    // đúng/gần khu (fallback), không bịa khoảng cách.
    const kept = candidates.filter((c) =>
      c.distanceKm === undefined
        ? c.relation !== 'other'
        : c.distanceKm <= radiusKm,
    );
    candidates.length = 0;
    candidates.push(...kept);

    // Trong bán kính: gần nhất trước; phòng chưa biết khoảng cách xếp sau.
    candidates.sort((a, b) => {
      const ad = a.distanceKm ?? Number.POSITIVE_INFINITY;
      const bd = b.distanceKm ?? Number.POSITIVE_INFINITY;
      return ad - bd || b.score - a.score;
    });

    return { status: 'OK', target, lat: center.lat, lng: center.lng, radiusKm };
  }

  /**
   * Dịch điểm mốc -> khu chuẩn. Nếu khu khách gõ chứa keyword của một mốc
   * (so sau khi bỏ dấu), trả về tên khu chuẩn của mốc đó; ngược lại giữ nguyên.
   * VD: "gần ĐH Công nghiệp" -> "Nhổn"; "Phú Diễn" (không phải mốc) -> "Phú Diễn".
   */
  private resolveLandmark(area: string, landmarks: Landmark[]): string {
    const a = deaccent(area);
    for (const lm of landmarks) {
      if (lm.keywords.some((k) => a.includes(deaccent(k)))) return lm.area;
    }
    return area;
  }

  /**
   * Từ điển điểm mốc: admin cấu hình qua AppSetting "landmarks"
   * (JSON {area, keywords}[]), chưa cấu hình thì dùng mặc định trong code.
   */
  private async loadLandmarks(): Promise<Landmark[]> {
    try {
      const row = await this.prisma.appSetting.findUnique({
        where: appSettingKey('landmarks'),
      });
      const v = row?.value as unknown;
      const isLandmark = (l: unknown): l is Landmark => {
        const o = l as Record<string, unknown>;
        return (
          !!o &&
          typeof o.area === 'string' &&
          Array.isArray(o.keywords) &&
          o.keywords.every((k) => typeof k === 'string')
        );
      };
      if (Array.isArray(v) && v.every(isLandmark)) {
        return v;
      }
    } catch {
      // rơi xuống mặc định
    }
    return DEFAULT_LANDMARKS;
  }

  /**
   * Phòng này đứng đâu so với khu khách hỏi: đúng khu ('exact'), cùng cụm
   * lân cận ('nearby'), hay khu khác ('other'). Không hỏi khu -> 'exact'
   * (mọi phòng bình đẳng, xếp thuần theo điểm).
   */
  private areaRelation(
    room: Room,
    needle: string | undefined,
    groups: string[][],
  ): AreaRelation {
    if (!needle) return 'exact';
    if (this.areaMatches(room.area, needle)) return 'exact';

    // Các cụm chứa khu khách hỏi -> phòng thuộc bất kỳ khu nào trong cụm đó
    // được coi là lân cận.
    for (const group of groups) {
      if (!group.some((name) => this.areaMatches(name, needle))) continue;
      if (group.some((name) => this.areaMatches(room.area, name)))
        return 'nearby';
    }
    return 'other';
  }

  /**
   * Cụm khu vực lân cận: admin cấu hình qua AppSetting "area_groups"
   * (Json string[][]), chưa cấu hình thì dùng mặc định trong code.
   */
  private async loadAreaGroups(): Promise<string[][]> {
    try {
      const row = await this.prisma.appSetting.findUnique({
        where: appSettingKey('area_groups'),
      });
      const v = row?.value;
      if (
        Array.isArray(v) &&
        v.every(
          (g) => Array.isArray(g) && g.every((x) => typeof x === 'string'),
        )
      ) {
        return v as string[][];
      }
    } catch {
      // rơi xuống mặc định
    }
    return DEFAULT_AREA_GROUPS;
  }

  /**
   * Chấm điểm khớp trong khoảng 0..1.
   * Ưu tiên: đúng khu vực > gần khu > trong ngân sách > đủ tiện ích > vừa số người.
   */
  private score(
    room: Room,
    info: ExtractedInfo,
    relation: AreaRelation,
  ): number {
    let s = 0.3; // điểm nền

    if (info.area) {
      if (relation === 'exact') s += 0.3;
      else if (relation === 'nearby') s += 0.2;
    }

    if (info.budgetMax) {
      if (room.price <= info.budgetMax) {
        // Càng sát trần ngân sách càng hợp ý (khách thường muốn phòng tốt
        // nhất trong tầm tiền), nhưng không được vượt trần.
        s += 0.15 + 0.1 * (room.price / info.budgetMax);
      } else {
        // Vượt trần nhưng còn trong biên 10% — vẫn đáng gợi ý, điểm thấp hơn.
        s += 0.05;
      }
    }

    if (info.requirements?.length) {
      const hit = info.requirements.filter((req) =>
        this.satisfies(room, req),
      ).length;
      s += 0.15 * (hit / info.requirements.length);
    }

    if (info.peopleCount && room.peopleCountMax) {
      if (info.peopleCount <= room.peopleCountMax) s += 0.05;
    }

    return Math.min(1, Number(s.toFixed(3)));
  }

  private satisfies(room: Room, requirement: string): boolean {
    return REQUIREMENT_PREDICATES[requirement]?.(room) ?? false;
  }

  /**
   * So khu vực sau khi bỏ dấu, đối chiếu hai chiều — khách gõ "go vap" hay
   * "Gò Vấp" hay "quận Gò Vấp" đều phải khớp phòng ghi "Gò Vấp".
   */
  private areaMatches(roomArea: string, needle: string): boolean {
    const a = deaccent(roomArea);
    const b = deaccent(needle);
    return a.includes(b) || b.includes(a);
  }

  private toMatchedRoom(
    room: Room,
    score: number,
    areaRelation?: AreaRelation,
    distanceKm?: number,
  ): MatchedRoom {
    return {
      areaRelation,
      id: room.id,
      roomCode: room.roomCode,
      area: room.area,
      address: room.address ?? undefined,
      price: room.price,
      roomType: room.roomType ?? undefined,
      highlights: this.highlights(room),
      furniture: room.furniture ?? undefined,
      note: room.note ?? undefined,
      imageLinks: room.imageLinks,
      videoLinks: room.videoLinks,
      matchScore: score,
      distanceKm,
    };
  }

  private highlights(room: Room): string[] {
    const h: string[] = [];
    if (room.roomType) h.push(room.roomType);
    if (room.wc === 'rieng') h.push('WC riêng');
    if (room.utilities.includes('may_lanh')) h.push('máy lạnh');
    if (room.utilities.includes('tu_lanh')) h.push('tủ lạnh');
    if (room.size) h.push(`${room.size}m2`);
    if (room.freeHours) h.push('giờ giấc tự do');
    if (room.parking) h.push('có chỗ để xe');
    if (room.petAllowed) h.push('nuôi thú cưng được');
    return h;
  }
}
