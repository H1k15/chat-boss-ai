import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { planFor } from '../../common/plans';
import { currentOrgId } from '../../common/tenant';

// Kiểm tra giới hạn theo gói của org. Chặn vượt hạn mức (số NV, gợi ý AI/ngày).
@Injectable()
export class LimitsService {
  constructor(private readonly prisma: PrismaService) {}

  private async planOf(orgId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    return planFor(org?.plan);
  }

  /** Chặn thêm nhân viên nếu đã đạt trần gói. */
  async assertCanAddUser(orgId: string): Promise<void> {
    const plan = await this.planOf(orgId);
    if (plan.maxUsers == null) return;
    const count = await this.prisma.user.count({ where: { organizationId: orgId } });
    if (count >= plan.maxUsers)
      throw new ForbiddenException(
        `Gói "${plan.label}" tối đa ${plan.maxUsers} nhân viên. Nâng gói để thêm.`,
      );
  }

  /** Số gợi ý AI đã dùng hôm nay / hạn mức / còn lại (theo org của request). */
  async aiDailyStatus(): Promise<{
    used: number;
    limit: number | null;
    remaining: number | null;
  }> {
    const plan = await this.planOf(currentOrgId());
    if (plan.maxAiPerDay == null) return { used: 0, limit: null, remaining: null };
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    // count tự lọc theo org nhờ tenant middleware (AI_SUGGEST có organizationId).
    const used = await this.prisma.activityLog.count({
      where: { action: 'AI_SUGGEST', createdAt: { gte: start } },
    });
    return { used, limit: plan.maxAiPerDay, remaining: Math.max(0, plan.maxAiPerDay - used) };
  }

  /** Chặn gọi AI nếu đã hết hạn mức trong ngày. */
  async assertAiWithinDaily(): Promise<void> {
    const s = await this.aiDailyStatus();
    if (s.remaining !== null && s.remaining <= 0)
      throw new ForbiddenException(
        `Đã đạt giới hạn ${s.limit} gợi ý AI/ngày của gói. Nâng gói để dùng tiếp.`,
      );
  }
}
