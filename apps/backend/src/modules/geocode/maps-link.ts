import { isValidLatLng, LatLng } from './haversine';

// Bóc toạ độ (lat,lng) từ URL Google Maps — NGUỒN CHÍNH XÁC NHẤT vì đây là vị
// trí nhân viên tự ghim trên bảng, không phải đoán từ địa chỉ.
//
// Hỗ trợ các dạng URL đã "nở" (không còn rút gọn):
//   .../@21.05,105.75,17z/...            (toạ độ camera trên path)
//   ...?q=21.05,105.75                   (?q= / ll= / center= / destination= / daddr=)
//   ...!3d21.05!4d105.75                 (data param của place)
//   .../place/.../21.05,105.75           (toạ độ trên path)
//
// Link rút gọn (maps.app.goo.gl, goo.gl/maps) KHÔNG chứa toạ độ — phải follow
// redirect trước (làm ở GeocodeService.resolveMapsLink), rồi mới parse ở đây.

// Dấu phẩy giữa lat,lng đôi khi kèm "+" (khoảng trắng URL) -> cho phép ",\+?".
const PATTERNS: RegExp[] = [
  /@(-?\d{1,3}\.\d+),\+?(-?\d{1,3}\.\d+)/,
  /[?&](?:q|ll|center|destination|daddr|sll)=(-?\d{1,3}\.\d+),\+?(-?\d{1,3}\.\d+)/,
  /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/,
  // .../search|place|dir/LAT,+LNG (link "chia sẻ vị trí" nở ra dạng này).
  /\/(?:search|place|dir)\/(-?\d{1,3}\.\d+),\+?(-?\d{1,3}\.\d+)/,
  /\/(-?\d{1,3}\.\d+),\+?(-?\d{1,3}\.\d+)/,
];

export function parseLatLngFromMapsUrl(url: string): LatLng | undefined {
  if (!url) return undefined;
  for (const re of PATTERNS) {
    const m = url.match(re);
    if (m) {
      const p = { lat: Number(m[1]), lng: Number(m[2]) };
      if (isValidLatLng(p)) return p;
    }
  }
  return undefined;
}

/**
 * Bóc ĐỊA CHỈ CHỮ từ tham số q= của URL Maps (khi người dùng chia sẻ bằng cách
 * SEARCH địa chỉ chứ không thả ghim toạ độ). Trả về địa chỉ để geocode xấp xỉ.
 * Bỏ qua nếu q= thực ra là toạ độ (đã xử lý ở parseLatLngFromMapsUrl).
 */
export function extractQueryAddress(url: string): string | undefined {
  const m = url.match(/[?&]q=([^&]+)/);
  if (!m) return undefined;
  let q: string;
  try {
    q = decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
  } catch {
    return undefined;
  }
  if (/^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/.test(q)) return undefined; // là toạ độ
  return /[a-zA-ZÀ-ỹ]/.test(q) ? q : undefined; // phải có chữ cái = địa chỉ
}

/** Link Maps rút gọn cần follow redirect để lấy URL có toạ độ. */
export function isShortMapsLink(url: string): boolean {
  return /maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|maps\.google\.[a-z.]+\/(?:url|maps)?\?/.test(
    url,
  );
}
