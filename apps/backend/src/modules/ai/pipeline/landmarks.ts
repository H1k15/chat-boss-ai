// TỪ ĐIỂN ĐIỂM MỐC -> KHU CHUẨN (Hướng A).
//
// Khách thường hỏi theo điểm mốc ("gần ĐH Công nghiệp", "gần bến xe Nước Ngầm",
// "gần đường Tam Trinh") thay vì tên khu có trong kho phòng. Bảng này dịch mốc
// đó thành tên KHU CHUẨN — một tên đã xuất hiện trong địa chỉ phòng hoặc trong
// area-groups.ts — để matcher (thuần logic, không LLM) tìm đúng phòng gần đó.
//
// Nguyên tắc: CODE tra bảng này, AI chỉ diễn đạt kết quả -> KHÔNG bịa khoảng
// cách/địa điểm, KHÔNG tự gọi Google Maps.
//
// So khớp: bỏ dấu (deaccent) rồi kiểm tra keyword là chuỗi con của câu khách.
// Keyword viết sẵn dạng KHÔNG DẤU, thường, nhiều từ để tránh khớp nhầm với từ
// tiếng Việt thông dụng (VD tránh "neu" vì trùng "nếu").
//
// ⚠️ CẦN REVIEW: phần map "mốc -> phường" do trợ lý soạn theo hiểu biết địa lý
// Hà Nội, KHÔNG chắc đúng 100%. Bạn (người rành khu vực) nên rà lại, nhất là
// các phường ranh giới. Map sai sẽ khiến AI gợi ý phòng KHÔNG thật sự gần mốc.
//
// Bao phủ tập trung quanh 2 cụm đang có phòng: Bắc Từ Liêm–Cầu Giấy (Đức Diễn)
// và Hoàng Mai (Lĩnh Nam). Mốc ở xa 2 cụm sẽ cho kết quả "khác khu" (trung thực).
//
// Admin ghi đè được qua AppSetting key "landmarks" (JSON: {area, keywords}[])
// mà KHÔNG cần sửa code.
export interface Landmark {
  /** Tên khu chuẩn để matcher dùng (phải trùng địa chỉ phòng hoặc area-groups). */
  area: string;
  /** Các cách khách hay gọi điểm mốc (khớp sau khi bỏ dấu, không phân biệt hoa/thường). */
  keywords: string[];
}

export const DEFAULT_LANDMARKS: Landmark[] = [
  // ======================================================================
  // CỤM 1 — BẮC TỪ LIÊM · NAM TỪ LIÊM · CẦU GIẤY (quanh Đức Diễn / Cầu Diễn)
  // ======================================================================

  // --- Trường đại học / cao đẳng ---
  { area: 'Nhổn', keywords: ['dh cong nghiep', 'dai hoc cong nghiep', 'cong nghiep ha noi', 'haui'] }, // ĐH Công nghiệp HN
  { area: 'Phú Diễn', keywords: ['dh tai nguyen', 'tai nguyen va moi truong', 'tai nguyen moi truong'] }, // ĐH Tài nguyên & Môi trường
  { area: 'Mai Dịch', keywords: ['dh thuong mai', 'dai hoc thuong mai', 'truong thuong mai'] }, // ĐH Thương Mại
  { area: 'Dịch Vọng', keywords: ['dh su pham', 'dai hoc su pham', 'su pham ha noi', 'truong su pham', 'su pham'] }, // ĐH Sư phạm HN
  { area: 'Mai Dịch', keywords: ['cao dang su pham', 'su pham trung uong'] }, // CĐ Sư phạm TW
  { area: 'Cầu Giấy', keywords: ['dai hoc quoc gia', 'dh quoc gia', 'quoc gia ha noi'] }, // ĐHQG HN
  { area: 'Cầu Giấy', keywords: ['dh ngoai ngu', 'dai hoc ngoai ngu', 'ulis'] }, // ĐH Ngoại ngữ
  { area: 'Dịch Vọng', keywords: ['hoc vien bao chi', 'bao chi tuyen truyen'] }, // HV Báo chí Tuyên truyền
  { area: 'Cổ Nhuế', keywords: ['mo dia chat', 'dh mo'] }, // ĐH Mỏ - Địa chất
  { area: 'Cổ Nhuế', keywords: ['dh dien luc', 'dai hoc dien luc'] }, // ĐH Điện lực
  { area: 'Cổ Nhuế', keywords: ['y te cong cong'] }, // ĐH Y tế Công cộng
  { area: 'Đông Ngạc', keywords: ['hoc vien tai chinh'] }, // HV Tài chính
  { area: 'Cầu Giấy', keywords: ['hoc vien cong nghe buu chinh', 'buu chinh vien thong'] }, // HV Bưu chính (cs Cầu Giấy)

  // --- Trường phổ thông ---
  { area: 'Xuân Đỉnh', keywords: ['thpt xuan dinh'] },
  { area: 'Phú Diễn', keywords: ['thpt nguyen thi minh khai'] },
  { area: 'Cầu Giấy', keywords: ['thpt cau giay', 'thpt yen hoa'] },
  { area: 'Mỹ Đình', keywords: ['thpt my dinh'] },

  // --- Ga metro tuyến 3 (Nhổn–Cầu Giấy) ---
  { area: 'Nhổn', keywords: ['ga nhon', 'metro nhon', 'ben xe nhon'] },
  { area: 'Phú Diễn', keywords: ['ga minh khai', 'ga phu dien'] },
  { area: 'Cầu Diễn', keywords: ['ga cau dien'] },
  { area: 'Mỹ Đình', keywords: ['ga le duc tho'] },
  { area: 'Cầu Giấy', keywords: ['ga dai hoc quoc gia', 'ga chua ha', 'ga cau giay'] },

  // --- Bến xe ---
  { area: 'Mỹ Đình', keywords: ['ben xe my dinh', 'bx my dinh'] },
  { area: 'Cầu Giấy', keywords: ['ben xe cau giay'] },

  // --- Trục đường chính ---
  { area: 'Cầu Diễn', keywords: ['ho tung mau'] },
  { area: 'Cầu Diễn', keywords: ['duong 32', 'ql32', 'quoc lo 32'] },
  { area: 'Cổ Nhuế', keywords: ['pham van dong'] },
  { area: 'Cổ Nhuế', keywords: ['tran cung'] },
  { area: 'Mỹ Đình', keywords: ['pham hung'] },
  { area: 'Mỹ Đình', keywords: ['le duc tho'] },
  { area: 'Mỹ Đình', keywords: ['le quang dao'] },
  { area: 'Mỹ Đình', keywords: ['nguyen co thach'] },
  { area: 'Mỹ Đình', keywords: ['ham nghi'] },
  { area: 'Cầu Diễn', keywords: ['tran huu duc'] },
  { area: 'Cầu Giấy', keywords: ['xuan thuy'] },
  { area: 'Nghĩa Đô', keywords: ['hoang quoc viet'] },
  { area: 'Dịch Vọng', keywords: ['nguyen phong sac'] },
  { area: 'Dịch Vọng', keywords: ['tran thai tong'] },
  { area: 'Dịch Vọng', keywords: ['duong duy tan'] },
  { area: 'Yên Hòa', keywords: ['trung kinh'] },
  { area: 'Yên Hòa', keywords: ['duong dinh nghe'] },
  { area: 'Yên Hòa', keywords: ['pham van bach'] },
  { area: 'Trung Hòa', keywords: ['tran duy hung'] },
  { area: 'Trung Hòa', keywords: ['nguyen thi dinh'] },
  { area: 'Trung Văn', keywords: ['to huu'] },
  { area: 'Trung Văn', keywords: ['dai lo thang long'] },
  { area: 'Mễ Trì', keywords: ['duong me tri', 'me tri ha', 'me tri thuong'] },
  { area: 'Tây Tựu', keywords: ['duong tay tuu'] },

  // --- Chợ / bệnh viện / TTTM / toà nhà mốc ---
  { area: 'Nhổn', keywords: ['cho nhon'] },
  { area: 'Cầu Diễn', keywords: ['cho cau dien'] },
  { area: 'Cầu Diễn', keywords: ['benh vien 19-8', 'vien 19-8', 'benh vien 198'] },
  { area: 'Cổ Nhuế', keywords: ['benh vien e', 'bv e'] },
  { area: 'Mỹ Đình', keywords: ['keangnam', 'landmark 72'] },
  { area: 'Mỹ Đình', keywords: ['san van dong my dinh', 'svd my dinh', 'san my dinh'] },
  { area: 'Mỹ Đình', keywords: ['the manor'] },
  { area: 'Mỹ Đình', keywords: ['toa nha song da'] },
  { area: 'Trung Hòa', keywords: ['big c thang long', 'bigc thang long', 'go thang long'] },
  { area: 'Trung Hòa', keywords: ['vincom tran duy hung'] },
  { area: 'Dịch Vọng', keywords: ['vincom cau giay'] },
  { area: 'Xuân Đỉnh', keywords: ['ciputra'] },
  { area: 'Xuân Đỉnh', keywords: ['lotte mall'] },

  // --- Khu đô thị / chung cư mốc ---
  { area: 'Cầu Diễn', keywords: ['goldmark city', 'goldmark'] },
  { area: 'Mỹ Đình', keywords: ['vinhomes gardenia', 'gardenia'] },
  { area: 'Mễ Trì', keywords: ['vinhomes green bay', 'green bay'] },
  { area: 'Mỹ Đình', keywords: ['my dinh pearl'] },
  { area: 'Cầu Diễn', keywords: ['iris garden'] },
  { area: 'Cổ Nhuế', keywords: ['handi resco'] },
  { area: 'Trung Văn', keywords: ['ecolife capitol'] },
  { area: 'Mỹ Đình', keywords: ['the emerald'] },

  // ======================================================================
  // CỤM 2 — HOÀNG MAI · RÌA HAI BÀ TRƯNG (quanh Lĩnh Nam)
  // ======================================================================

  // --- Trường đại học ---
  { area: 'Lĩnh Nam', keywords: ['kinh te ky thuat cong nghiep', 'uneti'] }, // ĐH Kinh tế - Kỹ thuật Công nghiệp (cs Lĩnh Nam)
  { area: 'Giáp Bát', keywords: ['kinh te quoc dan', 'dai hoc kinh te quoc dan'] }, // NEU
  { area: 'Giáp Bát', keywords: ['dh xay dung', 'dai hoc xay dung'] }, // ĐH Xây dựng
  { area: 'Vĩnh Tuy', keywords: ['kinh doanh va cong nghe', 'kinh doanh cong nghe'] }, // ĐH KD & Công nghệ

  // --- Trục đường chính ---
  { area: 'Mai Động', keywords: ['tam trinh', 'nguyen tam trinh'] },
  { area: 'Mai Động', keywords: ['kim nguu'] },
  { area: 'Lĩnh Nam', keywords: ['duong linh nam'] },
  { area: 'Vĩnh Hưng', keywords: ['duong vinh hung'] },
  { area: 'Vĩnh Tuy', keywords: ['minh khai hai ba trung', 'cau mai dong'] },
  { area: 'Vĩnh Tuy', keywords: ['nguyen khoai'] },
  { area: 'Vĩnh Tuy', keywords: ['lac trung'] },
  { area: 'Giáp Bát', keywords: ['giai phong'] },
  { area: 'Giáp Bát', keywords: ['kim dong'] },
  { area: 'Tương Mai', keywords: ['truong dinh'] },
  { area: 'Tương Mai', keywords: ['duong tan mai'] },
  { area: 'Tương Mai', keywords: ['nguyen duc canh'] },
  { area: 'Hoàng Văn Thụ', keywords: ['den lu'] },
  { area: 'Hoàng Liệt', keywords: ['nguyen huu tho'] },
  { area: 'Hoàng Liệt', keywords: ['linh duong'] },
  { area: 'Hoàng Liệt', keywords: ['linh dam', 'ban dao linh dam', 'hh linh dam'] },
  { area: 'Định Công', keywords: ['duong dinh cong', 'dinh cong ha'] },
  { area: 'Định Công', keywords: ['tran dien'] },
  { area: 'Kim Giang', keywords: ['duong kim giang'] },
  { area: 'Đại Kim', keywords: ['dai kim', 'kdt dai kim'] },
  { area: 'Yên Sở', keywords: ['phap van'] },
  { area: 'Yên Sở', keywords: ['cau thanh tri'] },
  { area: 'Thịnh Liệt', keywords: ['duong thinh liet'] },
  { area: 'Thịnh Liệt', keywords: ['giap nhi'] },

  // --- Bến xe / ga ---
  { area: 'Giáp Bát', keywords: ['ben xe giap bat', 'bx giap bat', 'ga giap bat'] },
  { area: 'Yên Sở', keywords: ['ben xe nuoc ngam', 'nuoc ngam'] },

  // --- Chợ / công viên / TTTM / KĐT mốc ---
  { area: 'Vĩnh Tuy', keywords: ['times city', 'vincom times'] },
  { area: 'Mai Động', keywords: ['cho mai dong'] },
  { area: 'Lĩnh Nam', keywords: ['cho linh nam'] },
  { area: 'Hoàng Văn Thụ', keywords: ['cho dau moi phia nam', 'cho den lu'] },
  { area: 'Yên Sở', keywords: ['cong vien yen so', 'gamuda'] },
  { area: 'Hoàng Liệt', keywords: ['ho linh dam'] },
  { area: 'Đại Kim', keywords: ['eco lake view'] },
  { area: 'Thịnh Liệt', keywords: ['dong tau'] },
  { area: 'Vĩnh Hưng', keywords: ['cho vinh hung'] },

  // ======================================================================
  // Mốc XA 2 cụm (để hệ thống nhận ra là "khác khu", trả lời trung thực)
  // ======================================================================
  { area: 'Bách Khoa', keywords: ['dai hoc bach khoa', 'dh bach khoa'] }, // HUST — cách Lĩnh Nam ~4km
];
