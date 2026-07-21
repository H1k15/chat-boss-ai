import { Injectable } from '@nestjs/common';
import { Channel } from '@cba/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  findByCustomer(customerId: string) {
    return this.prisma.conversation.findMany({
      where: { customerId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  }

  // Ghi lại 1 lượt hội thoại (dùng khi extension đồng bộ nội dung).
  async appendMessage(data: {
    customerId: string;
    facebookProfileId?: string;
    channel: Channel;
    role: string;
    text: string;
  }) {
    let convo = await this.prisma.conversation.findFirst({
      where: { customerId: data.customerId, channel: data.channel },
    });
    if (!convo) {
      convo = await this.prisma.conversation.create({
        data: {
          customerId: data.customerId,
          facebookProfileId: data.facebookProfileId,
          channel: data.channel,
        },
      });
    }
    await this.prisma.message.create({
      data: { conversationId: convo.id, role: data.role, text: data.text },
    });
    return this.prisma.conversation.update({
      where: { id: convo.id },
      data: { lastMessage: data.text },
    });
  }
}
