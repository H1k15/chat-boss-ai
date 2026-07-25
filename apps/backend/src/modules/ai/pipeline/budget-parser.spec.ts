import { parseBudget } from './budget-parser';

describe('parseBudget — ngân sách tất định', () => {
  it('"3 triệu" -> max 3tr', () => {
    expect(parseBudget('mình cần phòng 3 triệu')).toMatchObject({
      budgetMax: 3_000_000,
      operator: 'max',
    });
  });
  it('"3tr" và "3 củ" -> 3tr', () => {
    expect(parseBudget('tầm 3tr thôi').budgetMax).toBeGreaterThan(0);
    expect(parseBudget('3 củ').budgetMax).toBe(3_000_000);
  });
  it('"3-4 triệu" -> range 3..4tr', () => {
    expect(parseBudget('khoảng 3-4 triệu')).toMatchObject({
      budgetMin: 3_000_000,
      budgetMax: 4_000_000,
      operator: 'range',
    });
  });
  it('"dưới 3 triệu" -> lte', () => {
    expect(parseBudget('phòng dưới 3 triệu')).toMatchObject({
      budgetMax: 3_000_000,
      operator: 'lte',
    });
  });
  it('"không quá 4 triệu" -> lte 4tr', () => {
    expect(parseBudget('không quá 4 triệu nhé')).toMatchObject({
      budgetMax: 4_000_000,
      operator: 'lte',
    });
  });
  it('"trên 3 triệu" -> gte', () => {
    expect(parseBudget('tầm trên 3 triệu')).toMatchObject({
      budgetMin: 3_000_000,
      operator: 'gte',
    });
  });
  it('"3tr5" -> 3.5tr', () => {
    expect(parseBudget('3tr5').budgetMax).toBe(3_500_000);
  });
  it('"2 triệu rưỡi" -> 2.5tr', () => {
    expect(parseBudget('2 triệu rưỡi').budgetMax).toBe(2_500_000);
  });
  it('"khoảng 3tr" -> approx ±300k', () => {
    const r = parseBudget('khoảng 3 triệu');
    expect(r.operator).toBe('approx');
    expect(r.budgetMin).toBe(2_700_000);
    expect(r.budgetMax).toBe(3_300_000);
  });
  it('không nói giá -> rỗng', () => {
    expect(parseBudget('còn phòng không shop')).toEqual({});
  });
});
