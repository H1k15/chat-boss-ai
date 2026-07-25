// Cụm khu vực LÂN CẬN nhau — dùng khi khách hỏi một khu mà kho chưa có phòng
// đúng khu đó: ưu tiên gợi ý phòng trong cùng cụm (đi lại vài km) thay vì
// phòng ở đầu kia thành phố.
//
// Admin có thể ghi đè qua AppSetting key "area_groups" (Json: string[][])
// mà không cần sửa code. So khớp bằng deaccent + substring hai chiều, nên
// phòng ghi "Nhà 16 ngõ 23 ngách 29 Đức Diễn" vẫn nhận ra thuộc "Đức Diễn".
//
// LƯU Ý: hai cụm dưới bao quanh 2 khu vực bạn ĐANG có phòng (Đức Diễn khu Bắc
// Từ Liêm–Cầu Giấy, và Lĩnh Nam khu Hoàng Mai). Mốc trong landmarks.ts map về
// các phường ở đây để tính "gần". Khi mở rộng sang khu mới, thêm cụm mới ở đây.
export const DEFAULT_AREA_GROUPS: string[][] = [
  // ===== Cụm 1: Bắc Từ Liêm – Nam Từ Liêm – Cầu Giấy (quanh Đức Diễn/Cầu Diễn) =====
  [
    'Phú Diễn',
    'Đức Diễn',
    'Phúc Diễn',
    'Cầu Diễn',
    'Kiều Mai',
    'Văn Trì',
    'Nhổn',
    'Xuân Phương',
    'Minh Khai', // Minh Khai Bắc Từ Liêm (ga metro), không phải Minh Khai Hai Bà Trưng
    'Tây Tựu',
    'Cổ Nhuế',
    'Xuân Đỉnh',
    'Đông Ngạc',
    'Mai Dịch',
    'Mỹ Đình',
    'Mễ Trì',
    'Trung Văn',
    'Cầu Giấy',
    'Dịch Vọng',
    'Nghĩa Đô',
    'Nghĩa Tân',
    'Yên Hòa',
    'Trung Hòa',
  ],
  // ===== Cụm 2: Hoàng Mai – rìa Hai Bà Trưng (quanh Lĩnh Nam) =====
  [
    'Lĩnh Nam',
    'Vĩnh Hưng',
    'Mai Động',
    'Tân Mai',
    'Yên Sở',
    'Hoàng Văn Thụ',
    'Giáp Bát',
    'Tương Mai',
    'Hoàng Liệt',
    'Đại Kim',
    'Định Công',
    'Thịnh Liệt',
    'Vĩnh Tuy',
    'Đền Lừ',
    'Pháp Vân',
    'Kim Giang',
  ],
];
