import { Injectable } from '@nestjs/common';
import {
  ConversationTurn,
  CustomerIntent,
  ExtractedInfo,
  MatchedRoom,
} from '@cba/shared';
import { deaccent } from '../../../common/vietnamese';
import { buildSlotProfile, SlotProfile } from './slots';
import { decide, Decision } from './conversation-stage';
import { ConstrainedInput } from './reply-generator.service';

// ORCHESTRATOR hội thoại — TẤT ĐỊNH. Dựng hồ sơ slot, quyết stage + next_action,
// rồi đóng gói input SIẾT cho model (chỉ diễn đạt). Không gọi model ở đây.
@Injectable()
export class OrchestratorService {
  plan(params: {
    extracted: ExtractedInfo;
    intent: CustomerIntent;
    conversation: ConversationTurn[];
    matchedRooms: MatchedRoom[];
    now?: Date;
  }): { decision: Decision; profile: SlotProfile; constrained: ConstrainedInput } {
    const { extracted, intent, conversation, matchedRooms } = params;
    const now = params.now ?? new Date();

    const profile = buildSlotProfile(extracted, conversation, now);
    const lastCustomerText = this.lastCustomer(conversation);
    const roomsProposedBefore = this.staffProposedRooms(conversation);

    const decision = decide({
      profile,
      matchedCount: matchedRooms.length,
      intent,
      lastCustomerText,
      roomsProposedBefore,
    });

    const constrained: ConstrainedInput = {
      stage: decision.stage,
      nextAction: decision.action,
      verifiedFacts: this.verifiedFacts(profile),
      knownSlots: decision.knownSlots,
      missingSlots: decision.missingSlots,
      requiredQuestion: decision.requiredQuestion,
      forbiddenTopics: decision.forbiddenTopics,
      answerHint: decision.answerHint,
      maxWords: decision.maxWords,
      // Chỉ đưa dữ liệu phòng cho model khi cần diễn đạt (đề xuất / trả lời hỏi phòng).
      rooms:
        decision.action === 'PROPOSE_ROOMS' ||
        decision.action === 'ANSWER_ROOM_QUESTION'
          ? matchedRooms.slice(0, 3).map((r) => this.roomFact(r))
          : undefined,
    };

    return { decision, profile, constrained };
  }

  private lastCustomer(conv: ConversationTurn[]): string {
    for (let i = conv.length - 1; i >= 0; i--) {
      if (conv[i].role === 'customer') return conv[i].text;
    }
    return '';
  }

  /** Đã từng đề xuất phòng chưa: tin NHÂN VIÊN có mã phòng hoặc giá tiền triệu. */
  private staffProposedRooms(conv: ConversationTurn[]): boolean {
    return conv.some((t) => {
      if (t.role !== 'staff') return false;
      const s = deaccent(t.text);
      return /\bp\d{2,4}\b/.test(s) || /\d+(?:[.,]\d+)?\s*tr(?:ieu)?\b/.test(s);
    });
  }

  private verifiedFacts(p: SlotProfile): string[] {
    const facts: string[] = [];
    if (p.targetLocation) facts.push(`Khách muốn tìm quanh ${p.targetLocation}`);
    if (p.radiusKm) facts.push(`Trong bán kính khoảng ${p.radiusKm} km`);
    if (p.budgetMin && p.budgetMax && p.budgetMin !== p.budgetMax)
      facts.push(
        `Ngân sách khoảng ${this.money(p.budgetMin)}–${this.money(p.budgetMax)}`,
      );
    else if (p.budgetMax)
      facts.push(`Ngân sách tối đa ${this.money(p.budgetMax)}`);
    if (p.moveInDate) facts.push(`Dự kiến chuyển vào ${p.moveInDate}`);
    else if (p.moveInIntent === 'immediate') facts.push('Khách cần vào ở sớm');
    if (p.occupants) facts.push(`Số người ở: ${p.occupants}`);
    return facts;
  }

  private roomFact(r: MatchedRoom): Record<string, unknown> {
    return {
      roomCode: r.roomCode,
      area: r.area,
      soVoiKhuKhachHoi: r.areaRelation,
      price: r.price,
      distanceKm: r.distanceKm,
      highlights: r.highlights,
      noiThat: r.furniture,
      giaDichVu: r.note,
    };
  }

  private money(v: number): string {
    return `${(v / 1_000_000).toString().replace('.', ',')} triệu`;
  }
}
