import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { runWithTenant } from './tenant-context';
import type { AuthenticatedRequest } from '../modules/auth/authenticated-request';

// Đặt tenant context cho MỖI request: đọc organizationId (do JwtAuthGuard gắn vào
// req.user) rồi chạy toàn bộ handler trong AsyncLocalStorage.run -> mọi truy vấn
// Prisma phía sau tự lọc theo org. Route @Public (không user) chạy không scope.
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Partial<AuthenticatedRequest>>();
    const orgId = req?.user?.organizationId;
    // SUPER_ADMIN quản lý xuyên org -> KHÔNG đặt tenant context (truy vấn không
    // bị lọc theo một org), để module admin thấy/thao tác mọi nhà trọ.
    if (!orgId || req?.user?.role === 'SUPER_ADMIN') return next.handle();

    // Bọc subscribe trong ALS.run để context phủ cả quá trình chạy handler.
    return new Observable((subscriber) => {
      runWithTenant({ organizationId: orgId }, () => {
        next.handle().subscribe({
          next: (v) => subscriber.next(v),
          error: (e) => subscriber.error(e),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
