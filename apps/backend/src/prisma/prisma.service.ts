import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { applyTenantScope, getOrgId } from '../common/tenant-context';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    // CÁCH LY TENANT: truy vấn nào có tenant context (trong request) tự được chèn
    // organizationId. Ngoài request (script/seed/cron) -> không scope.
    this.$use(async (params, next) => {
      const orgId = getOrgId();
      if (orgId) applyTenantScope(params, orgId);
      return next(params);
    });
    await this.$connect();
  }
}
