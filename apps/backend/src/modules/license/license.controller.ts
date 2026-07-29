import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { UserRole } from '@cba/shared';
import { LicenseService } from './license.service';
import { Roles } from '../auth/roles.guard';
import { AllowExpired } from '../../common/subscription.guard';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

@Controller()
export class LicenseController {
  constructor(private readonly license: LicenseService) {}

  // Super-admin sinh/liệt kê key.
  @Roles(UserRole.SUPER_ADMIN)
  @Post('admin/licenses')
  generate(
    @Body() body: { durationDays: number; count?: number; plan?: string; note?: string },
  ) {
    return this.license.generate(body);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Get('admin/licenses')
  list() {
    return this.license.list();
  }

  // Org kích hoạt key / xem trạng thái — VẪN cho khi hết hạn (để còn gia hạn được).
  @AllowExpired()
  @Post('license/activate')
  activate(@Req() req: AuthenticatedRequest, @Body() body: { key: string }) {
    return this.license.activate(req.user.organizationId ?? '', body.key);
  }

  @AllowExpired()
  @Get('license/status')
  status(@Req() req: AuthenticatedRequest) {
    return this.license.status(req.user.organizationId ?? '');
  }
}
