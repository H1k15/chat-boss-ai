import { Inject, Injectable } from '@nestjs/common';
import {
  ConversationTurn,
  CustomerIntent,
  ExtractedInfo,
  MatchedRoom,
  NextAction,
} from '@cba/shared';
import {
  LLM_PROVIDER,
  LlmProvider,
  strictObject,
} from '../llm/llm-provider.interface';
import {
  buildCareSystem,
  buildReplySystem,
  formatConversation,
} from '../prompts';

// [4] Sinh 2-3 gợi ý câu trả lời — chỉ dùng dữ liệu phòng đã match.
@Injectable()
export class ReplyGeneratorService {
  constructor(@Inject(LLM_PROVIDER) private readonly llm: LlmProvider) {}

  async generate(params: {
    intent: CustomerIntent;
    extracted: ExtractedInfo;
    matchedRooms: MatchedRoom[];
    conversation: ConversationTurn[];
    templates?: string[];
  }): Promise<{ suggestions: string[]; nextAction: NextAction }> {
    const userContent = [
      `Y_DINH_KHACH: ${params.intent}`,
      `THONG_TIN_KHACH: ${JSON.stringify(this.forPrompt(params.extracted))}`,
      `DU_LIEU_PHONG: ${JSON.stringify(params.matchedRooms.map((r) => this.roomForPrompt(r)))}`,
      params.templates?.length
        ? `MAU_CAU_ADMIN: ${JSON.stringify(params.templates)}`
        : '',
      `LICH_SU_HOI_THOAI:\n${formatConversation(params.conversation)}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const result = await this.llm.completeJson<{
      suggestions: string[];
      nextAction: NextAction;
    }>({
      system: buildReplySystem(),
      schemaName: 'reply_suggestions',
      messages: [{ role: 'user', content: userContent }],
      // structured outputs không hỗ trợ minItems/maxItems — số lượng gợi ý
      // được nêu trong prompt và cắt lại ở đây.
      jsonSchema: strictObject({
        suggestions: { type: 'array', items: { type: 'string' } },
        nextAction: { type: 'string', enum: Object.values(NextAction) },
      }),
      maxTokens: 1024,
    });

    return {
      suggestions: (result.suggestions ?? []).slice(0, 3),
      nextAction: result.nextAction ?? NextAction.ASK_INFO,
    };
  }

  // Sinh 2-3 câu NHẮN LẠI chăm sóc khách cũ. Dùng chung ràng buộc phòng với
  // generate(), nên SafetyGuard vẫn bảo vệ được đầu ra y như luồng suggest.
  async generateCare(params: {
    extracted: ExtractedInfo;
    matchedRooms: MatchedRoom[];
    reason?: string;
    customerName?: string;
  }): Promise<string[]> {
    const userContent = [
      `THONG_TIN_KHACH: ${JSON.stringify(this.forPrompt(params.extracted))}`,
      `TEN_KHACH: ${params.customerName ?? ''}`,
      `LY_DO_CHAM: ${params.reason ?? '(không rõ)'}`,
      `DU_LIEU_PHONG: ${JSON.stringify(params.matchedRooms.map((r) => this.roomForPrompt(r)))}`,
    ].join('\n\n');

    const result = await this.llm.completeJson<{ suggestions: string[] }>({
      system: buildCareSystem(),
      schemaName: 'care_suggestions',
      messages: [{ role: 'user', content: userContent }],
      jsonSchema: strictObject({
        suggestions: { type: 'array', items: { type: 'string' } },
      }),
      maxTokens: 768,
    });
    return (result.suggestions ?? []).slice(0, 3);
  }

  private areaRelationLabel(
    relation: MatchedRoom['areaRelation'],
  ): string | undefined {
    switch (relation) {
      case 'exact':
        return 'đúng khu khách hỏi';
      case 'nearby':
        return 'gần khu khách hỏi (đi lại vài km)';
      case 'other':
        return 'KHÁC khu khách hỏi';
      default:
        return undefined;
    }
  }

  /** Không đưa SĐT khách vào prompt sinh câu trả lời — model không cần nó. */
  private forPrompt(info: ExtractedInfo): Omit<ExtractedInfo, 'phone'> {
    const { phone: _phone, ...rest } = info;
    return rest;
  }

  /**
   * Chỉ gửi cho model những field nó được phép nhắc tới. `id` và `matchScore`
   * là dữ liệu nội bộ — lọt vào prompt thì model có thể đọc ra cho khách.
   */
  private roomForPrompt(room: MatchedRoom) {
    return {
      roomCode: room.roomCode,
      area: room.area,
      // Để model nói thật khi phòng không nằm đúng khu khách hỏi.
      soVoiKhuKhachHoi: this.areaRelationLabel(room.areaRelation),
      address: room.address,
      price: room.price,
      roomType: room.roomType,
      highlights: room.highlights,
      noiThat: room.furniture, // để AI trả lời "phòng có gì" theo dữ liệu thật
      giaDichVu: room.note, // điện/nước/mạng... để trả lời "phí dịch vụ bao nhiêu"
    };
  }
}
