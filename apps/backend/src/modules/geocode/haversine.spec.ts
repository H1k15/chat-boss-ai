import { haversineKm, isValidLatLng } from './haversine';

describe('haversineKm — khoảng cách tất định', () => {
  it('hai điểm trùng nhau -> 0 km', () => {
    const p = { lat: 21.0285, lng: 105.8542 };
    expect(haversineKm(p, p)).toBe(0);
  });

  it('Hà Nội -> TP.HCM ~ 1140 km (±30km)', () => {
    const hanoi = { lat: 21.0285, lng: 105.8542 };
    const hcm = { lat: 10.8231, lng: 106.6297 };
    const d = haversineKm(hanoi, hcm);
    expect(d).toBeGreaterThan(1110);
    expect(d).toBeLessThan(1170);
  });

  it('khoảng cách ngắn ~1.1km cho 0.01 độ vĩ', () => {
    const a = { lat: 21.05, lng: 105.76 };
    const b = { lat: 21.06, lng: 105.76 };
    const d = haversineKm(a, b);
    expect(d).toBeGreaterThan(1.0);
    expect(d).toBeLessThan(1.2);
  });

  it('isValidLatLng loại toạ độ sai', () => {
    expect(isValidLatLng({ lat: 21, lng: 105 })).toBe(true);
    expect(isValidLatLng({ lat: 200, lng: 105 })).toBe(false);
    expect(isValidLatLng(null)).toBe(false);
    expect(isValidLatLng({ lat: NaN, lng: 1 })).toBe(false);
  });
});
