import { parseLatLngFromMapsUrl, extractQueryAddress } from './maps-link';

describe('parseLatLngFromMapsUrl — bóc toạ độ từ URL Google Maps', () => {
  it('dạng ?q=lat,lng (link goo.gl đã nở)', () => {
    const p = parseLatLngFromMapsUrl(
      'https://maps.google.com?q=21.0505899,105.7510149&hl=vi-VN',
    );
    expect(p).toEqual({ lat: 21.0505899, lng: 105.7510149 });
  });

  it('dạng @lat,lng,zoom trên path', () => {
    const p = parseLatLngFromMapsUrl(
      'https://www.google.com/maps/place/ABC/@21.0333,105.85,17z/data=x',
    );
    expect(p?.lat).toBeCloseTo(21.0333, 4);
    expect(p?.lng).toBeCloseTo(105.85, 4);
  });

  it('dạng maps/search/LAT,+LNG (link chia sẻ vị trí nở ra)', () => {
    const p = parseLatLngFromMapsUrl(
      'https://www.google.com/maps/search/20.984498,+105.883534?entry=tts',
    );
    expect(p).toEqual({ lat: 20.984498, lng: 105.883534 });
  });

  it('dạng !3dlat!4dlng', () => {
    const p = parseLatLngFromMapsUrl(
      'https://www.google.com/maps/place/X/data=!3m1!4b1!3d20.995!4d105.867',
    );
    expect(p).toEqual({ lat: 20.995, lng: 105.867 });
  });

  it('URL không có toạ độ -> undefined', () => {
    expect(
      parseLatLngFromMapsUrl('https://maps.app.goo.gl/ebgw6Bep1nXn8PD86'),
    ).toBeUndefined();
    expect(parseLatLngFromMapsUrl('')).toBeUndefined();
  });

  it('loại toạ độ vô lý', () => {
    expect(
      parseLatLngFromMapsUrl('https://maps.google.com?q=999.0,105.0'),
    ).toBeUndefined();
  });
});

describe('extractQueryAddress — bóc địa chỉ chữ từ q= (chia sẻ bằng search)', () => {
  it('q= là địa chỉ chữ -> trả địa chỉ (giải mã)', () => {
    const a = extractQueryAddress(
      'https://maps.google.com?q=23%2F72%2F39+%C4%90%E1%BB%A9c+Di%E1%BB%85n,+Ph%C3%BAc+Di%E1%BB%85n,+H%C3%A0+N%E1%BB%99i&ftid=x',
    );
    expect(a).toContain('Đức Diễn');
    expect(a).toContain('Phúc Diễn');
  });

  it('q= là toạ độ -> undefined (để parseLatLng xử lý)', () => {
    expect(
      extractQueryAddress('https://maps.google.com?q=21.05,105.75'),
    ).toBeUndefined();
  });

  it('không có q= -> undefined', () => {
    expect(
      extractQueryAddress('https://maps.app.goo.gl/abc123'),
    ).toBeUndefined();
  });
});
