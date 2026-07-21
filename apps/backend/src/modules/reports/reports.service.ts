import { Injectable } from '@nestjs/common';
import { CustomerStatus } from '@cba/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const [total, hasPhone, appointed, closed] = await Promise.all([
      this.prisma.customer.count(),
      this.prisma.customer.count({ where: { phone: { not: null } } }),
      this.prisma.customer.count({ where: { status: CustomerStatus.APPOINTED } }),
      this.prisma.customer.count({ where: { status: CustomerStatus.CLOSED } }),
    ]);
    return {
      totalCustomers: total,
      withPhone: hasPhone,
      appointed,
      closed,
      closeRate: total ? +(closed / total).toFixed(3) : 0,
    };
  }

  byStaff() {
    return this.prisma.customer.groupBy({
      by: ['assignedToId'],
      _count: { _all: true },
    });
  }

  byArea() {
    return this.prisma.customer.groupBy({
      by: ['areaNeed'],
      _count: { _all: true },
    });
  }
}
