import { Injectable } from '@nestjs/common';
import { CustomerStatus, NotifyEvent } from '@cba/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  findAll(query: {
    status?: CustomerStatus;
    assignedTo?: string;
    area?: string;
    q?: string;
    page?: number;
  }) {
    const where: Prisma.CustomerWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.assignedTo) where.assignedToId = query.assignedTo;
    if (query.area) where.areaNeed = { contains: query.area, mode: 'insensitive' };
    if (query.q)
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { phone: { contains: query.q } },
      ];
    const page = query.page ?? 1;
    return this.prisma.customer.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * 20,
      take: 20,
    });
  }

  findOne(id: string) {
    return this.prisma.customer.findUnique({
      where: { id },
      include: {
        conversations: { include: { messages: true } },
        appointments: { include: { room: true } },
        careTasks: true,
        notes: true,
        sourceProfile: true,
        assignedTo: true,
      },
    });
  }

  // Lưu lead từ extension. Nếu có SĐT -> đẩy Telegram.
  async create(data: {
    name?: string;
    phone?: string;
    facebookName?: string;
    areaNeed?: string;
    budgetMin?: number;
    budgetMax?: number;
    peopleCount?: number;
    requirements?: string[];
    sourceProfileId?: string;
    assignedToId?: string;
    note?: string;
  }) {
    const customer = await this.prisma.customer.create({
      data: {
        name: data.name,
        phone: data.phone,
        facebookName: data.facebookName,
        areaNeed: data.areaNeed,
        budgetMin: data.budgetMin,
        budgetMax: data.budgetMax,
        peopleCount: data.peopleCount,
        requirements: data.requirements ?? [],
        sourceProfileId: data.sourceProfileId,
        assignedToId: data.assignedToId,
        status: data.phone ? CustomerStatus.HAS_PHONE : CustomerStatus.NEW,
      },
    });

    if (data.phone) {
      await this.telegram.notify({
        event: NotifyEvent.LEFT_PHONE,
        text: this.telegram.formatLeftPhone({
          name: data.name,
          phone: data.phone,
          need: [data.areaNeed, data.budgetMax ? `~${data.budgetMax}đ` : '']
            .filter(Boolean)
            .join(', '),
          note: data.note,
        }),
        payload: { customerId: customer.id },
        dedupeKey: `left_phone:${customer.id}`,
      });
    }

    return customer;
  }

  update(id: string, data: Prisma.CustomerUpdateInput) {
    return this.prisma.customer.update({ where: { id }, data });
  }

  addNote(id: string, content: string, authorId?: string) {
    return this.prisma.customerNote.create({
      data: { customerId: id, content, authorId },
    });
  }
}
