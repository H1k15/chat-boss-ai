import { Inject, Injectable } from '@nestjs/common';
import { CustomerIntent, ConversationTurn } from '@cba/shared';
import {
  LLM_PROVIDER,
  LlmProvider,
  strictObject,
} from '../llm/llm-provider.interface';
import {
  INTENT_SYSTEM,
  INTENT_CONV_TURNS,
  formatConversation,
} from '../prompts';
import { PHONE_REGEX } from './info-extractor.service';

// [1] Phân loại ý định khách.
// Có nhánh nhanh bằng keyword/regex trước khi gọi LLM để tiết kiệm chi phí.
@Injectable()
export class IntentClassifierService {
  constructor(@Inject(LLM_PROVIDER) private readonly llm: LlmProvider) {}

  async classify(conversation: ConversationTurn[]): Promise<CustomerIntent> {
    const lastCustomer = [...conversation]
      .reverse()
      .find((t) => t.role === 'customer');
    const raw = lastCustomer?.text || '';

    const fast = this.fastPath(raw);
    if (fast) return fast;

    // Nhánh LLM cho phần còn lại.
    const result = await this.llm.completeJson<{ intent: CustomerIntent }>({
      system: INTENT_SYSTEM,
      schemaName: 'customer_intent',
      messages: [
        { role: 'user', content: formatConversation(conversation, INTENT_CONV_TURNS) },
      ],
      jsonSchema: strictObject({
        intent: { type: 'string', enum: Object.values(CustomerIntent) },
      }),
      maxTokens: 128,
    });
    return result.intent ?? CustomerIntent.OTHER;
  }

  /**
   * Nhánh nhanh cho các case rõ ràng — không cần LLM.
   *
   * Thứ tự các nhánh là CÓ CHỦ Ý: SĐT ưu tiên tuyệt đối (lead nóng, phải đẩy
   * Telegram ngay), rồi tới ý định hành động (hẹn xem phòng) trước các câu hỏi
   * thông tin — vì "chiều nay qua xem phòng giá nhiêu?" phải rơi vào
   * WANT_VIEWING chứ không phải ASK_PRICE.
   */
  private fastPath(raw: string): CustomerIntent | null {
    if (PHONE_REGEX.test(raw)) return CustomerIntent.LEFT_PHONE;

    const text = raw.toLowerCase();
    if (/(xem phòng|đi xem|coi phòng|ghé xem|qua xem|dẫn xem)/.test(text))
      return CustomerIntent.WANT_VIEWING;
    if (/(còn phòng|còn ko|còn không|còn trống|hết phòng)/.test(text))
      return CustomerIntent.ASK_AVAILABILITY;
    if (/(bao nhiêu|giá|nhiêu tiền|mắc|rẻ|nhiu)/.test(text))
      return CustomerIntent.ASK_PRICE;
    if (/(địa chỉ|ở đâu|chỗ nào|khu nào|đường nào)/.test(text))
      return CustomerIntent.ASK_ADDRESS;
    if (/(ảnh|hình|video|clip)/.test(text)) return CustomerIntent.ASK_MEDIA;
    return null;
  }
}
