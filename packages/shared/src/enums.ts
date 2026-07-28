// Enum dùng chung giữa backend, dashboard và extension.
// Ánh xạ 1-1 với enum trong prisma/schema.prisma.

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN', // chủ SaaS — quản lý mọi org (multi-tenant)
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  STAFF = 'STAFF',
}

export enum CustomerStatus {
  NEW = 'NEW', // Mới
  ASKING_INFO = 'ASKING_INFO', // Đang hỏi thông tin
  ADVISED = 'ADVISED', // Đã tư vấn phòng
  SENT_MEDIA = 'SENT_MEDIA', // Đã gửi ảnh/video
  ASKED_PHONE = 'ASKED_PHONE', // Đã xin số điện thoại
  HAS_PHONE = 'HAS_PHONE', // Đã có số điện thoại
  APPOINTED = 'APPOINTED', // Đã hẹn xem phòng
  VIEWED = 'VIEWED', // Đã xem phòng
  CONSIDERING = 'CONSIDERING', // Đang cân nhắc
  CLOSED = 'CLOSED', // Đã chốt
  NOT_SUITABLE = 'NOT_SUITABLE', // Không phù hợp
  NO_RESPONSE = 'NO_RESPONSE', // Không phản hồi
}

export enum Channel {
  INBOX = 'INBOX',
  COMMENT = 'COMMENT',
}

export enum CustomerIntent {
  ASK_AVAILABILITY = 'ASK_AVAILABILITY', // Còn phòng không
  ASK_PRICE = 'ASK_PRICE', // Hỏi giá
  ASK_ADDRESS = 'ASK_ADDRESS', // Hỏi địa chỉ
  ASK_UTILITIES = 'ASK_UTILITIES', // Hỏi tiện ích
  ASK_MEDIA = 'ASK_MEDIA', // Xin ảnh/video
  LEFT_PHONE = 'LEFT_PHONE', // Để lại SĐT
  WANT_VIEWING = 'WANT_VIEWING', // Muốn đi xem phòng
  GREETING = 'GREETING',
  SMALL_TALK = 'SMALL_TALK',
  IRRELEVANT = 'IRRELEVANT',
  OTHER = 'OTHER',
}

export enum RoomStatus {
  AVAILABLE = 'AVAILABLE', // Còn
  DEPOSITED = 'DEPOSITED', // Đã cọc
  RENTED = 'RENTED', // Đã thuê
}

export enum AppointmentStatus {
  SCHEDULED = 'SCHEDULED', // Đã hẹn
  ARRIVED = 'ARRIVED', // Đã đến
  CANCELLED = 'CANCELLED', // Hủy
  NO_SHOW = 'NO_SHOW', // Không đến
}

export enum CareTaskStatus {
  PENDING = 'PENDING',
  DONE = 'DONE',
  SNOOZED = 'SNOOZED',
  CANCELLED = 'CANCELLED',
}

export enum NotifyEvent {
  LEFT_PHONE = 'LEFT_PHONE',
  APPOINTMENT = 'APPOINTMENT',
  URGENT_CALL = 'URGENT_CALL',
  EOD_REPORT = 'EOD_REPORT',
  ROOM_LOW = 'ROOM_LOW',
  CARE_REMINDER = 'CARE_REMINDER',
}

// Hành động tiếp theo AI khuyến nghị nhân viên thực hiện.
export enum NextAction {
  ASK_INFO = 'ASK_INFO',
  SEND_MEDIA = 'SEND_MEDIA',
  ASK_PHONE = 'ASK_PHONE',
  BOOK_VIEWING = 'BOOK_VIEWING',
  HANDOFF = 'HANDOFF', // chuyển cho người thật xử lý
}
