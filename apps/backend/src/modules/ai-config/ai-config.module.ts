import { Module } from '@nestjs/common';
import { AiConfigService } from './ai-config.service';
import { AiConfigController } from './ai-config.controller';

// Quản lý cấu hình AI (điểm mốc + cụm khu) qua AppSetting. PrismaService global.
@Module({
  controllers: [AiConfigController],
  providers: [AiConfigService],
})
export class AiConfigModule {}
