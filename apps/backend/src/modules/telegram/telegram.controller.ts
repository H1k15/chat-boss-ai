import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { NotifyEvent, UserRole, TelegramConfig } from '@cba/shared';
import { TelegramService } from './telegram.service';
import { TelegramConfigDto } from './dto/telegram-config.dto';
import { Roles } from '../auth/roles.guard';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  @Post('test')
  test(@Body() body: { text?: string; chatId?: string }) {
    return this.telegram.notify({
      event: NotifyEvent.LEFT_PHONE,
      text: body.text || 'Test thông báo từ Chat Boss AI',
      payload: {},
      chatId: body.chatId,
    });
  }

  // Cấu hình Telegram chỉ admin xem/sửa (chứa nơi nhận thông báo).
  @Roles(UserRole.ADMIN)
  @Get('config')
  getConfig() {
    return this.telegram.getConfigView();
  }

  @Roles(UserRole.ADMIN)
  @Patch('config')
  updateConfig(@Body() dto: TelegramConfigDto) {
    return this.telegram.updateConfig(dto as Partial<TelegramConfig>);
  }
}
