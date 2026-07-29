import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { planFor } from '../../common/plans';

interface SessionMeta {
  userAgent?: string;
  ip?: string;
}
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string, meta: SessionMeta = {}) {
    // findFirst: email duy nhất theo (org, email); đăng nhập chưa biết org.
    const user = await this.prisma.user.findFirst({ where: { email } });
    if (!user || !user.isActive)
      throw new UnauthorizedException('Sai tài khoản hoặc mật khẩu');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Sai tài khoản hoặc mật khẩu');

    const payload = {
      sub: user.id,
      role: user.role,
      email: user.email,
      organizationId: user.organizationId,
    };
    const accessToken = this.jwt.sign(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: process.env.JWT_ACCESS_TTL || '15m',
    });
    const refreshToken = this.jwt.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: process.env.JWT_REFRESH_TTL || '7d',
    });

    await this.createSession(user.id, user.organizationId, refreshToken, meta);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  // Tạo phiên; ÉP giới hạn thiết bị của gói: vượt maxSeats -> thu hồi phiên CŨ
  // nhất (thiết bị lâu không dùng bị đá ra) để nhường chỗ thiết bị mới.
  private async createSession(
    userId: string,
    organizationId: string,
    refreshToken: string,
    meta: SessionMeta,
  ) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { plan: true },
    });
    const plan = planFor(org?.plan);
    if (plan.maxSeats != null) {
      const active = await this.prisma.userSession.findMany({
        where: { organizationId, revokedAt: null },
        orderBy: { lastSeenAt: 'asc' },
        select: { id: true },
      });
      const over = active.length + 1 - plan.maxSeats;
      if (over > 0)
        await this.prisma.userSession.updateMany({
          where: { id: { in: active.slice(0, over).map((s) => s.id) } },
          data: { revokedAt: new Date() },
        });
    }
    await this.prisma.userSession.create({
      data: {
        userId,
        organizationId,
        refreshTokenHash: hashToken(refreshToken),
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
        ip: meta.ip ?? null,
      },
    });
  }

  async me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
      },
    });
  }

  async refresh(refreshToken: string) {
    let payload: {
      sub: string;
      role: string;
      email: string;
      organizationId?: string;
    };
    try {
      payload = this.jwt.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }
    // Phiên phải còn hiệu lực (chưa bị thu hồi vì đăng xuất / vượt số thiết bị).
    const session = await this.prisma.userSession.findUnique({
      where: { refreshTokenHash: hashToken(refreshToken) },
    });
    if (!session || session.revokedAt)
      throw new UnauthorizedException(
        'Phiên đã kết thúc (đăng nhập nơi khác hoặc vượt số thiết bị của gói). Đăng nhập lại.',
      );
    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
    return {
      accessToken: this.jwt.sign(
        {
          sub: payload.sub,
          role: payload.role,
          email: payload.email,
          organizationId: payload.organizationId,
        },
        {
          secret: process.env.JWT_ACCESS_SECRET,
          expiresIn: process.env.JWT_ACCESS_TTL || '15m',
        },
      ),
    };
  }

  // Người dùng tự đổi mật khẩu (xoá cờ mustChangePassword). Không thu hồi phiên
  // hiện tại để họ dùng tiếp; các phiên khác vẫn còn hiệu lực.
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    if (!newPassword || newPassword.length < 6)
      throw new BadRequestException('Mật khẩu mới tối thiểu 6 ký tự');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestException('Mật khẩu hiện tại không đúng');
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await bcrypt.hash(newPassword, 10),
        mustChangePassword: false,
      },
    });
    return { ok: true };
  }

  async logout(refreshToken?: string) {
    if (refreshToken)
      await this.prisma.userSession.updateMany({
        where: { refreshTokenHash: hashToken(refreshToken) },
        data: { revokedAt: new Date() },
      });
    return { ok: true };
  }
}
