import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { UserRole } from '@cba/shared';
import { AdminService, CreateOrgInput } from './admin.service';
import { Roles } from '../auth/roles.guard';

// API cho SUPER_ADMIN (chủ SaaS) quản lý các nhà trọ. TẤT CẢ chỉ SUPER_ADMIN.
// Super-admin chạy không có tenant context nên thấy/thao tác được xuyên org.
@Controller('admin/organizations')
@Roles(UserRole.SUPER_ADMIN)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Post()
  create(@Body() body: CreateOrgInput) {
    return this.admin.createOrganization(body);
  }

  @Get()
  list() {
    return this.admin.listOrganizations();
  }

  @Patch(':id/active')
  setActive(@Param('id') id: string, @Body() body: { isActive: boolean }) {
    return this.admin.setActive(id, !!body.isActive);
  }

  @Patch(':id/plan')
  setPlan(@Param('id') id: string, @Body() body: { plan: string }) {
    return this.admin.setPlan(id, body.plan);
  }

  @Patch(':id/subscription')
  setExpiry(
    @Param('id') id: string,
    @Body() body: { addDays?: number; expiresAt?: string | null },
  ) {
    return this.admin.setExpiry(id, body);
  }

  @Post(':id/users')
  addUser(
    @Param('id') id: string,
    @Body()
    body: { email: string; password: string; fullName?: string; role?: UserRole },
  ) {
    return this.admin.createUser(id, body);
  }
}
