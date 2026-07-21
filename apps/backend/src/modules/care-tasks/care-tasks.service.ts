import { Injectable } from '@nestjs/common';
import { Prisma, CareTaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CareTasksService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: { staffId?: string; status?: CareTaskStatus; due?: string }) {
    const where: Prisma.CareTaskWhereInput = {};
    if (query.staffId) where.assignedToId = query.staffId;
    if (query.status) where.status = query.status;
    if (query.due === 'today') {
      // Không đặt mốc dưới: cố ý gồm cả task quá hạn từ ngày trước, vì
      // nhân viên cần thấy việc tồn đọng chứ không chỉ việc phát sinh hôm nay.
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      where.dueAt = { lte: end };
      where.status = CareTaskStatus.PENDING;
    }
    return this.prisma.careTask.findMany({
      where,
      include: { customer: true },
      orderBy: { dueAt: 'asc' },
    });
  }

  create(data: { customerId: string; assignedToId?: string; dueAt: string; reason?: string }) {
    return this.prisma.careTask.create({
      data: {
        customerId: data.customerId,
        assignedToId: data.assignedToId,
        dueAt: new Date(data.dueAt),
        reason: data.reason,
      },
    });
  }

  update(id: string, data: Prisma.CareTaskUpdateInput) {
    return this.prisma.careTask.update({ where: { id }, data });
  }
}
