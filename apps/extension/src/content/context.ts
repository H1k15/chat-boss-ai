import type { AiSuggestResponse } from '@cba/shared';

// Giữ ngữ cảnh của lần gợi ý gần nhất để hai nút "Lưu khách" / "Tạo lịch hẹn"
// dùng lại thông tin khách AI đã trích xuất (không bắt nhân viên gõ lại).
let ctx: {
  extracted: AiSuggestResponse['extracted'];
  facebookProfileId: string;
  customerId?: string; // điền sau khi đã lưu khách, để tạo lịch hẹn không lưu trùng
} | null = null;

export function setContext(res: AiSuggestResponse, facebookProfileId: string): void {
  ctx = { extracted: res.extracted, facebookProfileId };
}

export function getContext() {
  return ctx;
}

export function setSavedCustomerId(id: string): void {
  if (ctx) ctx.customerId = id;
}

// Dựng payload lưu khách từ thông tin đã trích xuất.
export function customerPayload(): Record<string, unknown> | null {
  if (!ctx) return null;
  const e = ctx.extracted;
  return {
    name: e.name,
    phone: e.phone,
    areaNeed: e.area,
    budgetMin: e.budgetMin,
    budgetMax: e.budgetMax,
    peopleCount: e.peopleCount,
    requirements: e.requirements,
    sourceProfileId:
      ctx.facebookProfileId && ctx.facebookProfileId !== 'unknown'
        ? ctx.facebookProfileId
        : undefined,
  };
}
