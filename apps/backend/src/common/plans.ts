// Gói dịch vụ SaaS + giới hạn theo gói. Đơn giản, sửa số ở đây là đổi chính sách.
export interface Plan {
  key: string;
  label: string;
  maxUsers: number | null; // số TÀI KHOẢN nhân viên tối đa (null = không giới hạn)
  maxRooms: number | null;
  maxAiPerDay: number | null; // số gợi ý AI/ngày (chốt chi phí LLM)
  // Trần TỔNG SỐ PHIÊN đăng nhập đồng thời của org. Một tài khoản chạy tối đa
  // MAX_SESSIONS_PER_USER phiên (dashboard + extension của CÙNG 1 máy), nên
  // maxSeats thường > maxUsers. Vượt trần -> chặn phiên mới. null = vô hạn.
  maxSeats: number | null;
}

// Số phiên tối đa mỗi tài khoản = số bề mặt trên MỘT máy (dashboard + extension).
// Đăng nhập vượt số này (mở đủ bề mặt ở máy mới) sẽ đá phiên cũ nhất -> hiệu ứng
// "1 tài khoản chỉ hoạt động trên 1 máy".
export const MAX_SESSIONS_PER_USER = 2;

// Gói mặc định là "default" (KHÔNG gọi là miễn phí). Đổi số ở đây = đổi chính sách.
export const PLANS: Record<string, Plan> = {
  default: { key: 'default', label: 'Cơ bản', maxUsers: 5, maxRooms: 30, maxAiPerDay: 100, maxSeats: 10 },
  pro: { key: 'pro', label: 'Chuyên nghiệp', maxUsers: 20, maxRooms: 300, maxAiPerDay: 2000, maxSeats: 25 },
  unlimited: {
    key: 'unlimited',
    label: 'Không giới hạn',
    maxUsers: null,
    maxRooms: null,
    maxAiPerDay: null,
    maxSeats: null,
  },
};

export const DEFAULT_PLAN = 'default';
export const PLAN_KEYS = Object.keys(PLANS);

/** Gói của một org; gói lạ/thiếu -> gói mặc định. */
export function planFor(key?: string | null): Plan {
  return (key && PLANS[key]) || PLANS.default;
}
