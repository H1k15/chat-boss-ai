import { ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Đánh dấu endpoint không cần đăng nhập.
 *
 * Guard được đăng ký TOÀN CỤC (xem AppModule) nên mặc định mọi route đều
 * phải có JWT — đây là lựa chọn có chủ ý: quên gắn guard cho một controller
 * mới sẽ làm lộ dữ liệu khách, còn quên gắn @Public() thì chỉ gây lỗi 401 dễ
 * thấy ngay. Fail đóng, không fail mở.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
