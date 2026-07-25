import { deaccent } from '../../../common/vietnamese';
import { DEFAULT_AREA_GROUPS } from './area-groups';
import { DEFAULT_LANDMARKS, Landmark } from './landmarks';

// Tên khu/phường đã biết (làm phẳng từ area-groups). Dùng để dò khu trực tiếp
// trong câu khách khi LLM trích xuất trả về rỗng. Sắp theo độ dài giảm dần để
// tên đặc trưng hơn ("Đức Diễn") được xét trước tên ngắn dễ trùng.
const KNOWN_AREAS = Array.from(new Set(DEFAULT_AREA_GROUPS.flat())).sort(
  (a, b) => b.length - a.length,
);

/**
 * Dò khu vực từ câu khách BẰNG CODE (không LLM) — lưới đỡ cho bước trích xuất
 * khi LLM bỏ sót khu (VD "còn phòng khu Phú Diễn" đôi lúc trả về null).
 *
 * Ưu tiên điểm mốc (đặc trưng, nhiều từ) trước, rồi tới tên khu/phường. Trả về
 * tên khu chuẩn hoặc undefined. Không bịa: chỉ khớp chuỗi có thật trong bảng.
 */
export function detectAreaFromText(
  text: string,
  landmarks: Landmark[] = DEFAULT_LANDMARKS,
): string | undefined {
  const t = deaccent(text);
  for (const lm of landmarks) {
    if (lm.keywords.some((k) => t.includes(deaccent(k)))) return lm.area;
  }
  for (const area of KNOWN_AREAS) {
    if (t.includes(deaccent(area))) return area;
  }
  return undefined;
}
