import { Global, Module } from '@nestjs/common';
import { LimitsService } from './limits.service';

// Global: LimitsService dùng ở nhiều module (ai, admin). PrismaService global.
@Global()
@Module({
  providers: [LimitsService],
  exports: [LimitsService],
})
export class BillingModule {}
