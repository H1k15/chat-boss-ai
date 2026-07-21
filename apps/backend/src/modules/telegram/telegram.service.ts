import { Injectable, Logger } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { NotifyEvent } from '@cba/shared';
import { PrismaService } from '../../prisma/prisma.service';

// Bot gửi thông báo lead. Không polling (chỉ gửi đi).
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly bot = process.env.TELEGRAM_BOT_TOKEN
    ? new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false })
    : null;
  private readonly defaultChatId = process.env.TELEGRAM_DEFAULT_CHAT_ID || '';

  constructor(private readonly prisma: PrismaService) {}

  async notify(params: {
    event: NotifyEvent;
    text: string;
    payload: Record<string, unknown>;
    chatId?: string;
    dedupeKey?: string;
  }): Promise<void> {
    const chatId = params.chatId || this.defaultChatId;

    // Chống gửi trùng cùng một sự kiện-lead.
    if (params.dedupeKey) {
      const existed = await this.prisma.telegramNotification.findUnique({
        where: { dedupeKey: params.dedupeKey },
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
      await this.prisma.telegramNotification.update({
        where: { id: record.id },
        data: { success: false, error: String(e) },
      });
      throw e;
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
