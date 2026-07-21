import { Body, Controller, Post } from '@nestjs/common';
import { NotifyEvent } from '@cba/shared';
import { TelegramService } from './telegram.service';

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
}
