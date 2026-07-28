// Gói dịch vụ SaaS + giới hạn theo gói. Đơn giản, sửa số ở đây là đổi chính sách.
export interface Plan {
  key: string;
  label: string;
  maxUsers: number | null; // null = không giới hạn
  maxRooms: number | null;
  maxAiPerDay: number | null; // số gợi ý AI/ngày (chốt chi phí LLM)
}

export const PLANS: Record<string, Plan> = {
  free: { key: 'free', label: 'Miễn phí', maxUsers: 3, maxRooms: 30, maxAiPerDay: 100 },
  pro: { key: 'pro', label: 'Chuyên nghiệp', maxUsers: 20, maxRooms: 300, maxAiPerDay: 2000 },
  unlimited: {
    key: 'unlimited',
    label: 'Không giới hạn',
    maxUsers: null,
    maxRooms: null,
    maxAiPerDay: null,
  },
};

export const PLAN_KEYS = Object.keys(PLANS);

/** Gói của một org; gói lạ/thiếu -> free. */
export function planFor(key?: string | null): Plan {
  return (key && PLANS[key]) || PLANS.free;
}
