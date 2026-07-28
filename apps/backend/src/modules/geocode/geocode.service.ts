import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma, RoomStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { deaccent } from '../../common/vietnamese';
import { DEFAULT_ORG_ID } from '../../common/tenant';
import { LatLng, isValidLatLng } from './haversine';
import { parseLatLngFromMapsUrl, extractQueryAddress } from './maps-link';

// Dịch vụ geocode dùng OpenStreetMap Nominatim (KHÔNG dùng Google Maps).
//
// Ràng buộc bắt buộc (theo yêu cầu):
//  - User-Agent riêng (Nominatim yêu cầu; thiếu là bị chặn)
//  - Tối đa 1 request/giây (rate limit; ở đây mặc định 1.1s cho chắc)
//  - Cache theo địa chỉ đã chuẩn hoá; TUYỆT ĐỐI không geocode lại cái đã cache
//  - Retry có backoff; timeout rõ ràng
//  - Nhiều kết quả mơ hồ -> KHÔNG tự chọn bừa, trả AMBIGUOUS để nhân viên xác nhận
//
// Toạ độ được lưu trong AppSetting (không thêm cột DB -> không cần migration,
// đúng quy ước migration-free của dự án). Hai map:
//   geocode_cache : { [normalizedAddress]: GeocodeCacheEntry }  (địa chỉ -> toạ độ)
//   room_geocode  : { [roomCode]: { latitude, longitude, ... } } (nhân viên ghim tay)

export type GeocodeStatus = 'OK' | 'AMBIGUOUS' | 'NOT_FOUND' | 'GEOCODE_FAILED';

export interface GeocodeCandidate {
  displayName: string;
  lat: number;
  lng: number;
}

// Bản ghi cache — dùng ĐÚNG tên field theo yêu cầu chuẩn hoá dữ liệu phòng.
export interface GeocodeCacheEntry {
  status: GeocodeStatus;
  latitude?: number;
  longitude?: number;
  geocoded_address?: string; // displayName Nominatim trả về
  geocoded_at?: string; // ISO time
  geocode_source?: 'nominatim' | 'manual';
  candidates?: GeocodeCandidate[]; // khi AMBIGUOUS
}

export interface GeocodeResolution extends GeocodeCacheEntry {
  fromCache: boolean;
}

const CACHE_KEY = 'geocode_cache';

// Chênh lệch "importance" giữa kết quả top-1 và top-2 để coi là RÕ RÀNG.
// Nhỏ hơn ngưỡng này mà có >1 kết quả -> coi là mơ hồ (AMBIGUOUS).
const AMBIGUITY_GAP = 0.15;

interface GeocodeOpts {
  minIntervalMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

@Injectable()
export class GeocodeService {
  private readonly logger = new Logger(GeocodeService.name);
  private readonly baseUrl =
    process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';
  private readonly userAgent =
    process.env.NOMINATIM_USER_AGENT ||
    'ChatBossAI/1.0 (nha tro advisor; lien he admin@chatboss.ai)';
  private readonly city = process.env.GEOCODE_DEFAULT_CITY || 'Hà Nội, Việt Nam';
  private readonly enabled = (process.env.GEOCODE_ENABLED || 'true') !== 'false';
  private readonly minIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  // Rate limiter: nối các lần gọi mạng vào một chuỗi, mỗi lần cách nhau tối thiểu
  // minIntervalMs (đảm bảo ≤ 1 req/giây tới Nominatim).
  private lastCallAt = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() opts?: GeocodeOpts,
  ) {
    this.minIntervalMs =
      opts?.minIntervalMs ?? Number(process.env.GEOCODE_MIN_INTERVAL_MS || 1100);
    this.timeoutMs =
      opts?.timeoutMs ?? Number(process.env.GEOCODE_TIMEOUT_MS || 6000);
    this.maxRetries =
      opts?.maxRetries ?? Number(process.env.GEOCODE_MAX_RETRIES || 2);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  // ---- Chuẩn hoá & dựng truy vấn -------------------------------------------

  private stripTriggers(raw: string): string {
    return raw
      .replace(
        /^(?:ở\s+)?(?:gần|quanh|xung quanh|cạnh|kế|khu vực|gần khu)\s+/i,
        '',
      )
      .trim();
  }

  /** Khoá cache: bỏ dấu, bỏ ký tự đặc biệt, gộp khoảng trắng. */
  normalizeAddress(raw: string): string {
    return deaccent(this.stripTriggers(raw))
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // context = phường/khu đã biết (Hướng A) để KHỬ NHẬP NHẰNG: "ĐH Công nghiệp"
  // + "Nhổn" -> "ĐH Công nghiệp, Nhổn, Hà Nội" giúp Nominatim chọn đúng nơi.
  private buildQuery(raw: string, context?: string): string {
    let base = this.stripTriggers(raw).trim();
    if (context) {
      const c = this.stripTriggers(context).trim();
      if (c && !deaccent(base).includes(deaccent(c))) base = `${base}, ${c}`;
    }
    return /ha\s*noi|hanoi/.test(deaccent(base)) ? base : `${base}, ${this.city}`;
  }

  // ---- Cache (AppSetting) ---------------------------------------------------

  private async readMap<T>(key: string): Promise<Record<string, T>> {
    try {
      const row = await this.prisma.appSetting.findUnique({ where: { key } });
      return (row?.value as Record<string, T> | null) ?? {};
    } catch {
      return {};
    }
  }

  private async writeMapEntry(
    key: string,
    field: string,
    value: unknown,
  ): Promise<void> {
    const map = await this.readMap<unknown>(key);
    map[field] = value;
    await this.prisma.appSetting.upsert({
      where: { key },
      update: { value: map as Prisma.InputJsonObject },
      create: { key, value: map as Prisma.InputJsonObject },
    });
  }

  /** Lấy bản ghi cache cho địa chỉ (không gọi mạng). */
  async getCached(raw: string): Promise<GeocodeCacheEntry | undefined> {
    const key = this.normalizeAddress(raw);
    if (!key) return undefined;
    const map = await this.readMap<GeocodeCacheEntry>(CACHE_KEY);
    return map[key];
  }

  // ---- HTTP (tách riêng để test mock được) ---------------------------------

  /**
   * Gọi HTTP có timeout. Tách thành method để test spy/mock, không đụng mạng thật.
   * Trả về { ok, status, data } hoặc ném lỗi khi timeout/mạng.
   */
  protected async httpFetch(
    url: string,
  ): Promise<{ ok: boolean; status: number; data: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
      });
      const data = res.ok ? await res.json() : undefined;
      return { ok: res.ok, status: res.status, data };
    } finally {
      clearTimeout(timer);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Xếp hàng để hai lần gọi mạng cách nhau ≥ minIntervalMs. */
  private async waitTurn(): Promise<void> {
    const prev = this.chain;
    let release!: () => void;
    this.chain = new Promise<void>((r) => (release = r));
    await prev;
    const gap = this.minIntervalMs - (Date.now() - this.lastCallAt);
    if (gap > 0) await this.sleep(gap);
    this.lastCallAt = Date.now();
    release();
  }

  // ---- Geocode chính --------------------------------------------------------

  /**
   * Phân giải một địa chỉ/điểm mốc -> toạ độ. Cache-first: đã có trong cache thì
   * KHÔNG gọi lại API (kể cả kết quả NOT_FOUND/AMBIGUOUS). Cache miss thì gọi
   * Nominatim (rate-limited, retry, timeout) rồi ghi cache.
   *
   * KHÔNG cache lỗi mạng/timeout (GEOCODE_FAILED) để lần sau còn thử lại.
   */
  async resolve(raw: string, contextHint?: string): Promise<GeocodeResolution> {
    const baseKey = this.normalizeAddress(raw);
    if (!baseKey) return { status: 'NOT_FOUND', fromCache: false };
    // Ngữ cảnh khác nhau -> khoá cache khác nhau (kết quả có thể khác).
    const key = contextHint
      ? `${baseKey} @ ${this.normalizeAddress(contextHint)}`
      : baseKey;

    const map = await this.readMap<GeocodeCacheEntry>(CACHE_KEY);
    if (map[key]) return { ...map[key], fromCache: true };

    if (!this.enabled) return { status: 'GEOCODE_FAILED', fromCache: false };

    let entry: GeocodeCacheEntry;
    try {
      entry = await this.queryNominatim(raw, contextHint);
    } catch (e) {
      this.logger.warn(`Geocode "${raw}" lỗi (không cache để thử lại sau): ${e}`);
      return { status: 'GEOCODE_FAILED', fromCache: false };
    }

    await this.writeMapEntry(CACHE_KEY, key, entry);
    return { ...entry, fromCache: false };
  }

  private buildUrl(raw: string, context?: string): string {
    const params = new URLSearchParams({
      q: this.buildQuery(raw, context),
      format: 'json',
      addressdetails: '0',
      limit: '5',
      countrycodes: 'vn',
      'accept-language': 'vi',
    });
    return `${this.baseUrl}/search?${params.toString()}`;
  }

  /** Gọi Nominatim với rate-limit + retry backoff. Ném lỗi nếu hết retry. */
  private async queryNominatim(
    raw: string,
    context?: string,
  ): Promise<GeocodeCacheEntry> {
    const url = this.buildUrl(raw, context);
    let lastErr: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) await this.sleep(500 * 2 ** (attempt - 1)); // backoff
      await this.waitTurn(); // đảm bảo ≤ 1 req/giây
      try {
        const res = await this.httpFetch(url);
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(`Nominatim HTTP ${res.status}`);
          continue; // đáng retry
        }
        if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
        return this.interpret(res.data);
      } catch (e) {
        lastErr = e; // timeout/mạng -> retry
      }
    }
    throw lastErr ?? new Error('geocode thất bại');
  }

  /** Diễn giải mảng kết quả Nominatim -> bản ghi cache (OK/AMBIGUOUS/NOT_FOUND). */
  private interpret(data: unknown): GeocodeCacheEntry {
    const now = new Date().toISOString();
    const arr = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
    const cands: (GeocodeCandidate & { importance: number })[] = arr
      .map((r) => ({
        displayName: String(r.display_name ?? ''),
        lat: Number(r.lat),
        lng: Number(r.lon),
        importance: Number(r.importance ?? 0),
      }))
      .filter((c) => isValidLatLng(c));

    if (cands.length === 0) {
      return { status: 'NOT_FOUND', geocoded_at: now, geocode_source: 'nominatim' };
    }

    cands.sort((a, b) => b.importance - a.importance);
    const top = cands[0];
    const clearWinner =
      cands.length === 1 || top.importance - cands[1].importance >= AMBIGUITY_GAP;

    if (!clearWinner) {
      return {
        status: 'AMBIGUOUS',
        geocoded_at: now,
        geocode_source: 'nominatim',
        candidates: cands
          .slice(0, 3)
          .map((c) => ({ displayName: c.displayName, lat: c.lat, lng: c.lng })),
      };
    }

    // CHỐT CHẶN ĐỘ THÔ: khi Nominatim không tìm ra địa chỉ cụ thể, nó hay lùi
    // về cả THÀNH PHỐ ("Hà Nội, Việt Nam"). Gán toạ độ tâm thành phố = khoảng
    // cách sai bét (bịa). Kết quả tới cấp thành phố/quốc gia có RẤT ÍT thành
    // phần địa chỉ -> coi như không tìm thấy, để fallback theo khu (không toạ độ sai).
    const parts = top.displayName
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length < 3) {
      return { status: 'NOT_FOUND', geocoded_at: now, geocode_source: 'nominatim' };
    }

    return {
      status: 'OK',
      latitude: top.lat,
      longitude: top.lng,
      geocoded_address: top.displayName,
      geocoded_at: now,
      geocode_source: 'nominatim',
    };
  }

  // ---- Toạ độ phòng (lưu ở CỘT DB rooms — nguồn sự thật) --------------------

  /** Ghi toạ độ đã phân giải vào bảng rooms. */
  async writeRoomCoords(
    roomCode: string,
    p: {
      lat: number;
      lng: number;
      displayName?: string;
      source: 'nominatim' | 'manual' | 'maps';
    },
  ): Promise<void> {
    await this.prisma.room.update({
      where: {
        organizationId_roomCode: { organizationId: DEFAULT_ORG_ID, roomCode },
      },
      data: {
        latitude: p.lat,
        longitude: p.lng,
        geocodedAddress: p.displayName ?? null,
        geocodedAt: new Date(),
        geocodeSource: p.source,
      },
    });
  }

  /**
   * Geocode một phòng (gọi mạng nếu cache miss) rồi GHI toạ độ vào DB. Thử địa
   * chỉ trước (kèm ngữ cảnh phường), không ra thì fallback theo phường (area).
   * Trả toạ độ hoặc undefined.
   */
  async geocodeRoom(room: {
    roomCode: string;
    address?: string | null;
    area: string;
  }): Promise<LatLng | undefined> {
    let r: GeocodeResolution = { status: 'NOT_FOUND', fromCache: false };
    if (room.address) r = await this.resolve(room.address, room.area);
    if (r.status !== 'OK') r = await this.resolve(room.area); // fallback phường
    if (r.status === 'OK' && r.latitude != null && r.longitude != null) {
      await this.writeRoomCoords(room.roomCode, {
        lat: r.latitude,
        lng: r.longitude,
        displayName: r.geocoded_address,
        source: 'nominatim',
      });
      return { lat: r.latitude, lng: r.longitude };
    }
    return undefined;
  }

  // ---- Toạ độ TỪ LINK GOOGLE MAPS trên bảng (nguồn chính xác nhất) ----------

  /** Follow 1 bước redirect, trả về URL đích (header Location). Tách để test mock. */
  protected async fetchRedirectLocation(
    url: string,
  ): Promise<string | undefined> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': this.userAgent },
      });
      const loc = res.headers.get('location');
      if (loc) return loc;
      return res.url && res.url !== url ? res.url : undefined;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Follow TOÀN BỘ redirect, trả URL cuối (bắt link goo.gl/maps -> .../@lat,lng/). */
  protected async fetchFinalUrl(url: string): Promise<string | undefined> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': this.userAgent },
      });
      return res.url || undefined;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Bóc toạ độ từ một link Google Maps. Link đầy đủ -> parse ngay; link rút gọn
   * (maps.app.goo.gl) -> follow redirect tối đa 3 bước rồi parse. Đây là NGUỒN
   * CHÍNH XÁC NHẤT vì là vị trí nhân viên tự ghim trên bảng.
   */
  async resolveMapsLink(
    url: string,
  ): Promise<{ latLng?: LatLng; address?: string }> {
    const direct = parseLatLngFromMapsUrl(url);
    if (direct) return { latLng: direct };

    // Đi từng chặng redirect, parse mỗi chặng (bắt "?q=lat,lng" của maps.app.goo.gl).
    // Nếu chặng nào ra "?q=địa chỉ chữ" (chia sẻ bằng search, không thả ghim) thì
    // giữ lại địa chỉ để geocode xấp xỉ về sau.
    let current = url;
    let address: string | undefined;
    for (let i = 0; i < 6; i++) {
      let loc: string | undefined;
      try {
        loc = await this.fetchRedirectLocation(current);
      } catch (e) {
        this.logger.warn(`Follow Maps link lỗi: ${e}`);
        break;
      }
      if (!loc) break;
      const ll = parseLatLngFromMapsUrl(loc);
      if (ll) return { latLng: ll };
      if (!address) address = extractQueryAddress(loc);
      current = loc;
    }

    // Fallback 1: follow toàn bộ chuỗi rồi parse URL cuối (bắt goo.gl/maps cũ ->
    // .../place/.../@lat,lng,zoom/).
    try {
      const finalUrl = await this.fetchFinalUrl(url);
      if (finalUrl) {
        const ll = parseLatLngFromMapsUrl(finalUrl);
        if (ll) return { latLng: ll };
        if (!address) address = extractQueryAddress(finalUrl);
      }
    } catch (e) {
      this.logger.warn(`Follow Maps link (final) lỗi: ${e}`);
    }

    // Không có toạ độ trong URL (link chia sẻ bằng SEARCH địa chỉ) -> trả địa
    // chỉ để geocode xấp xỉ. KHÔNG dùng staticmap trong HTML: trang bot của
    // Google trả map MẶC ĐỊNH -> toạ độ sai.
    return { address };
  }

  /**
   * Nhập toạ độ phòng TỪ LINK MAPS đã lưu ở map room_media (đọc từ bảng lúc
   * sync). Ghi vào cột DB với nguồn 'maps'. Ưu tiên nguồn này hơn geocode vì
   * chính xác hơn nhiều.
   */
  async importFromMediaLinks(): Promise<{
    total: number;
    imported: number;
    failed: number;
    fromMaps: number;
    fromAddress: number;
  }> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: 'room_media' },
    });
    const media =
      (row?.value as Record<string, { location?: string }> | null) ?? {};
    const entries = Object.entries(media).filter(([, m]) => m?.location);
    let imported = 0;
    let failed = 0;
    let fromMaps = 0;
    let fromAddress = 0;
    for (const [roomCode, m] of entries) {
      try {
        const link = m.location as string;
        const r = await this.resolveMapsLink(link);
        let pt: LatLng | undefined;
        let source: 'maps' | 'nominatim' | undefined;
        let displayName: string | undefined;
        if (r.latLng) {
          pt = r.latLng; // toạ độ ghim CHÍNH XÁC từ link
          source = 'maps';
          displayName = link;
        } else if (r.address) {
          // Link chia sẻ bằng ĐỊA CHỈ (không thả ghim) -> geocode xấp xỉ.
          const g = await this.resolve(r.address);
          if (g.status === 'OK' && g.latitude != null && g.longitude != null) {
            pt = { lat: g.latitude, lng: g.longitude };
            source = 'nominatim';
            displayName = g.geocoded_address ?? r.address;
          }
        }
        if (pt && source) {
          await this.writeRoomCoords(roomCode, {
            lat: pt.lat,
            lng: pt.lng,
            displayName,
            source,
          });
          imported++;
          if (source === 'maps') fromMaps++;
          else fromAddress++;
        } else {
          failed++;
        }
      } catch (e) {
        this.logger.warn(`Nhập toạ độ ${roomCode} lỗi: ${e}`);
        failed++;
      }
    }
    return { total: entries.length, imported, failed, fromMaps, fromAddress };
  }

  /** Nhân viên ghim toạ độ chính xác cho một phòng (nguồn 'manual'). */
  async pinRoom(roomCode: string, lat: number, lng: number): Promise<void> {
    if (!isValidLatLng({ lat, lng })) throw new Error('Toạ độ không hợp lệ');
    await this.writeRoomCoords(roomCode, { lat, lng, source: 'manual' });
  }

  /**
   * Geocode trước toạ độ mọi phòng CÒN TRỐNG CHƯA có toạ độ (chạy nền,
   * rate-limited). Phòng đã có latitude -> bỏ qua, KHÔNG gọi API.
   */
  async warmRooms(): Promise<{
    total: number;
    geocoded: number;
    failed: number;
  }> {
    const rooms = await this.prisma.room.findMany({
      where: { status: RoomStatus.AVAILABLE, latitude: null },
      select: { roomCode: true, address: true, area: true },
    });
    let geocoded = 0;
    let failed = 0;
    for (const r of rooms) {
      try {
        if (await this.geocodeRoom(r)) geocoded++;
        else failed++;
      } catch (e) {
        // Một phòng lỗi không được làm hỏng cả lô.
        this.logger.warn(`Warm phòng ${r.roomCode} lỗi: ${e}`);
        failed++;
      }
    }
    return { total: rooms.length, geocoded, failed };
  }
}
