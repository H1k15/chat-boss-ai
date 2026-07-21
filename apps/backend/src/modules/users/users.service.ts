import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@cba/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({
      select: { id: true, email: true, fullName: true, role: true, isActive: true },
    });
  }

  async create(data: { email: string; password: string; fullName: string; role?: UserRole }) {
    return this.prisma.user.create({
      data: {
        email: data.email,
        fullName: data.fullName,
        role: data.role ?? UserRole.STAFF,
        passwordHash: await bcrypt.hash(data.password, 10),
      },
      select: { id: true, email: true, fullName: true, role: true },
    });
  }

  setActive(id: string, isActive: boolean) {
    return this.prisma.user.update({ where: { id }, data: { isActive } });
  }
}
