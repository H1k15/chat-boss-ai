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

  // Phòng nào được hẹn xem nhiều nhất — gộp lịch hẹn theo phòng, kèm mã phòng.
  async byRoom() {
    const grouped = await this.prisma.appointment.groupBy({
      by: ['roomId'],
      where: { roomId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { roomId: 'desc' } },
    });
    const roomIds = grouped
      .map((g) => g.roomId)
      .filter((id): id is string => Boolean(id));
    const rooms = await this.prisma.room.findMany({
      where: { id: { in: roomIds } },
      select: { id: true, roomCode: true, area: true, status: true },
    });
    const byId = new Map(rooms.map((r) => [r.id, r]));
    return grouped.map((g) => ({
      room: g.roomId ? byId.get(g.roomId) : null,
      appointments: g._count._all,
    }));
  }
}
