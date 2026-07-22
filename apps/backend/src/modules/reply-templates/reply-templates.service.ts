import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReplyTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(intent?: string) {
    return this.prisma.replyTemplate.findMany({
      where: intent ? { intent } : {},
      orderBy: [{ intent: 'asc' }, { createdAt: 'asc' }],
    });
  }

  create(data: Prisma.ReplyTemplateUncheckedCreateInput) {
    return this.prisma.replyTemplate.create({ data });
  }

  update(id: string, data: Prisma.ReplyTemplateUpdateInput) {
    return this.prisma.replyTemplate.update({ where: { id }, data });
  }

  remove(id: string) {
    return this.prisma.replyTemplate.delete({ where: { id } });
  }
}
