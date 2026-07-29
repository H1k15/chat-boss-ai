import { deaccent } from '../../../common/vietnamese';

// Bóc NGÀY-GIỜ XEM PHÒNG từ câu khách BẰNG CODE (tất định), để auto-tạo lịch.
// Cần CẢ ngày lẫn giờ mới trả về Date; thiếu một trong hai -> null (code hỏi tiếp).

const PERIOD_HOUR: Record<string, number> = {
  sang: 9,
  trua: 12,
  chieu: 15,
  toi: 19,
};

/** Ngày (00:00 giờ địa phương) hoặc null. */
function parseDay(t: string, now: Date): Date | null {
  if (/hom nay/.test(t)) return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (/ngay mai|\bmai\b/.test(t))
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (/ngay kia/.test(t))
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
  const dmy = t.match(/(\d{1,2})\s*[/-]\s*(\d{1,2})/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      let dt = new Date(now.getFullYear(), m - 1, d);
      if (dt < now) dt = new Date(now.getFullYear() + 1, m - 1, d);
      return dt;
    }
  }
  return null;
}

/** Giờ trong ngày (0-23) hoặc null. */
function parseHour(t: string): number | null {
  // "3h", "15h", "3 gio", "9h30" (bỏ phút cho đơn giản)
  const hm = t.match(/(\d{1,2})\s*(?:h|gio)(?:\s*\d{1,2})?/);
  if (hm) {
    let h = Number(hm[1]);
    // "3h chiều" / "7h tối" -> +12 nếu đang <12 và có buổi chiều/tối.
    if (h <= 11 && /(chieu|toi)/.test(t)) h += 12;
    if (h >= 0 && h <= 23) return h;
  }
  for (const [k, h] of Object.entries(PERIOD_HOUR)) {
    if (new RegExp(`\\b${k}\\b`).test(t)) return h;
  }
  return null;
}

export function parseViewingDateTime(
  text: string,
  now: Date = new Date(),
): Date | null {
  const t = deaccent(text);
  const day = parseDay(t, now);
  if (!day) return null;
  const hour = parseHour(t);
  if (hour == null) return null;
  day.setHours(hour, 0, 0, 0);
  return day;
}
