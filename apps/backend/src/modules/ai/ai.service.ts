import { Injectable, Logger } from '@nestjs/common';
import {
  AiSuggestRequest,
  AiSuggestResponse,
  CustomerIntent,
  CustomerStatus,
  ExtractedInfo,
} from '@cba/shared';
import { Customer } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IntentClassifierService } from './pipeline/intent-classifier.service';
import { InfoExtractorService } from './pipeline/info-extractor.service';
import { RoomMatcherService } from './pipeline/room-matcher.service';
import { ReplyGeneratorService } from './pipeline/reply-generator.service';
import { SafetyGuardService } from './pipeline/safety-guard.service';

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
  ) {}

  async suggest(
    req: AiSuggestRequest,
    userId?: string,
  ): Promise<AiSuggestResponse> {
    // [0] Nạp thông tin đã biết về khách (nếu nhân viên đã lưu khách này).
    // Không có bước này thì mỗi lần bấm "Gợi ý" AI lại hỏi lại khu vực và
    // ngân sách mà khách đã trả lời từ hôm trước.
    const customer = req.customerId
      ? await this.prisma.customer.findUnique({ where: { id: req.customerId } })
      : null;
    const known = customer ? this.toExtractedInfo(customer) : undefined;

    // [1] Ý định và [2] trích xuất chạy song song — hai bước độc lập nhau,
    // gọi tuần tự chỉ làm nhân viên phải chờ thêm một vòng gọi model.
    const [intent, extracted] = await Promise.all([
      this.intent.classify(req.conversation),
      this.extractor.extract(req.conversation, known),
    ]);

    // [3] Lọc phòng (thuần logic — nguồn sự thật duy nhất về phòng)
    const matchedRooms = await this.matcher.match(extracted);

    // [4] Sinh gợi ý, kèm mẫu câu admin cấu hình cho ý định này
    const templates = await this.loadTemplates(intent);
    const { suggestions, nextAction } = await this.replies.generate({
      intent,
      extracted,
      matchedRooms,
      conversation: req.conversation,
      templates,
    });

    // [5] Kiểm tra an toàn
    const safe = this.safety.check(suggestions, matchedRooms);

    // Ghi log mọi lần bị chặn để admin theo dõi chất lượng model (mục 12).
    if (safe.reasons.length) {
      await this.logSafetyBlock(req, userId, safe.reasons);
    }

    // Cập nhật lại thông tin khách đã biết, nếu hội thoại hé lộ thêm.
    if (customer) {
      await this.updateCustomer(customer, extracted);
    }

    return {
      intent,
      extracted,
      matchedRooms,
      suggestions: safe.safeSuggestions,
      nextAction,
      customerStageHint: this.stageHint(intent, extracted),
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
