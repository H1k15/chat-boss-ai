// Gói dịch vụ SaaS + giới hạn theo gói. Đơn giản, sửa số ở đây là đổi chính sách.
export interface Plan {
  key: string;
  label: string;
  maxUsers: number | null; // số TÀI KHOẢN nhân viên tối đa (null = không giới hạn)
  maxRooms: number | null;
  maxAiPerDay: number | null; // số gợi ý AI/ngày (chốt chi phí LLM)
  // Số TÀI KHOẢN được đăng nhập ĐỒNG THỜI của org (mỗi tài khoản chỉ 1 thiết bị;
  // đăng nhập máy mới đá phiên cũ của chính nó). Vượt trần -> chặn đăng nhập tài
  // khoản mới. Nên đặt <= maxUsers. null = không giới hạn.
  maxSeats: number | null;
}

// Gói mặc định là "default" (KHÔNG gọi là miễn phí). Đổi số ở đây = đổi chính sách.
export const PLANS: Record<string, Plan> = {
  default: { key: 'default', label: 'Cơ bản', maxUsers: 3, maxRooms: 30, maxAiPerDay: 100, maxSeats: 3 },
  pro: { key: 'pro', label: 'Chuyên nghiệp', maxUsers: 20, maxRooms: 300, maxAiPerDay: 2000, maxSeats: 10 },
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
