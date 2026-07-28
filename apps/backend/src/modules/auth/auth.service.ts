import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    // findFirst (không phải findUnique): email nay duy nhất theo (org, email),
    // đăng nhập chưa biết org nên tìm theo email. Đợt 2 (multi-tenant thật) sẽ
    // xác định org qua subdomain/slug trước khi tra user.
    const user = await this.prisma.user.findFirst({ where: { email } });
    if (!user || !user.isActive)
      throw new UnauthorizedException('Sai tài khoản hoặc mật khẩu');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Sai tài khoản hoặc mật khẩu');

    const payload = { sub: user.id, role: user.role, email: user.email };
    return {
      accessToken: this.jwt.sign(payload, {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: process.env.JWT_ACCESS_TTL || '15m',
      }),
      refreshToken: this.jwt.sign(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: process.env.JWT_REFRESH_TTL || '7d',
      }),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }

  /** Thông tin tài khoản đang đăng nhập. Không trả passwordHash. */
  async me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
      },
    });
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwt.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
      return {
        accessToken: this.jwt.sign(
          { sub: payload.sub, role: payload.role, email: payload.email },
          {
            secret: process.env.JWT_ACCESS_SECRET,
            expiresIn: process.env.JWT_ACCESS_TTL || '15m',
          },
        ),
      };
    } catch {
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }
  }
}
