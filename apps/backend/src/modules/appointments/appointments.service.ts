import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CustomerStatus, NotifyEvent } from '@cba/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  findAll(query: { date?: string; staffId?: string; status?: string }) {
    const where: Prisma.AppointmentWhereInput = {};
    if (query.staffId) where.staffId = query.staffId;
    if (query.status) where.status = query.status as never;
    if (query.date) {
      const d = new Date(query.date);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      where.appointmentTime = { gte: d, lt: next };
    }
    return this.prisma.appointment.findMany({
      where,
      include: { customer: true, room: true, staff: true },
      orderBy: { appointmentTime: 'asc' },
    });
  }

  async create(data: {
    customerId: string;
    roomId?: string;
    appointmentTime: string;
    appointmentAddress?: string;
    staffId?: string;
    note?: string;
  }) {
    const appt = await this.prisma.appointment.create({
      data: {
        customerId: data.customerId,
        roomId: data.roomId,
        appointmentTime: new Date(data.appointmentTime),
        appointmentAddress: data.appointmentAddress,
        staffId: data.staffId,
        note: data.note,
      },
      include: { customer: true, room: true, staff: true },
    });

    await this.prisma.customer.update({
      where: { id: data.customerId },
      data: { status: CustomerStatus.APPOINTED },
    });

    await this.telegram.notify({
      event: NotifyEvent.APPOINTMENT,
      text: [
        '📅 <b>Khách hẹn xem phòng</b>',
        `Tên: ${appt.customer.name || '(chưa rõ)'}`,
        `SĐT: ${appt.customer.phone || '-'}`,
        `Phòng: ${appt.room?.roomCode || '-'}`,
        `Địa chỉ: ${appt.appointmentAddress || appt.room?.address || '-'}`,
        `Giờ hẹn: ${appt.appointmentTime.toLocaleString('vi-VN')}`,
        `Người đón: ${appt.staff?.fullName || '-'}`,
      ].join('\n'),
      payload: { appointmentId: appt.id },
      dedupeKey: `appointment:${appt.id}`,
    });

    return appt;
  }

  update(id: string, data: Prisma.AppointmentUpdateInput) {
    return this.prisma.appointment.update({ where: { id }, data });
  }
}
