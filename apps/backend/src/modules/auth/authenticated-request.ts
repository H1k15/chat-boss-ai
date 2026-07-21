import type { Request } from 'express';
import type { UserRole } from '@cba/shared';

/** Người dùng đã xác thực, do JwtStrategy.validate() gắn vào request. */
export interface AuthUser {
  userId: string;
  role: UserRole;
  email: string;
}

/** Request đã qua JwtAuthGuard — luôn có `user`. */
export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}
