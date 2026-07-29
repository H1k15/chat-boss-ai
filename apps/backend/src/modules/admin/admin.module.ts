import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { TenantAdminService } from './tenant-admin.service';
import { TenantAdminController } from './tenant-admin.controller';

// Module SUPER_ADMIN: quản lý nhà trọ (org). PrismaService global.
@Module({
  controllers: [AdminController, TenantAdminController],
  providers: [AdminService, TenantAdminService],
})
export class AdminModule {}
