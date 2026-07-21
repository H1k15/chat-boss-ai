import { Injectable } from '@nestjs/common';
import { Prisma, RoomStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: {
    area?: string;
    status?: RoomStatus;
    priceMax?: number;
    roomType?: string;
    q?: string;
  }) {
    const where: Prisma.RoomWhereInput = {};
    if (query.area) where.area = { contains: query.area, mode: 'insensitive' };
    if (query.status) where.status = query.status;
    if (query.priceMax) where.price = { lte: query.priceMax };
    if (query.roomType) where.roomType = { contains: query.roomType, mode: 'insensitive' };
    if (query.q) where.roomCode = { contains: query.q, mode: 'insensitive' };
    return this.prisma.room.findMany({ where, orderBy: { updatedAt: 'desc' } });
  }

  findOne(id: string) {
    return this.prisma.room.findUnique({ where: { id } });
  }

  create(data: Prisma.RoomCreateInput) {
    return this.prisma.room.create({ data });
  }

  update(id: string, data: Prisma.RoomUpdateInput) {
    return this.prisma.room.update({ where: { id }, data });
  }
}
