// TẠM THỜI cho Đợt 1 multi-tenancy: hệ mới chỉ có MỘT org mặc định. Các truy vấn
// theo KHOÁ KÉP (organizationId_roomCode, organizationId_dedupeKey...) cần
// organizationId — Đợt 1 dùng hằng này.
//
// ĐỢT 2 sẽ thay mọi chỗ dùng DEFAULT_ORG_ID bằng organizationId lấy từ tenant
// context (JWT) qua Prisma extension, rồi xoá hằng này.
export const DEFAULT_ORG_ID = 'org_seed_default';
