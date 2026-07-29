import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@cba/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { LimitsService } from '../billing/limits.service';
import { currentOrgId } from '../../common/tenant';

// Vai trò mà ADMIN (chủ trọ) được phép giao cho nhân viên. KHÔNG cho tạo/sửa
// thành ADMIN hay SUPER_ADMIN qua đây -> chống leo thang quyền.
const ASSIGNABLE: UserRole[] = [UserRole.STAFF, UserRole.MANAGER];

const SAFE_SELECT = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

// Quản lý nhân viên TRONG nội bộ một nhà trọ (self-service của ADMIN). Truy vấn
// user tự lọc theo org nhờ tenant middleware; riêng UserSession KHÔNG bị lọc nên
// phải nêu organizationId tường minh.
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
  ) {}

  /** Danh sách nhân viên của nhà trọ (kèm số thiết bị đang đăng nhập). */
  async findAll() {
    const users = await this.prisma.user.findMany({
      where: { role: { not: UserRole.SUPER_ADMIN } },
      select: SAFE_SELECT,
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    });
    const sessions = await this.prisma.userSession.groupBy({
      by: ['userId'],
      where: { organizationId: currentOrgId(), revokedAt: null },
      _count: { userId: true },
    });
    const byUser = new Map(sessions.map((s) => [s.userId, s._count.userId]));
    return users.map((u) => ({ ...u, activeSessions: byUser.get(u.id) ?? 0 }));
  }

  /** Tạo nhân viên mới (STAFF/MANAGER). Chặn nếu vượt trần gói. */
  async create(data: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    role?: UserRole;
  }) {
    const email = data.email?.trim().toLowerCase();
    if (!email || !data.password)
      throw new BadRequestException('Thiếu email hoặc mật khẩu');
    if (data.password.length < 6)
      throw new BadRequestException('Mật khẩu tối thiểu 6 ký tự');
    const role = data.role ?? UserRole.STAFF;
    if (!ASSIGNABLE.includes(role))
      throw new BadRequestException('Chỉ được tạo tài khoản Nhân viên hoặc Quản lý');

    await this.limits.assertCanAddUser(currentOrgId()); // trần gói
    const dup = await this.prisma.user.findFirst({ where: { email } });
    if (dup) throw new BadRequestException('Email đã tồn tại trong nhà trọ này');

    return this.prisma.user.create({
      data: {
        email,
        fullName: data.fullName?.trim() || email,
        phone: data.phone?.trim() || null,
        role,
        passwordHash: await bcrypt.hash(data.password, 10),
        mustChangePassword: true, // buộc đổi mật khẩu lần đăng nhập đầu
      },
      select: SAFE_SELECT,
    });
  }

  /** Sửa nhân viên: tên/điện thoại/vai trò/khoá-mở/đặt lại mật khẩu. */
  async update(
    id: string,
    input: {
      fullName?: string;
      phone?: string;
      role?: UserRole;
      isActive?: boolean;
      password?: string;
    },
    actorId: string,
  ) {
    const target = await this.loadManageable(id, actorId);
    const data: Record<string, unknown> = {};
    if (input.fullName !== undefined) data.fullName = input.fullName.trim();
    if (input.phone !== undefined) data.phone = input.phone.trim() || null;
    if (input.role !== undefined) {
      if (!ASSIGNABLE.includes(input.role))
        throw new BadRequestException('Vai trò không hợp lệ');
      data.role = input.role;
    }
    if (input.password) {
      if (input.password.length < 6)
        throw new BadRequestException('Mật khẩu tối thiểu 6 ký tự');
      data.passwordHash = await bcrypt.hash(input.password, 10);
      data.mustChangePassword = true;
    }
    if (input.isActive !== undefined) {
      // Mở lại một tài khoản đang khoá cũng tính vào trần gói.
      if (input.isActive && !target.isActive)
        await this.limits.assertCanAddUser(currentOrgId());
      data.isActive = input.isActive;
    }
    if (Object.keys(data).length === 0)
      throw new BadRequestException('Không có thay đổi nào');

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: SAFE_SELECT,
    });
    // Đổi vai trò / khoá tài khoản / đổi mật khẩu -> thu hồi phiên để buộc đăng
    // nhập lại (áp dụng quyền mới, chặn truy cập cũ).
    if (data.role || data.passwordHash || input.isActive === false)
      await this.revokeSessions(id);
    return updated;
  }

  /** "Xoá" nhân viên = vô hiệu hoá + thu hồi phiên (giữ lịch sử, giải phóng suất).
   *  Có dữ liệu liên quan nên không xoá cứng; mở lại được bằng update isActive. */
  async remove(id: string, actorId: string) {
    await this.loadManageable(id, actorId);
    await this.prisma.user.update({ where: { id }, data: { isActive: false } });
    await this.revokeSessions(id);
    return { ok: true };
  }

  // Nạp nhân viên và chặn thao tác trái phép: không có / là SUPER_ADMIN hoặc
  // ADMIN (chủ trọ - bảo vệ) / chính mình (tránh tự khoá).
  private async loadManageable(id: string, actorId: string) {
    if (id === actorId)
      throw new ForbiddenException('Không thể tự thao tác trên tài khoản của mình');
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, isActive: true },
    });
    if (!target) throw new NotFoundException('Không tìm thấy nhân viên');
    if (target.role === UserRole.SUPER_ADMIN || target.role === UserRole.ADMIN)
      throw new ForbiddenException('Không thể thao tác trên tài khoản quản trị');
    return target;
  }

  private revokeSessions(userId: string) {
    return this.prisma.userSession.updateMany({
      where: { userId, organizationId: currentOrgId(), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
