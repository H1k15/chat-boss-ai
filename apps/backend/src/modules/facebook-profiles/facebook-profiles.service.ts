import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FacebookProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(ownerId?: string) {
    return this.prisma.facebookProfile.findMany({
      where: ownerId ? { ownerId } : {},
      include: { owner: { select: { fullName: true } } },
    });
  }

  create(data: Prisma.FacebookProfileUncheckedCreateInput) {
    return this.prisma.facebookProfile.create({ data });
  }

  update(id: string, data: Prisma.FacebookProfileUpdateInput) {
    return this.prisma.facebookProfile.update({ where: { id }, data });
  }
}
