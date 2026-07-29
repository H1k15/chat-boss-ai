import { Module } from '@nestjs/common';
import { LicenseService } from './license.service';
import { LicenseController } from './license.controller';

// License/hạn dùng: super-admin sinh key, org kích hoạt gia hạn. PrismaService global.
@Module({
  controllers: [LicenseController],
  providers: [LicenseService],
})
export class LicenseModule {}
