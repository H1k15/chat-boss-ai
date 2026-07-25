import { parseDistanceQuery } from './distance-parser';

describe('parseDistanceQuery — bóc yêu cầu khoảng cách (không dùng model)', () => {
  it('"trong bán kính 3 km" -> radiusKm 3, within', () => {
    const q = parseDistanceQuery('cho em phòng trong bán kính 3 km quanh trường');
    expect(q.radiusKm).toBe(3);
    expect(q.distanceRequirement).toBe('within');
  });

  it('"bán kính 500 m" -> 0.5 km', () => {
    const q = parseDistanceQuery('bán kính 500 m là được');
    expect(q.radiusKm).toBe(0.5);
  });

  it('"cách không quá 2 km" -> maxDistanceKm 2, within', () => {
    const q = parseDistanceQuery('phòng cách không quá 2 km ạ');
    expect(q.maxDistanceKm).toBe(2);
    expect(q.distanceRequirement).toBe('within');
  });

  it('"gần Đại học Bách Khoa" -> near + targetLocation', () => {
    const q = parseDistanceQuery('còn phòng gần Đại học Bách Khoa không');
    expect(q.distanceRequirement).toBe('near');
    expect(q.targetLocation?.toLowerCase()).toContain('bách khoa');
    expect(q.radiusKm).toBeUndefined();
  });

  it('"quanh khu vực Cầu Giấy" -> around', () => {
    const q = parseDistanceQuery('em muốn thuê quanh khu vực Cầu Giấy');
    expect(q.distanceRequirement).toBe('around');
    expect(q.targetLocation?.toLowerCase()).toContain('cầu giấy');
  });

  it('"đi xe máy khoảng 10 phút" -> motorbike + maxDistance suy ra', () => {
    const q = parseDistanceQuery('đi xe máy khoảng 10 phút tới chỗ làm');
    expect(q.transportMode).toBe('motorbike');
    expect(q.derivedFromMinutes).toBe(10);
    // 18 km/h * 10/60 = 3.0 km
    expect(q.maxDistanceKm).toBeCloseTo(3.0, 1);
    expect(q.distanceRequirement).toBe('within');
  });

  it('"gần Times City trong bán kính 3 km" -> targetLocation sạch + radius', () => {
    const q = parseDistanceQuery('còn phòng gần Times City trong bán kính 3 km không');
    expect(q.radiusKm).toBe(3);
    expect(q.targetLocation).toBe('Times City');
  });

  it('câu không nói khoảng cách -> none', () => {
    const q = parseDistanceQuery('còn phòng 3 triệu không shop');
    expect(q.distanceRequirement).toBe('none');
    expect(q.radiusKm).toBeUndefined();
    expect(q.maxDistanceKm).toBeUndefined();
  });
});
