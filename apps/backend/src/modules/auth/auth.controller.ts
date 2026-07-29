import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './jwt-auth.guard';
import { AllowExpired } from '../../common/subscription.guard';
import type { AuthenticatedRequest } from './authenticated-request';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.auth.login(body.email, body.password);
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

  // JWT là stateless nên đăng xuất chủ yếu là client tự xoá token. Endpoint
  // này để client gọi cho nhất quán; thu hồi token thật cần danh sách chặn
  // (denylist) — chưa dựng, ghi lại làm việc sau nếu cần bảo mật chặt hơn.
  @Post('logout')
  logout() {
    return { ok: true };
  }
}
