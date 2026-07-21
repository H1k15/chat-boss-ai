// Tiện ích xử lý tiếng Việt dùng chung (so khớp khu vực, đọc header Excel...).

// Dải dấu thanh tổ hợp Unicode. Dựng bằng RegExp + chuỗi escape thay vì viết
// literal, vì literal chứa ký tự tổ hợp vô hình — dễ bị editor/công cụ format
// làm hỏng mà không ai nhìn ra.
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

/**
 * Bỏ dấu tiếng Việt và hạ chữ thường, để so khớp không phụ thuộc cách gõ.
 * "Gò Vấp" -> "go vap", "Quận Bình Thạnh" -> "quan binh thanh".
 *
 * Lưu ý "đ/Đ" phải xử lý riêng: nó không phải "d" cộng dấu tổ hợp nên NFD
 * không tách ra được. Bỏ sót thì "Đống Đa" sẽ không khớp "dong da".
 */
export function deaccent(s: string): string {
  return s
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/đ/g, 'd') // đ
    .replace(/Đ/g, 'D') // Đ
    .toLowerCase()
    .trim();
}

/** Chuẩn hoá tên cột/nhãn: bỏ dấu, gộp khoảng trắng. */
export function normalizeKey(s: string): string {
  return deaccent(s).replace(/\s+/g, ' ').trim();
}
