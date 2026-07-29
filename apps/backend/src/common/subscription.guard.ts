import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../modules/auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

// Đánh dấu route VẪN dùng được khi hết hạn (đăng nhập/xem trạng thái/kích hoạt key).
export const ALLOW_EXPIRED_KEY = 'allowExpired';
export const AllowExpired = () => SetMetadata(ALLOW_EXPIRED_KEY, true);

// Chặn org đã HẾT HẠN hoặc bị KHOÁ ở các endpoint giá trị. Nguồn sự thật là DB
// (không tin client). Super-admin và route @Public/@AllowExpired được bỏ qua.
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const flag = (key: string) =>
      this.reflector.getAllAndOverride<boolean>(key, [
        ctx.getHandler(),
        ctx.getClass(),
      ]);
    if (flag(IS_PUBLIC_KEY) || flag(ALLOW_EXPIRED_KEY)) return true;

    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (!user || user.role === 'SUPER_ADMIN' || !user.organizationId) return true;

    const org = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { isActive: true, subscriptionExpiresAt: true },
    });
    if (org && org.isActive === false)
      throw new ForbiddenException('Tài khoản đã bị khoá. Liên hệ quản trị.');
    if (
      org?.subscriptionExpiresAt &&
      org.subscriptionExpiresAt.getTime() < Date.now()
    )
      throw new ForbiddenException(
        'Gói dịch vụ đã hết hạn. Vui lòng gia hạn để tiếp tục sử dụng.',
      );
    return true;
  }
}
