import { deaccent } from '../../../common/vietnamese';

// Bóc THỜI GIAN CHUYỂN VÀO từ câu khách BẰNG CODE (tất định). Ngày tương đối
// ("cuối tháng", "đầu tháng sau") được quy về ngày cụ thể theo `now` truyền vào
// (mặc định new Date() của hệ thống) -> test được vì `now` inject được.

export type MoveInIntent =
  | 'immediate' // vào ngay / cần gấp
  | 'this_month' // trong tháng này
  | 'month_end' // cuối tháng này
  | 'next_month' // đầu/tháng sau
  | 'weekend' // cuối tuần
  | 'after_tet' // sau Tết (không suy được ngày chính xác)
  | 'specific' // có ngày cụ thể
  | 'flexible'; // linh hoạt / chưa rõ

export interface MoveInParse {
  moveInDate?: string; // ISO YYYY-MM-DD (mốc sớm nhất)
  moveInIntent?: MoveInIntent;
}

// Định dạng theo giờ ĐỊA PHƯƠNG (không dùng toISOString -> tránh lệch -1 ngày
// khi máy ở múi giờ +07).
const iso = (d: Date): string => {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};
const addDays = (d: Date, n: number): Date => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const lastDayOfMonth = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0);
const firstDayNextMonth = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth() + 1, 1);

export function parseMoveIn(text: string, now: Date = new Date()): MoveInParse {
  const t = deaccent(text);

  // Vào ngay / cần gấp -> hôm nay.
  if (/vao ngay|vao luon|can gap|dang can ngay|can luon|o ngay|don ngay|chuyen ngay|gap/.test(t)) {
    return { moveInDate: iso(now), moveInIntent: 'immediate' };
  }
  if (/hom nay|ngay hom nay/.test(t)) {
    return { moveInDate: iso(now), moveInIntent: 'specific' };
  }
  if (/ngay mai|hom sau/.test(t)) {
    return { moveInDate: iso(addDays(now, 1)), moveInIntent: 'specific' };
  }
  if (/cuoi thang nay|cuoi thang/.test(t)) {
    return { moveInDate: iso(lastDayOfMonth(now)), moveInIntent: 'month_end' };
  }
  if (/dau thang sau|dau thang toi|thang sau|thang toi/.test(t)) {
    return { moveInDate: iso(firstDayNextMonth(now)), moveInIntent: 'next_month' };
  }
  if (/dau thang nay|dau thang/.test(t)) {
    // "đầu tháng" khi đang giữa/cuối tháng thường ám chỉ đầu tháng SAU.
    const target = now.getDate() > 5 ? firstDayNextMonth(now) : now;
    return { moveInDate: iso(target), moveInIntent: 'this_month' };
  }
  if (/cuoi tuan/.test(t)) {
    // Thứ 7 gần nhất (getDay: 0=CN..6=T7).
    const daysToSat = (6 - now.getDay() + 7) % 7 || 7;
    return { moveInDate: iso(addDays(now, daysToSat)), moveInIntent: 'weekend' };
  }
  if (/sau tet|ra tet/.test(t)) {
    return { moveInIntent: 'after_tet' }; // không suy ngày chính xác -> để trống
  }

  // Ngày cụ thể: "ngay 20", "20/8", "15 thang 8"
  const dmy = t.match(/(\d{1,2})\s*[\/\-]\s*(\d{1,2})(?:\s*[\/\-]\s*(\d{2,4}))?/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const year = dmy[3]
        ? Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3])
        : now.getFullYear();
      let d = new Date(year, month - 1, day);
      if (!dmy[3] && d < now) d = new Date(year + 1, month - 1, day); // đã qua -> năm sau
      return { moveInDate: iso(d), moveInIntent: 'specific' };
    }
  }
  const dayOnly = t.match(/ngay (\d{1,2})(?!\d)/);
  if (dayOnly) {
    const day = Number(dayOnly[1]);
    if (day >= 1 && day <= 31) {
      let d = new Date(now.getFullYear(), now.getMonth(), day);
      if (d < now) d = new Date(now.getFullYear(), now.getMonth() + 1, day);
      return { moveInDate: iso(d), moveInIntent: 'specific' };
    }
  }

  return {};
}
