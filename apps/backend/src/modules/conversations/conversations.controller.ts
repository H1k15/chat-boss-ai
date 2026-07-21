import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ConversationsService } from './conversations.service';

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get('customer/:customerId')
  findByCustomer(@Param('customerId') customerId: string) {
    return this.conversations.findByCustomer(customerId);
  }

  @Post('message')
  appendMessage(@Body() body: Parameters<ConversationsService['appendMessage']>[0]) {
    return this.conversations.appendMessage(body);
  }
}
