import { parseViewingDateTime } from './viewing-parser';

describe('parseViewingDateTime — ngày+giờ xem phòng', () => {
  const now = new Date(2026, 6, 15, 10, 0); // thứ Tư 2026-07-15 10:00

  it('"mai chiều" -> 16/7 15:00', () => {
    const d = parseViewingDateTime('mai chiều mình qua', now)!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(16);
    expect(d.getHours()).toBe(15);
  });

  it('"hôm nay 7h tối" -> 15/7 19:00', () => {
    const d = parseViewingDateTime('hôm nay 7h tối nhé', now)!;
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(19);
  });

  it('"mai 15h" -> 16/7 15:00', () => {
    const d = parseViewingDateTime('mai 15h', now)!;
    expect(d.getDate()).toBe(16);
    expect(d.getHours()).toBe(15);
  });

  it('chỉ có ngày, thiếu giờ -> null', () => {
    expect(parseViewingDateTime('mai mình qua', now)).toBeNull();
  });

  it('chỉ có giờ, thiếu ngày -> null', () => {
    expect(parseViewingDateTime('chiều nhé', now)).toBeNull();
  });
});
