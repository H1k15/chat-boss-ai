import { deaccent } from '../../../common/vietnamese';

// Bóc NGÂN SÁCH từ câu khách BẰNG CODE (tất định) — không giao model.
// Bổ trợ/đè kết quả LLM khi tìm được mẫu rõ ràng.
//
// Bắt được: "3 triệu", "3tr", "3 củ", "3tr5", "2 triệu rưỡi", "tầm 3-3.5",
// "3-4 triệu", "dưới 3 triệu", "không quá 4 triệu", "trên 3 triệu", "khoảng 3tr".

export type BudgetOperator = 'lte' | 'gte' | 'range' | 'approx' | 'max';

export interface BudgetParse {
  budgetMin?: number; // VND
  budgetMax?: number; // VND
  operator?: BudgetOperator;
}

// Một "đơn vị triệu": triệu | tr | củ. "k"/"nghìn" KHÔNG tính là tiền phòng
// (tránh nhầm giá điện/nước).
const UNIT = '(?:trieu|tr|cu)';

/** "3" -> 3_000_000 ; "3.5"/"3,5" -> 3_500_000 */
function toVnd(numStr: string): number {
  return Math.round(parseFloat(numStr.replace(',', '.')) * 1_000_000);
}

export function parseBudget(text: string): BudgetParse {
  const t = deaccent(text);

  // 1) Khoảng: "3-4 triệu", "tam 3 den 3.5 trieu", "3 toi 4tr"
  const range = t.match(
    new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:-|den|toi|~)\\s*(\\d+(?:[.,]\\d+)?)\\s*${UNIT}`),
  );
  if (range) {
    const a = toVnd(range[1]);
    const b = toVnd(range[2]);
    return {
      budgetMin: Math.min(a, b),
      budgetMax: Math.max(a, b),
      operator: 'range',
    };
  }

  // 2) Tối đa: "duoi 3 trieu", "khong qua 4tr", "toi da 3 trieu", "<3tr"
  const lte = t.match(
    new RegExp(`(?:duoi|khong qua|toi da|toi thieu la|<=?|max)\\s*(\\d+(?:[.,]\\d+)?)\\s*${UNIT}`),
  );
  if (lte) return { budgetMax: toVnd(lte[1]), operator: 'lte' };

  // 3) Tối thiểu: "tren 3 trieu", "hon 3tr", "tu 3 trieu", ">3tr"
  const gte = t.match(
    new RegExp(`(?:tren|hon|>=?|min)\\s*(\\d+(?:[.,]\\d+)?)\\s*${UNIT}`),
  );
  if (gte) return { budgetMin: toVnd(gte[1]), operator: 'gte' };

  // 4) "3tr5" / "3 trieu 5" (5 = 500k) hoặc "3tr500"
  const frac = t.match(new RegExp(`(\\d+)\\s*${UNIT}\\s*(\\d{1,3})(?!\\d)`));
  if (frac) {
    const base = Number(frac[1]) * 1_000_000;
    const add = Number(frac[2]) * 10 ** (5 - frac[2].length + 1);
    return { budgetMax: base + add, operator: 'max' };
  }

  // 5) "X trieu ruoi" = X.5
  const ruoi = t.match(new RegExp(`(\\d+)\\s*${UNIT}\\s*ruoi`));
  if (ruoi) return { budgetMax: Number(ruoi[1]) * 1_000_000 + 500_000, operator: 'max' };

  // 6) "khoang/tam/co 3 trieu" -> xấp xỉ (±300k)
  const approx = t.match(
    new RegExp(`(?:khoang|tam|co|cỡ|co\\s)\\s*(\\d+(?:[.,]\\d+)?)\\s*${UNIT}`),
  );
  if (approx) {
    const v = toVnd(approx[1]);
    return { budgetMin: v - 300_000, budgetMax: v + 300_000, operator: 'approx' };
  }

  // 7) Số + đơn vị đứng một mình: "3 trieu", "3tr", "3 cu" -> coi là trần.
  const bare = t.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${UNIT}`));
  if (bare) return { budgetMax: toVnd(bare[1]), operator: 'max' };

  return {};
}
