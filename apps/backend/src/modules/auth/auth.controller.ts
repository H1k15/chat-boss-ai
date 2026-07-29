import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { Public } from './jwt-auth.guard';
import { AllowExpired } from '../../common/subscription.guard';
import type { AuthenticatedRequest } from './authenticated-request';

// Lấy thông tin thiết bị để gắn vào phiên (giới hạn số thiết bị theo gói).
function sessionMeta(req: Request) {
  const fwd = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim() || req.ip;
  return { userAgent: req.headers['user-agent'], ip };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(
    @Body() body: { email: string; password: string },
    @Req() req: Request,
  ) {
    return this.auth.login(body.email, body.password, sessionMeta(req));
  }

  @Public()
  @Post('refresh')
  refresh(@Body() body: { refreshToken: string }) {
    return this.auth.refresh(body.refreshToken);
  }

  @AllowExpired()
  @Get('me')
  me(@Req() req: AuthenticatedRequest) {
    return this.auth.me(req.user.userId);
  }

  // Người dùng đã đăng nhập tự đổi mật khẩu (cả khi hết hạn gói).
  @AllowExpired()
  @Post('change-password')
  changePassword(
    @Req() req: AuthenticatedRequest,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    return this.auth.changePassword(
      req.user.userId,
      body.currentPassword,
      body.newPassword,
    );
  }

  // Đăng xuất: thu hồi phiên (UserSession) theo refreshToken để giải phóng chỗ
  // trong hạn mức thiết bị của gói. Không có token thì chỉ trả ok (client tự xoá).
  @Post('logout')
  @Public()
  logout(@Body() body: { refreshToken?: string }) {
    return this.auth.logout(body?.refreshToken);
  }
}
