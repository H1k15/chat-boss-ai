import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@cba/shared';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { deaccent } from '../../common/vietnamese';

export interface CreateOrgInput {
  name: string;
  slug?: string;
  plan?: string;
  adminEmail: string;
  adminPassword: string;
  adminName?: string;
}

// Chuẩn hoá slug: bỏ dấu, thường hoá, chỉ còn a-z0-9 và gạch nối.
function slugify(s: string): string {
  return deaccent(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

// Dịch vụ SUPER_ADMIN: quản lý các Organization (nhà trọ). Chạy KHÔNG có tenant
// context (interceptor bỏ qua super-admin) nên phải nêu organizationId tường minh
// khi tạo/đếm dữ liệu của một org cụ thể.
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** Tạo nhà trọ mới + tài khoản ADMIN đầu tiên của nó. */
  async createOrganization(input: CreateOrgInput) {
    const name = input.name?.trim();
    const email = input.adminEmail?.trim().toLowerCase();
    if (!name) throw new BadRequestException('Thiếu tên nhà trọ');
    if (!email || !input.adminPassword)
      throw new BadRequestException('Thiếu email/mật khẩu admin');

    const slug = slugify(input.slug || name);
    if (!slug) throw new BadRequestException('Slug không hợp lệ');
    if (await this.prisma.organization.findUnique({ where: { slug } }))
      throw new BadRequestException(`Slug "${slug}" đã tồn tại`);

    const org = await this.prisma.organization.create({
      data: { name, slug, plan: input.plan || 'free' },
    });
    await this.prisma.user.create({
      data: {
        organizationId: org.id,
        email,
        passwordHash: await bcrypt.hash(input.adminPassword, 10),
        fullName: input.adminName?.trim() || 'Quản trị viên',
        role: UserRole.ADMIN,
      },
    });
    return org;
  }

  /** Danh sách nhà trọ kèm số liệu (user/phòng/khách). */
  async listOrganizations() {
    const orgs = await this.prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      orgs.map(async (o) => {
        const [users, rooms, customers] = await Promise.all([
          this.prisma.user.count({ where: { organizationId: o.id } }),
          this.prisma.room.count({ where: { organizationId: o.id } }),
          this.prisma.customer.count({ where: { organizationId: o.id } }),
        ]);
        return { ...o, counts: { users, rooms, customers } };
      }),
    );
  }

  /** Khoá / mở lại một nhà trọ (isActive). */
  async setActive(id: string, isActive: boolean) {
    if (!(await this.prisma.organization.findUnique({ where: { id } })))
      throw new NotFoundException('Không tìm thấy nhà trọ');
    return this.prisma.organization.update({ where: { id }, data: { isActive } });
  }

  /** Tạo thêm nhân viên cho một nhà trọ (STAFF/MANAGER/ADMIN). */
  async createUser(
    orgId: string,
    input: { email: string; password: string; fullName?: string; role?: UserRole },
  ) {
    if (!(await this.prisma.organization.findUnique({ where: { id: orgId } })))
      throw new NotFoundException('Không tìm thấy nhà trọ');
    const email = input.email?.trim().toLowerCase();
    if (!email || !input.password)
      throw new BadRequestException('Thiếu email/mật khẩu');
    const dup = await this.prisma.user.findFirst({
      where: { organizationId: orgId, email },
    });
    if (dup) throw new BadRequestException('Email đã tồn tại trong nhà trọ này');
    const user = await this.prisma.user.create({
      data: {
        organizationId: orgId,
        email,
        passwordHash: await bcrypt.hash(input.password, 10),
        fullName: input.fullName?.trim() || email,
        role: input.role || UserRole.STAFF,
      },
    });
    return { id: user.id, email: user.email, role: user.role };
  }
}
