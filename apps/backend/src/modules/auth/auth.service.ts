import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { planFor, MAX_SESSIONS_PER_USER } from '../../common/plans';

interface SessionMeta {
  userAgent?: string;
  ip?: string;
  deviceId?: string; // mã MÁY (dashboard + extension cùng máy dùng chung)
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
    // jti ngẫu nhiên: hai lần đăng nhập cùng giây (dashboard + extension) nếu
    // không có nó sẽ ký ra refresh token Y HỆT NHAU -> trùng refreshTokenHash
    // (khóa duy nhất) khi 2 phiên cùng tồn tại. jti đảm bảo mỗi token là duy nhất.
    const refreshToken = this.jwt.sign(
      { ...payload, jti: randomUUID() },
      {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: process.env.JWT_REFRESH_TTL || '7d',
      },
    );

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

  // Tạo phiên theo 3 quy tắc:
  //  0) ĐÁ NGUYÊN MÁY CŨ (khi có deviceId): đăng nhập từ MÁY MỚI thu hồi NGAY mọi
  //     phiên của tài khoản có deviceId khác (kể cả phiên cũ chưa gắn máy = null).
  //     dashboard + extension của CÙNG máy dùng chung deviceId nên vẫn sống chung.
  //  1) MỖI MÁY tối đa MAX_SESSIONS_PER_USER phiên (dashboard + extension). Vượt
  //     -> đá phiên CŨ NHẤT trên chính máy đó (không làm tăng tổng phiên org).
  //  2) TRẦN KEY = tổng phiên đồng thời của org (maxSeats). Chỉ khi phiên mới LÀM
  //     TĂNG tổng mới xét: tổng hiện tại >= maxSeats -> CHẶN, không đá ai.
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

    // Quy tắc 0: đá nguyên máy cũ (và phiên legacy chưa gắn deviceId).
    if (meta.deviceId)
      await this.prisma.userSession.updateMany({
        where: {
          organizationId,
          userId,
          revokedAt: null,
          OR: [{ deviceId: { not: meta.deviceId } }, { deviceId: null }],
        },
        data: { revokedAt: new Date() },
      });

    // Phiên còn lại trên MÁY hiện tại (nếu có deviceId) hoặc của tài khoản.
    const mine = await this.prisma.userSession.findMany({
      where: {
        organizationId,
        userId,
        revokedAt: null,
        ...(meta.deviceId ? { deviceId: meta.deviceId } : {}),
      },
      orderBy: { lastSeenAt: 'asc' }, // cũ nhất trước
      select: { id: true },
    });

    if (mine.length >= MAX_SESSIONS_PER_USER) {
      // Quy tắc 1: máy đủ số bề mặt -> đá phiên cũ nhất để chừa chỗ (tổng không đổi).
      const evict = mine.length - (MAX_SESSIONS_PER_USER - 1);
      await this.prisma.userSession.updateMany({
        where: { id: { in: mine.slice(0, evict).map((s) => s.id) } },
        data: { revokedAt: new Date() },
      });
    } else if (plan.maxSeats != null) {
      // Quy tắc 2: phiên mới làm TĂNG tổng phiên org -> ép trần Key.
      const total = await this.prisma.userSession.count({
        where: { organizationId, revokedAt: null },
      });
      if (total >= plan.maxSeats)
        throw new ForbiddenException(
          `Vượt số phiên của Key: gói "${plan.label}" chỉ cho ${plan.maxSeats} phiên đăng nhập cùng lúc. Vui lòng đăng xuất bớt một thiết bị/phiên khác rồi thử lại.`,
        );
    }

    await this.prisma.userSession.create({
      data: {
        userId,
        organizationId,
        refreshTokenHash: hashToken(refreshToken),
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
        ip: meta.ip ?? null,
        deviceId: meta.deviceId ?? null,
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
