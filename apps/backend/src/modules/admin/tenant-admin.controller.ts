import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { UserRole } from '@cba/shared';
import { Roles } from '../auth/roles.guard';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import {
  ApplyChangesInput,
  TenantAdminService,
} from './tenant-admin.service';

// API "Quản lý nhà trọ" (SUPER_ADMIN). apply-changes = save-all nguyên tử.
@Controller('admin/tenants')
@Roles(UserRole.SUPER_ADMIN)
export class TenantAdminController {
  constructor(private readonly svc: TenantAdminService) {}

  @Get()
  list(@Query('includeArchived') inc?: string) {
    return this.svc.listTenants({
      includeArchived: inc === '1' || inc === 'true',
    });
  }

  @Post('apply-changes')
  apply(@Req() req: AuthenticatedRequest, @Body() body: ApplyChangesInput) {
    return this.svc.applyChanges(body, {
      actorUserId: req.user.userId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('purge')
  purge(
    @Req() req: AuthenticatedRequest,
    @Body() body: { olderThanDays?: number; dryRun?: boolean },
  ) {
    return this.svc.purgeStale(body ?? {}, {
      actorUserId: req.user.userId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
