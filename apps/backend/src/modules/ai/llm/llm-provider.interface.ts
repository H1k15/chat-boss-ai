// Interface trừu tượng cho nhà cung cấp LLM.
// Cho phép đổi Claude <-> OpenAI chỉ bằng biến môi trường AI_PROVIDER.

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmJsonRequest {
  system: string;
  messages: LlmMessage[];
  /**
   * JSON schema mô tả cấu trúc output mong muốn (structured outputs).
   * Ràng buộc: mọi object phải có `additionalProperties: false` và liệt kê
   * ĐỦ field trong `required`. Field "tuỳ chọn" biểu diễn bằng `nullable()`
   * chứ không phải bỏ khỏi `required` — dùng `strictObject()` cho đúng.
   */
  jsonSchema: Record<string, unknown>;
  /** Tên schema — API cache schema đã biên dịch theo tên trong 24h. */
  schemaName: string;
  maxTokens?: number;
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

export interface LlmProvider {
  /**
   * Gọi model và ép trả về JSON đúng schema (structured outputs).
   * Ném lỗi nếu model không trả JSON hợp lệ.
   */
  completeJson<T = unknown>(req: LlmJsonRequest): Promise<T>;

  /** Gọi model trả về văn bản thuần (ít dùng — ưu tiên completeJson). */
  completeText(req: {
    system: string;
    messages: LlmMessage[];
    maxTokens?: number;
  }): Promise<string>;
}

// ============================ TIỆN ÍCH SCHEMA ============================
// Structured outputs bắt mọi field phải nằm trong `required`. Field tuỳ chọn
// vì thế khai báo là union với null, thay vì vắng mặt khỏi `required`.

/** Bọc schema thành dạng cho phép null (dùng cho field tuỳ chọn). */
export function nullable(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  return { anyOf: [schema, { type: 'null' }] };
}

/** Tạo object schema đúng chuẩn structured outputs (strict). */
export function strictObject(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

/**
 * Bỏ mọi giá trị null do `nullable()` sinh ra, để kết quả khớp kiểu TS
 * dùng optional (`field?: T`) thay vì `T | null`.
 */
export function stripNulls<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out as T;
}
