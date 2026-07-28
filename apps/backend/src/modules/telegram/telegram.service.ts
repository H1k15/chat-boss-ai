import { Injectable, Logger } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { Prisma } from '@prisma/client';
import { NotifyEvent, TelegramConfig, TelegramConfigView } from '@cba/shared';
import { appSettingKey, currentOrgId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';

const SETTING_KEY = 'telegram';

// Bot gửi thông báo lead. Không polling (chỉ gửi đi).
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly bot = process.env.TELEGRAM_BOT_TOKEN
    ? new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false })
    : null;
  // Chat mặc định từ .env — là giá trị nền; cấu hình runtime ghi đè được.
  private readonly envChatId = process.env.TELEGRAM_DEFAULT_CHAT_ID || '';

  constructor(private readonly prisma: PrismaService) {}

  /** Cấu hình mặc định: bật mọi sự kiện, chat lấy từ .env. */
  private defaultEvents(): Record<NotifyEvent, boolean> {
    return Object.values(NotifyEvent).reduce(
      (acc, e) => ({ ...acc, [e]: true }),
      {} as Record<NotifyEvent, boolean>,
    );
  }

  /** Đọc cấu hình runtime (merge với mặc định). */
  async getConfig(): Promise<TelegramConfig> {
    const row = await this.prisma.appSetting.findUnique({
      where: appSettingKey(SETTING_KEY),
    });
    const stored = (row?.value as Partial<TelegramConfig> | null) ?? {};
    return {
      // Dùng "||" (không phải "??"): chuỗi rỗng cũng quay về giá trị .env, để
      // admin xoá trắng ô chat không vô tình tắt hết thông báo.
      defaultChatId: stored.defaultChatId || this.envChatId,
      events: { ...this.defaultEvents(), ...(stored.events ?? {}) },
    };
  }

  /** Cấu hình kèm trạng thái chỉ-đọc, cho GET /telegram/config. */
  async getConfigView(): Promise<TelegramConfigView> {
    const cfg = await this.getConfig();
    return { ...cfg, botConfigured: !!this.bot, envChatId: this.envChatId };
  }

  /** Cập nhật cấu hình (merge từng phần), cho PATCH /telegram/config. */
  async updateConfig(
    patch: Partial<TelegramConfig>,
  ): Promise<TelegramConfigView> {
    const current = await this.getConfig();
    const next: TelegramConfig = {
      defaultChatId: patch.defaultChatId ?? current.defaultChatId,
      events: { ...current.events, ...(patch.events ?? {}) },
    };
    await this.prisma.appSetting.upsert({
      where: appSettingKey(SETTING_KEY),
      update: { value: next as unknown as Prisma.InputJsonObject },
      create: {
        key: SETTING_KEY,
        value: next as unknown as Prisma.InputJsonObject,
      },
    });
    return this.getConfigView();
  }

  async notify(params: {
    event: NotifyEvent;
    text: string;
    payload: Record<string, unknown>;
    chatId?: string;
    dedupeKey?: string;
  }): Promise<void> {
    const config = await this.getConfig();

    // Sự kiện bị tắt trong cấu hình -> không gửi, không ghi.
    if (!config.events[params.event]) {
      this.logger.log(`Sự kiện ${params.event} đang tắt — bỏ qua gửi`);
      return;
    }

    const chatId = params.chatId || config.defaultChatId;

    // Chống gửi trùng cùng một sự kiện-lead.
    if (params.dedupeKey) {
      const existed = await this.prisma.telegramNotification.findUnique({
        where: {
          organizationId_dedupeKey: {
            organizationId: currentOrgId(),
            dedupeKey: params.dedupeKey,
          },
        },
      });
      if (existed?.success) return;
    }

    const record = await this.prisma.telegramNotification.create({
      data: {
        event: params.event,
        payload: params.payload as object,
        chatId,
        dedupeKey: params.dedupeKey,
      },
    });

    try {
      if (this.bot && chatId) {
        await this.bot.sendMessage(chatId, params.text, {
          parse_mode: 'HTML',
        });
      } else {
        this.logger.warn('Telegram chưa cấu hình — bỏ qua gửi thật');
      }
      await this.prisma.telegramNotification.update({
        where: { id: record.id },
        data: { success: true, sentAt: new Date() },
      });
    } catch (e) {
      // Gửi Telegram thất bại KHÔNG được làm hỏng việc chính (lưu lead, tạo lịch
      // hẹn). Ghi log + đánh dấu thất bại trong DB, nhưng không ném lỗi lên.
      await this.prisma.telegramNotification.update({
        where: { id: record.id },
        data: { success: false, error: String(e) },
      });
      this.logger.warn(`Gửi Telegram thất bại (đã bỏ qua): ${e}`);
    }
  }

  // Định dạng tin "khách để lại SĐT" theo mô tả dự án.
  formatLeftPhone(p: {
    name?: string;
    phone: string;
    need?: string;
    source?: string;
    staff?: string;
    note?: string;
  }): string {
    return [
      '📞 <b>Lead mới có số điện thoại</b>',
      `Tên: ${p.name || '(chưa rõ)'}`,
      `SĐT: ${p.phone}`,
      `Nhu cầu: ${p.need || '-'}`,
      `Nguồn: ${p.source || '-'}`,
      `Nhân viên: ${p.staff || '-'}`,
      p.note ? `Ghi chú: ${p.note}` : '',
      'Trạng thái: Cần gọi tư vấn ngay',
    ]
      .filter(Boolean)
      .join('\n');
  }
}
