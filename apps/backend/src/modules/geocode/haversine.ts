// Tính khoảng cách giữa hai toạ độ BẰNG CODE (công thức Haversine).
// Model KHÔNG bao giờ được tự tính khoảng cách — mọi con số km đi ra từ đây.

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Khoảng cách đường chim bay giữa hai điểm, đơn vị km. Tất định, thuần toán học.
 * Dùng Math.min(1, ...) để chặn sai số dấu phẩy động khi hai điểm trùng nhau.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Toạ độ hợp lệ (số hữu hạn, trong biên độ trái đất). */
export function isValidLatLng(p?: Partial<LatLng> | null): p is LatLng {
  return (
    !!p &&
    typeof p.lat === 'number' &&
    typeof p.lng === 'number' &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}
