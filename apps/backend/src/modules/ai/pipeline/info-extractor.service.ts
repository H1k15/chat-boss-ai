import { Inject, Injectable } from '@nestjs/common';
import { ConversationTurn, ExtractedInfo } from '@cba/shared';
import {
  LLM_PROVIDER,
  LlmProvider,
  nullable,
  strictObject,
  stripNulls,
} from '../llm/llm-provider.interface';
import { EXTRACT_SYSTEM, formatConversation } from '../prompts';
import { detectAreaFromText } from './area-detect';
import { parseDistanceQuery } from '../../geocode/distance-parser';

/**
 * Regex số điện thoại di động Việt Nam. Chấp nhận dấu cách/chấm phân tách.
 *
 * Lookbehind/lookahead chặn số dài hơn 10 chữ số lọt lưới — nếu không, một
 * chuỗi như mã đơn hàng "0987654321000" sẽ bị cắt 10 số đầu và lưu nhầm thành
 * SĐT khách, kéo theo một thông báo Telegram sai.
 */
export const PHONE_REGEX =
  /(?<![\d])(0|\+84|84)[\s.]?(3|5|7|8|9)([\s.]?\d){8}(?![\d])/;

/** Danh sách mã yêu cầu hợp lệ — dùng chung với RoomMatcher. */
export const REQUIREMENT_CODES = [
  'gac',
  'wc_rieng',
  'may_lanh',
  'tu_lanh',
  'nem',
  'gio_tu_do',
  'de_xe',
  'thu_cung',
] as const;

// [2] Trích xuất thông tin khách.
// SĐT dùng regex (không giao cho LLM để tránh sai số). Phần còn lại dùng LLM.
@Injectable()
export class InfoExtractorService {
  constructor(@Inject(LLM_PROVIDER) private readonly llm: LlmProvider) {}

  extractPhone(text: string): string | undefined {
    const m = text.match(PHONE_REGEX);
    if (!m) return undefined;
    // Chuẩn hoá: bỏ ký tự không phải số, đưa +84/84 -> 0.
    let digits = m[0].replace(/\D/g, '');
    if (digits.startsWith('84')) digits = '0' + digits.slice(2);
    if (!digits.startsWith('0')) digits = '0' + digits;
    return digits.slice(0, 10);
  }

  async extract(
    conversation: ConversationTurn[],
    known?: ExtractedInfo,
  ): Promise<ExtractedInfo> {
    // Chỉ dò SĐT trong lời KHÁCH — nếu quét cả lượt nhân viên thì số hotline
    // nhân viên gửi đi sẽ bị lưu ngược lại thành SĐT của khách.
    const customerText = conversation
      .filter((t) => t.role === 'customer')
      .map((t) => t.text)
      .join('\n');
    const phone = this.extractPhone(customerText);

    const raw = await this.llm.completeJson<Record<string, unknown>>({
      system: EXTRACT_SYSTEM,
      schemaName: 'customer_info',
      messages: [{ role: 'user', content: formatConversation(conversation) }],
      jsonSchema: strictObject({
        name: nullable({ type: 'string' }),
        area: nullable({ type: 'string' }),
        budgetMin: nullable({ type: 'integer' }),
        budgetMax: nullable({ type: 'integer' }),
        peopleCount: nullable({ type: 'integer' }),
        moveInDate: nullable({ type: 'string' }),
        requirements: nullable({
          type: 'array',
          items: { type: 'string', enum: [...REQUIREMENT_CODES] },
        }),
      }),
      maxTokens: 512,
    });

    const fromLlm = stripNulls(raw) as ExtractedInfo;
    // Lưới đỡ: LLM đôi khi bỏ sót khu ("khu Phú Diễn" -> null) hoặc trả về giá
    // trị RÁC ("3km", "2 triệu"). Loại rác rồi dò khu bằng CODE trên câu khách.
    const llmArea = this.plausibleArea(fromLlm.area) ? fromLlm.area : undefined;
    const area = llmArea ?? detectAreaFromText(customerText);

    // Yêu cầu KHOẢNG CÁCH: bóc HOÀN TOÀN bằng code (regex tất định) — model
    // không tham gia tính/đoán khoảng cách. Việc lọc theo bán kính làm ở matcher.
    const dq = parseDistanceQuery(customerText);
    const distance: Partial<ExtractedInfo> = {
      targetLocation: dq.targetLocation ?? area,
      radiusKm: dq.radiusKm,
      maxDistanceKm: dq.maxDistanceKm,
      distanceRequirement: dq.distanceRequirement,
      transportMode: dq.transportMode,
    };

    // Merge: thông tin mới không được ghi đè thông tin đã biết bằng rỗng.
    return this.merge(known, {
      ...fromLlm,
      area,
      ...distance,
      phone: phone ?? known?.phone,
    });
  }

  /** Loại giá trị "khu vực" rác từ LLM (số/đơn vị: "3km", "2 triệu", "10 phút"). */
  private plausibleArea(a?: string): boolean {
    if (!a) return false;
    const t = a.trim();
    if (t.length < 2) return false;
    if (/^\d/.test(t)) return false; // bắt đầu bằng số -> không phải tên khu
    if (/\d\s*(km|m|phút|phut|triệu|trieu|tr|k)\b/i.test(t)) return false;
    return true;
  }

  private merge(a?: ExtractedInfo, b?: ExtractedInfo): ExtractedInfo {
    const out: ExtractedInfo = { ...(a || {}) };
    for (const [k, v] of Object.entries(b || {})) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      if (typeof v === 'string' && v.trim() === '') continue;
      (out as Record<string, unknown>)[k] = v;
    }
    return out;
  }
}
