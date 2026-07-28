import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';

// Module SUPER_ADMIN: quản lý nhà trọ (org). PrismaService global.
@Module({
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
