import { parseMoveIn } from './movein-parser';

describe('parseMoveIn — thời gian chuyển vào tất định', () => {
  // Cố định "now" = thứ Tư 2026-07-15 để test lặp lại được.
  const now = new Date(2026, 6, 15); // tháng 7 (0-based=6), ngày 15

  it('"vào ngay" -> hôm nay + intent immediate', () => {
    expect(parseMoveIn('cần vào ngay', now)).toEqual({
      moveInDate: '2026-07-15',
      moveInIntent: 'immediate',
    });
  });
  it('"cần gấp" -> immediate', () => {
    expect(parseMoveIn('mình đang cần gấp', now).moveInIntent).toBe('immediate');
  });
  it('"cuối tháng" -> ngày cuối tháng 7', () => {
    expect(parseMoveIn('cuối tháng vào', now)).toEqual({
      moveInDate: '2026-07-31',
      moveInIntent: 'month_end',
    });
  });
  it('"đầu tháng sau" -> 01 tháng 8', () => {
    expect(parseMoveIn('đầu tháng sau chuyển', now)).toEqual({
      moveInDate: '2026-08-01',
      moveInIntent: 'next_month',
    });
  });
  it('"tháng sau" -> tháng 8', () => {
    expect(parseMoveIn('chắc tháng sau', now).moveInIntent).toBe('next_month');
  });
  it('"ngày mai" -> 16/7', () => {
    expect(parseMoveIn('ngày mai dọn', now).moveInDate).toBe('2026-07-16');
  });
  it('"20/8" -> ngày cụ thể', () => {
    expect(parseMoveIn('vào 20/8', now).moveInDate).toBe('2026-08-20');
  });
  it('"sau Tết" -> intent, không có ngày', () => {
    const r = parseMoveIn('chắc sau Tết', now);
    expect(r.moveInIntent).toBe('after_tet');
    expect(r.moveInDate).toBeUndefined();
  });
  it('không nói thời gian -> rỗng', () => {
    expect(parseMoveIn('phòng 3 triệu ở Cầu Diễn', now)).toEqual({});
  });
});
