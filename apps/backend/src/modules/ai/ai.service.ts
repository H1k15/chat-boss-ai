import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AiSuggestRequest,
  AiSuggestResponse,
  ConversationTurn,
  CustomerIntent,
  CustomerStatus,
  ExtractedInfo,
  MatchedRoom,
  NotifyEvent,
} from '@cba/shared';
import { Customer, Prisma } from '@prisma/client';
import { appSettingKey, currentOrgId } from '../../common/tenant';
import { LimitsService } from '../billing/limits.service';
import { PrismaService } from '../../prisma/prisma.service';
import { IntentClassifierService } from './pipeline/intent-classifier.service';
import { InfoExtractorService } from './pipeline/info-extractor.service';
import { RoomMatcherService } from './pipeline/room-matcher.service';
import { ReplyGeneratorService } from './pipeline/reply-generator.service';
import { SafetyGuardService } from './pipeline/safety-guard.service';
import { OrchestratorService } from './pipeline/orchestrator.service';
import { parseViewingDateTime } from './pipeline/viewing-parser';
import { TelegramService } from '../telegram/telegram.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { isUsableGoldReply } from '../training/fb-history';

// Orchestrator: chạy pipeline 5 bước và ghép kết quả.
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly intent: IntentClassifierService,
    private readonly extractor: InfoExtractorService,
    private readonly matcher: RoomMatcherService,
    private readonly replies: ReplyGeneratorService,
    private readonly safety: SafetyGuardService,
    private readonly orchestrator: OrchestratorService,
    private readonly telegram: TelegramService,
    private readonly appointments: AppointmentsService,
    private readonly limits: LimitsService,
  ) {}

  async suggest(
    req: AiSuggestRequest,
    userId?: string,
  ): Promise<AiSuggestResponse> {
    // [billing] Chặn nếu org đã hết hạn mức gợi ý AI trong ngày (chốt chi phí LLM).
    await this.limits.assertAiWithinDaily();

    // [0] Nạp thông tin đã biết về khách (nếu nhân viên đã lưu khách này).
    // Không có bước này thì mỗi lần bấm "Gợi ý" AI lại hỏi lại khu vực và
    // ngân sách mà khách đã trả lời từ hôm trước.
    const customer = req.customerId
      ? await this.prisma.customer.findUnique({ where: { id: req.customerId } })
      : null;
    const known = customer ? this.toExtractedInfo(customer) : undefined;

    // [1+2] HỢP NHẤT ý định + trích xuất trong MỘT lời gọi LLM (tiết kiệm token).
    // fastPath (regex tất định) quyết ý định cho phần lớn ca -> KHÔNG cần LLM
    // đoán intent; understand() vẫn phải chạy để trích xuất, và trả kèm intent
    // dùng khi fastPath không chắc. Tổng: tối đa 1 lời gọi (trước là 1–2).
    const fastIntent = this.intent.fastClassify(this.lastCustomerText(req) ?? '');
    const understood = await this.extractor.understand(req.conversation, known);
    const intent = fastIntent ?? understood.intent ?? CustomerIntent.OTHER;
    const extracted = understood.extracted;

    // [3] Lọc phòng (thuần logic — nguồn sự thật duy nhất về phòng). Nếu khách
    // hỏi theo khoảng cách, matcher geocode điểm mốc + lọc bán kính (Haversine).
    const { rooms: matchedRooms, location } =
      await this.matcher.matchDetailed(extracted);

    // [4] ORCHESTRATOR (TẤT ĐỊNH) quyết stage + next_action + câu hỏi kế tiếp.
    // Model chỉ DIỄN ĐẠT (không tự quyết bước, không tự chọn phòng).
    // Mẫu câu admin + VÍ DỤ GIỌNG từ lịch sử chat thật (gold pair FB). Gold đứng
    // trước để được ưu tiên khi orchestrator cắt còn 3.
    const [adminTemplates, goldExamples] = await Promise.all([
      this.loadTemplates(intent),
      this.loadGoldExamples(extracted.area),
    ]);
    const plan = this.orchestrator.plan({
      extracted,
      intent,
      conversation: req.conversation,
      matchedRooms,
      adminTemplates: [...goldExamples, ...adminTemplates],
      now: new Date(),
    });
    const withHint = (): string =>
      plan.decision.answerHint
        ? `${plan.decision.answerHint} ${plan.decision.fallbackMessage}`
        : plan.decision.fallbackMessage;

    let message = await this.replies.generateConstrained(plan.constrained);
    let fallbackUsed = false;
    if (!message) {
      message = withHint(); // model hỏng/timeout -> template tất định
      fallbackUsed = true;
    }

    // [5] SafetyGuard: giá/SĐT/mã phòng + không hỏi lại slot đã biết + không
    // khan hiếm/cam kết giả. Vi phạm -> thay bằng template an toàn.
    const safe = this.safety.checkOrchestrated(
      message,
      matchedRooms,
      plan.decision.knownSlots,
    );
    let primary = safe.safeMessage;
    if (safe.blocked) {
      primary = withHint();
      fallbackUsed = true;
      await this.logSafetyBlock(req, userId, safe.reasons);
    }

    const nextAction = plan.decision.nextAction;

    // Cập nhật CRM nếu hội thoại hé lộ thêm.
    if (customer) {
      await this.updateCustomer(customer, extracted);
    }

    // Side-effect TẤT ĐỊNH theo quyết định orchestrator. Không để lỗi phụ làm
    // hỏng việc trả gợi ý (bọc catch).
    if (plan.decision.action === 'HANDOFF') {
      await this.notifyHandoff(req, plan.decision.handoffReason).catch((e) =>
        this.logger.warn(`Handoff notify lỗi: ${e}`),
      );
    }
    if (plan.decision.createAppointment && req.customerId) {
      await this.autoCreateAppointment(
        req.customerId,
        this.lastCustomerText(req),
      ).catch((e) => this.logger.warn(`Auto tạo lịch lỗi: ${e}`));
    }

    // Gợi ý chính + phương án template (để nhân viên chọn) nếu khác nhau.
    const rawSuggestions = [primary];
    const templateAlt = withHint();
    if (templateAlt.trim() && templateAlt.trim() !== primary.trim()) {
      rawSuggestions.push(templateAlt);
    }

    // Đính link ảnh/video/vị trí THẬT khi khách hỏi (CODE ghép link, không bịa).
    const finalSuggestions = await this.attachMediaLinks(
      intent,
      matchedRooms,
      rawSuggestions,
      this.lastCustomerText(req),
    );

    // Log quan sát (mục XVIII) — không log SĐT đầy đủ / khoá.
    this.logger.log(
      `stage=${plan.decision.stage} action=${plan.decision.action} ` +
        `known=[${plan.decision.knownSlots}] missing=[${plan.decision.missingSlots}] ` +
        `rooms=${matchedRooms.length} fallback=${fallbackUsed} blocked=${safe.blocked}` +
        (plan.decision.handoffReason ? ` handoff="${plan.decision.handoffReason}"` : ''),
    );

    const suggestionLogId = await this.logAiSuggest(req, userId, {
      intent,
      extracted,
      suggestions: finalSuggestions,
      matchedRoomCodes: matchedRooms.map((r) => r.roomCode),
      // Ngữ cảnh orchestrator để script phân tích log lọc ca sai (mục b).
      stage: plan.decision.stage,
      action: plan.decision.action,
      nextAction,
      knownSlots: plan.decision.knownSlots,
      missingSlots: plan.decision.missingSlots,
      fallbackUsed,
      blocked: safe.blocked,
    });

    return {
      intent,
      extracted,
      matchedRooms,
      suggestions: finalSuggestions,
      nextAction,
      customerStageHint: this.stageHint(intent, extracted),
      safety: { blocked: safe.blocked, reasons: safe.reasons },
      suggestionLogId,
      ...(location.status !== 'NONE' ? { location } : {}),
    };
  }

  /**
   * Ghi lại một lần AI đề xuất (action AI_SUGGEST). Trả về id của log để
   * extension nhớ, rồi khi nhân viên gửi thật thì gọi recordSent() kèm id này.
   * Không để lỗi ghi log làm hỏng việc trả gợi ý — trả undefined nếu ghi hụt.
   */
  private async logAiSuggest(
    req: AiSuggestRequest,
    userId: string | undefined,
    payload: {
      intent: CustomerIntent;
      extracted: ExtractedInfo;
      suggestions: string[];
      matchedRoomCodes: string[];
      stage?: string;
      action?: string;
      nextAction?: string;
      knownSlots?: string[];
      missingSlots?: string[];
      fallbackUsed?: boolean;
      blocked?: boolean;
    },
  ): Promise<string | undefined> {
    try {
      const log = await this.prisma.activityLog.create({
        data: {
          userId: userId ?? null,
          action: 'AI_SUGGEST',
          entity: req.customerId ? `customer:${req.customerId}` : null,
          // Chuẩn hoá qua JSON để loại bỏ mọi field undefined (JSON không biểu
          // diễn được undefined, và Prisma cũng không nhận vào cột Json).
          meta: JSON.parse(
            JSON.stringify({
              channel: req.channel,
              facebookProfileId: req.facebookProfileId,
              lastCustomerText: this.lastCustomerText(req),
              ...payload,
            }),
          ) as Prisma.InputJsonObject,
        },
      });
      return log.id;
    } catch (e) {
      this.logger.warn(`Không ghi được AI_SUGGEST: ${e}`);
      return undefined;
    }
  }

  /**
   * Nhân viên báo đã gửi câu gì cho khách (action AI_SEND). Ghép với AI_SUGGEST
   * qua suggestionLogId. Chênh lệch giữa gợi ý và câu gửi thật là dữ liệu vàng
   * để fine-tune model sau này.
   */
  async recordSent(
    userId: string | undefined,
    fb: {
      suggestionLogId: string;
      finalText: string;
      chosenIndex?: number;
      edited?: boolean;
    },
  ): Promise<{ ok: boolean }> {
    try {
      await this.prisma.activityLog.create({
        data: {
          userId: userId ?? null,
          action: 'AI_SEND',
          entity: `suggest:${fb.suggestionLogId}`,
          meta: {
            suggestionLogId: fb.suggestionLogId,
            finalText: fb.finalText,
            chosenIndex: fb.chosenIndex ?? null,
            edited: fb.edited ?? null,
          },
        },
      });
      return { ok: true };
    } catch (e) {
      this.logger.warn(`Không ghi được AI_SEND: ${e}`);
      return { ok: false };
    }
  }

  /**
   * Đính link ảnh/video/vị trí THẬT vào cuối mỗi câu gợi ý khi khách CÓ Ý hỏi —
   * dựa trên intent HOẶC từ khoá trong câu khách (vì câu kiểu "còn phòng, cho
   * xem ẢNH" bị nhận là ASK_AVAILABILITY nhưng vẫn cần đính ảnh).
   * - Muốn ảnh: ưu tiên link THỰC TẾ -> DEMO -> không có cả hai thì báo chưa có
   *   + xin liên hệ (MEDIA_UNAVAILABLE_MSG).
   * - Muốn vị trí: đính link Google Maps nếu có.
   * Cả hai có thể cùng đính (khách hỏi cả ảnh lẫn vị trí).
   * Link lấy từ map room_media (đọc qua AppSetting, tránh phụ thuộc SheetsModule).
   * Model KHÔNG bao giờ tự sinh URL -> không bịa link.
   */
  private async attachMediaLinks(
    intent: CustomerIntent,
    matchedRooms: MatchedRoom[],
    suggestions: string[],
    lastText?: string,
  ): Promise<string[]> {
    // Từ khoá dò trên câu ĐÃ CÓ DẤU (không bỏ dấu) — tránh "anh" (=anh/bạn) bị
    // nhầm với "ảnh". Khớp cả khi intent chưa bắt đúng ý (câu hỏi lẫn nhiều ý).
    const text = (lastText || '').toLowerCase();
    const wantsMedia =
      intent === CustomerIntent.ASK_MEDIA || /ảnh|hình|video|clip/.test(text);
    const wantsLoc =
      intent === CustomerIntent.ASK_ADDRESS ||
      intent === CustomerIntent.WANT_VIEWING ||
      /vị trí|địa chỉ|bản đồ|ở đâu|chỗ nào/.test(text);
    if ((!wantsMedia && !wantsLoc) || !matchedRooms.length) return suggestions;

    type MediaMap = Record<
      string,
      { demo?: string; real?: string; location?: string }
    >;
    let map: MediaMap;
    try {
      const row = await this.prisma.appSetting.findUnique({
        where: appSettingKey('room_media'),
      });
      map = (row?.value as MediaMap | null) ?? {};
    } catch {
      return suggestions; // không đọc được -> trả nguyên, không chặn gợi ý
    }

    const blocks: string[] = [];

    if (wantsMedia) {
      // Ưu tiên phòng khớp ĐẦU TIÊN có ảnh/video (thực tế trước, demo sau).
      let mb = '';
      for (const room of matchedRooms) {
        const m = map[room.roomCode];
        if (m?.real) {
          mb = `🎥 Ảnh/video thực tế: ${m.real}`;
          break;
        }
        if (m?.demo) {
          mb = `📷 Ảnh/video (mẫu): ${m.demo}`;
          break;
        }
      }
      // Không phòng nào có ảnh/video -> báo khách chưa có + xin liên hệ.
      blocks.push(
        mb ||
          process.env.MEDIA_UNAVAILABLE_MSG ||
          'Phòng này bên em hiện chưa có sẵn ảnh/video ạ. Anh/chị để lại ' +
            'SĐT/Zalo, em gửi ngay khi cập nhật nhé!',
      );
    }

    if (wantsLoc) {
      // Vị trí: đính nếu có; không có thì thôi (không báo gì thêm).
      for (const room of matchedRooms) {
        const m = map[room.roomCode];
        if (m?.location) {
          blocks.push(`📍 Vị trí: ${m.location}`);
          break;
        }
      }
    }

    if (!blocks.length) return suggestions;
    const block = blocks.join('\n');
    return suggestions.map((s) => `${s}\n${block}`);
  }

  /**
   * Khi orchestrator quyết HANDOFF: đẩy Telegram cho nhân viên kèm tóm tắt
   * hội thoại. Dedupe theo (profile + lý do) để không spam mỗi lần bấm Gợi ý.
   */
  private async notifyHandoff(
    req: AiSuggestRequest,
    reason?: string,
  ): Promise<void> {
    await this.telegram.notify({
      event: NotifyEvent.URGENT_CALL,
      text: [
        '🆘 <b>Cần nhân viên xử lý</b>',
        `Lý do: ${reason || '(không rõ)'}`,
        `Kênh: ${req.channel}`,
        `Tóm tắt:\n${this.conversationSummary(req.conversation)}`,
      ].join('\n'),
      payload: { facebookProfileId: req.facebookProfileId, reason },
      dedupeKey: `handoff:${req.facebookProfileId}:${reason ?? ''}`,
    });
  }

  /**
   * Auto tạo lịch xem khi orchestrator xác định đủ ngày+giờ+SĐT. CODE tính giờ
   * (viewing-parser), không để model tạo lịch. Idempotent: đã có lịch SCHEDULED
   * cho khách thì bỏ qua (tránh trùng khi bấm Gợi ý nhiều lần).
   */
  private async autoCreateAppointment(
    customerId: string,
    text?: string,
  ): Promise<void> {
    if (!text) return;
    const when = parseViewingDateTime(text, new Date());
    if (!when) return;
    const existing = await this.prisma.appointment.findFirst({
      where: { customerId, status: 'SCHEDULED' },
    });
    if (existing) return;
    await this.appointments.create({
      customerId,
      appointmentTime: when.toISOString(),
      note: 'Tự tạo từ hội thoại (AI orchestrator)',
    });
    this.logger.log(
      `Auto tạo lịch xem customer=${customerId} lúc ${when.toISOString()}`,
    );
  }

  /** Tóm tắt hội thoại (6 lượt cuối) cho thông báo handoff. */
  private conversationSummary(conv: ConversationTurn[]): string {
    return conv
      .slice(-6)
      .map((t) => `${t.role === 'customer' ? 'Khách' : 'NV'}: ${t.text}`)
      .join('\n')
      .slice(0, 500);
  }

  /** Lấy tin nhắn cuối cùng của khách trong hội thoại (để lưu kèm log). */
  private lastCustomerText(req: AiSuggestRequest): string | undefined {
    for (let i = req.conversation.length - 1; i >= 0; i--) {
      if (req.conversation[i].role === 'customer')
        return req.conversation[i].text;
    }
    return undefined;
  }

  /**
   * Chỉ trích xuất thông tin khách, không sinh câu trả lời (POST /ai/extract).
   * Nhẹ hơn suggest — dùng khi chỉ cần cập nhật CRM chứ chưa cần gợi ý.
   */
  async extractOnly(req: {
    conversation: ConversationTurn[];
    customerId?: string;
  }): Promise<ExtractedInfo> {
    const customer = req.customerId
      ? await this.prisma.customer.findUnique({ where: { id: req.customerId } })
      : null;
    const known = customer ? this.toExtractedInfo(customer) : undefined;
    return this.extractor.extract(req.conversation, known);
  }

  /**
   * Phân loại nhanh ý định của MỘT comment (POST /ai/classify-comment).
   * Dùng cho luồng xử lý comment dưới bài đăng — quyết định có nên gợi ý trả
   * lời cạnh comment hay bỏ qua.
   */
  async classifyComment(text: string): Promise<{ intent: CustomerIntent }> {
    const intent = await this.intent.classify([{ role: 'customer', text }]);
    return { intent };
  }

  /**
   * Gợi ý câu nhắn lại chăm sóc cho một care task (POST /care-tasks/:id/suggest).
   * Tái dùng lọc phòng + SafetyGuard của pipeline: chặn giá/SĐT bịa như suggest.
   */
  async suggestCareForTask(careTaskId: string): Promise<{
    suggestions: string[];
    matchedRooms: MatchedRoom[];
    safety: { blocked: boolean; reasons: string[] };
  }> {
    const task = await this.prisma.careTask.findUnique({
      where: { id: careTaskId },
      include: { customer: true },
    });
    if (!task || !task.customer) {
      throw new NotFoundException('Không tìm thấy care task hoặc khách');
    }

    const info = this.toExtractedInfo(task.customer);
    const matchedRooms = await this.matcher.match(info);
    const raw = await this.replies.generateCare({
      extracted: info,
      matchedRooms,
      reason: task.reason ?? undefined,
      customerName: task.customer.name ?? undefined,
    });

    const safe = this.safety.check(raw, matchedRooms);
    return {
      suggestions: safe.safeSuggestions,
      matchedRooms,
      safety: { blocked: safe.blocked, reasons: safe.reasons },
    };
  }

  /** Đọc dữ liệu khách trong DB về dạng ExtractedInfo để merge. */
  private toExtractedInfo(c: Customer): ExtractedInfo {
    return {
      name: c.name ?? undefined,
      phone: c.phone ?? undefined,
      area: c.areaNeed ?? undefined,
      budgetMin: c.budgetMin ?? undefined,
      budgetMax: c.budgetMax ?? undefined,
      peopleCount: c.peopleCount ?? undefined,
      moveInDate: c.moveInDate?.toISOString().slice(0, 10),
      requirements: c.requirements,
    };
  }

  /**
   * Ghi lại thông tin mới học được về khách.
   *
   * Chỉ ghi field thực sự thay đổi, và không bao giờ xoá dữ liệu đã có bằng
   * giá trị rỗng — một tin nhắn "ok anh" không được phép xoá sạch ngân sách
   * khách đã nói ở tin trước.
   */
  private async updateCustomer(
    customer: Customer,
    extracted: ExtractedInfo,
  ): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (extracted.name && extracted.name !== customer.name)
      patch.name = extracted.name;
    if (extracted.phone && extracted.phone !== customer.phone)
      patch.phone = extracted.phone;
    if (extracted.area && extracted.area !== customer.areaNeed)
      patch.areaNeed = extracted.area;
    if (extracted.budgetMin && extracted.budgetMin !== customer.budgetMin)
      patch.budgetMin = extracted.budgetMin;
    if (extracted.budgetMax && extracted.budgetMax !== customer.budgetMax)
      patch.budgetMax = extracted.budgetMax;
    if (extracted.peopleCount && extracted.peopleCount !== customer.peopleCount)
      patch.peopleCount = extracted.peopleCount;
    if (extracted.requirements?.length)
      patch.requirements = extracted.requirements;

    if (!Object.keys(patch).length) return;

    try {
      await this.prisma.customer.update({
        where: { id: customer.id },
        data: patch,
      });
    } catch (e) {
      // Không để lỗi ghi CRM làm hỏng việc trả gợi ý cho nhân viên.
      this.logger.warn(`Không cập nhật được khách ${customer.id}: ${e}`);
    }
  }

  private async loadTemplates(intent: CustomerIntent): Promise<string[]> {
    try {
      const rows = await this.prisma.replyTemplate.findMany({
        where: { intent, isActive: true },
        select: { content: true },
        take: 5,
      });
      return rows.map((r) => r.content);
    } catch {
      return [];
    }
  }

  /**
   * Lấy vài câu trả lời THẬT của chủ trọ (gold pair nhập từ lịch sử Facebook,
   * meta.source='fb_history_import') làm VÍ DỤ GIỌNG VĂN cho model bắt chước.
   *
   * Bơm qua đúng kênh adminTemplates -> prompt đã dặn "bắt chước giọng, KHÔNG
   * chép số liệu", và SafetyGuard vẫn đối chiếu giá/SĐT/mã phòng với dữ liệu
   * thật -> an toàn, không bịa. Ưu tiên ví dụ có nhắc tới khu khách đang hỏi.
   * Cắt ngắn + ít (2) để không phình prompt/token.
   */
  private async loadGoldExamples(area?: string, limit = 2): Promise<string[]> {
    try {
      const org = currentOrgId();
      if (!org) return [];
      // Lấy dư (limit*5) rồi lọc ở code: câu trả lời phải có tín hiệu nhà trọ
      // (bỏ câu lạc đề như tin tuyển dụng lọt vào thread). ILIKE khu chỉ để ưu tiên.
      const take = limit * 5;
      const rows = area
        ? await this.prisma.$queryRaw<{ t: string | null }[]>`
            SELECT meta->>'finalText' AS t FROM activity_logs
            WHERE action = 'AI_SEND' AND meta->>'source' = 'fb_history_import'
              AND "organizationId" = ${org} AND meta::text ILIKE ${'%' + area + '%'}
            ORDER BY "createdAt" DESC LIMIT ${take}`
        : await this.prisma.$queryRaw<{ t: string | null }[]>`
            SELECT meta->>'finalText' AS t FROM activity_logs
            WHERE action = 'AI_SEND' AND meta->>'source' = 'fb_history_import'
              AND "organizationId" = ${org}
            ORDER BY "createdAt" DESC LIMIT ${take}`;
      return rows
        .map((r) => (r.t ?? '').trim())
        .filter((t) => isUsableGoldReply(t))
        .slice(0, limit);
    } catch (e) {
      this.logger.warn(`loadGoldExamples lỗi: ${e}`);
      return [];
    }
  }

  private async logSafetyBlock(
    req: AiSuggestRequest,
    userId: string | undefined,
    reasons: string[],
  ): Promise<void> {
    try {
      await this.prisma.activityLog.create({
        data: {
          userId: userId ?? null,
          action: 'SAFETY_BLOCK',
          entity: req.customerId ? `customer:${req.customerId}` : null,
          meta: { reasons, channel: req.channel },
        },
      });
    } catch (e) {
      this.logger.warn(`Không ghi được activity log: ${e}`);
    }
  }

  private stageHint(
    intent: CustomerIntent,
    info: ExtractedInfo,
  ): CustomerStatus {
    if (info.phone) return CustomerStatus.HAS_PHONE;
    if (intent === CustomerIntent.WANT_VIEWING) return CustomerStatus.APPOINTED;
    if (info.area && (info.budgetMax || info.budgetMin))
      return CustomerStatus.ADVISED;
    if (intent === CustomerIntent.GREETING) return CustomerStatus.NEW;
    return CustomerStatus.ASKING_INFO;
  }
}
