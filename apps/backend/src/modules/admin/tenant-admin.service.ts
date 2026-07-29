import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UserRole } from '@cba/shared';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { PLAN_KEYS } from '../../common/plans';
import { DEFAULT_ORG_ID } from '../../common/tenant';
import { deaccent } from '../../common/vietnamese';

const DAY_MS = 86_400_000;
const SYSTEM_SLUG = 'default';

export function slugify(s: string): string {
  return deaccent(s || '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

// ======= Kiểu change có cấu trúc =======
export type TenantChange =
  | {
      type: 'CREATE_TENANT';
      tempId: string;
      name: string;
      plan?: string;
      expiresAt?: string | null;
      note?: string;
      admin: {
        fullName: string;
        email: string;
        phone?: string;
        password: string;
        mustChangePassword?: boolean;
      };
    }
  | { type: 'UPDATE_TENANT'; tenantId: string; name?: string; note?: string }
  | { type: 'UPDATE_PLAN'; tenantId: string; plan: string }
  | { type: 'EXTEND_EXPIRY'; tenantId: string; addDays: number }
  | { type: 'SET_EXPIRY'; tenantId: string; expiresAt: string | null }
  | { type: 'UPDATE_STATUS'; tenantId: string; isActive: boolean; reason?: string }
  | { type: 'ARCHIVE_TENANT'; tenantId: string; reason?: string };

export interface ApplyChangesInput {
  requestId: string;
  note?: string;
  notifyTenantAdmins?: boolean;
  baseVersions?: Record<string, string>; // tenantId -> updatedAt ISO lúc tải trang
  changes: TenantChange[];
}
export interface ChangeResult {
  ref: string; // tempId | tenantId
  type: TenantChange['type'];
  ok: boolean;
  tenantId?: string;
  error?: string;
}
export interface ApplyMeta {
  actorUserId?: string;
  ip?: string;
  userAgent?: string;
}

const refOf = (c: TenantChange) =>
  c.type === 'CREATE_TENANT' ? c.tempId : c.tenantId;

@Injectable()
export class TenantAdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** Danh sách nhà trọ (mặc định ẩn đã lưu trữ) + số liệu + email admin + version. */
  async listTenants(opts: { includeArchived?: boolean } = {}) {
    const orgs = await this.prisma.organization.findMany({
      where: opts.includeArchived ? {} : { archivedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      orgs.map(async (o) => {
        const [users, rooms, customers, admin] = await Promise.all([
          this.prisma.user.count({ where: { organizationId: o.id } }),
          this.prisma.room.count({ where: { organizationId: o.id } }),
          this.prisma.customer.count({ where: { organizationId: o.id } }),
          this.prisma.user.findFirst({
            where: { organizationId: o.id, role: UserRole.ADMIN },
            select: { email: true },
            orderBy: { createdAt: 'asc' },
          }),
        ]);
        return {
          id: o.id,
          name: o.name,
          slug: o.slug,
          plan: o.plan,
          isActive: o.isActive,
          subscriptionExpiresAt: o.subscriptionExpiresAt,
          note: o.note,
          archivedAt: o.archivedAt,
          isSystem: o.slug === SYSTEM_SLUG,
          adminEmail: admin?.email ?? null,
          version: o.updatedAt.toISOString(),
          counts: { users, rooms, customers },
        };
      }),
    );
  }

  /**
   * SAVE-ALL nguyên tử. Idempotent theo requestId, kiểm tra optimistic concurrency
   * (409 nếu tenant đã đổi), validate toàn bộ trước, rồi transaction + audit.
   */
  async applyChanges(input: ApplyChangesInput, meta: ApplyMeta) {
    if (!input?.requestId) throw new BadRequestException('Thiếu requestId');
    if (!Array.isArray(input.changes))
      throw new BadRequestException('changes phải là mảng');

    // (1) Idempotency — đã xử lý requestId này rồi thì trả kết quả cũ.
    const seen = await this.prisma.adminBatchRequest.findUnique({
      where: { requestId: input.requestId },
    });
    if (seen)
      return {
        ...(seen.result as object),
        idempotentReplay: true,
        tenants: await this.listTenants(),
      };

    const changes = input.changes;
    const orgs = await this.prisma.organization.findMany({
      select: { id: true, slug: true, updatedAt: true },
    });
    const byId = new Map(orgs.map((o) => [o.id, o]));
    const slugs = new Set(orgs.map((o) => o.slug));
    const newSlugs = new Set<string>();

    // (2) Optimistic concurrency — tenant bị đổi sau khi tải trang.
    const conflicts: { tenantId: string; slug: string }[] = [];
    if (input.baseVersions) {
      for (const c of changes) {
        if (c.type === 'CREATE_TENANT') continue;
        const cur = byId.get(c.tenantId);
        const base = input.baseVersions[c.tenantId];
        if (cur && base && cur.updatedAt.toISOString() !== base)
          conflicts.push({ tenantId: c.tenantId, slug: cur.slug });
      }
    }
    if (conflicts.length)
      throw new ConflictException({
        message: 'Dữ liệu đã được cập nhật bởi người khác. Tải lại để xem thay đổi.',
        conflicts: [...new Map(conflicts.map((c) => [c.tenantId, c])).values()],
      });

    // (3) Validate tất cả — không ghi gì nếu có lỗi.
    const errors: ChangeResult[] = [];
    const fail = (c: TenantChange, msg: string) =>
      errors.push({ ref: refOf(c), type: c.type, ok: false, error: msg });
    for (const c of changes) {
      if (c.type === 'CREATE_TENANT') {
        if (!c.name?.trim()) fail(c, 'Thiếu tên nhà trọ');
        else if (!c.admin?.fullName?.trim()) fail(c, 'Thiếu họ tên admin');
        else if (!c.admin?.email?.trim() || !/^\S+@\S+\.\S+$/.test(c.admin.email))
          fail(c, 'Email admin không hợp lệ');
        else if (!c.admin?.password || c.admin.password.length < 6)
          fail(c, 'Mật khẩu admin tối thiểu 6 ký tự');
        else if (c.plan && !PLAN_KEYS.includes(c.plan)) fail(c, 'Gói không hợp lệ');
        else if (c.expiresAt && isNaN(Date.parse(c.expiresAt)))
          fail(c, 'Hạn dùng không hợp lệ');
        else {
          const s = slugify(c.name);
          if (!s) fail(c, 'Tên không tạo được slug');
          else if (slugs.has(s) || newSlugs.has(s)) fail(c, `Trùng slug "${s}"`);
          else newSlugs.add(s);
        }
        continue;
      }
      const org = byId.get(c.tenantId);
      if (!org) {
        fail(c, 'Không tìm thấy nhà trọ');
        continue;
      }
      const isSystem = org.slug === SYSTEM_SLUG;
      if (
        isSystem &&
        (c.type === 'ARCHIVE_TENANT' ||
          (c.type === 'UPDATE_STATUS' && c.isActive === false))
      )
        fail(c, 'Nhà trọ hệ thống không thể khoá/lưu trữ');
      else if (c.type === 'UPDATE_PLAN' && !PLAN_KEYS.includes(c.plan))
        fail(c, 'Gói không hợp lệ');
      else if (c.type === 'EXTEND_EXPIRY' && !Number.isFinite(c.addDays))
        fail(c, 'Số ngày không hợp lệ');
      else if (
        c.type === 'SET_EXPIRY' &&
        c.expiresAt !== null &&
        isNaN(Date.parse(c.expiresAt))
      )
        fail(c, 'Ngày hết hạn không hợp lệ');
      else if (c.type === 'UPDATE_STATUS' && typeof c.isActive !== 'boolean')
        fail(c, 'Trạng thái không hợp lệ');
    }
    if (errors.length) return { ok: false, results: errors };

    // (4) Chuẩn bị — hash mật khẩu NGOÀI transaction.
    const hashes = new Map<string, string>();
    for (const c of changes)
      if (c.type === 'CREATE_TENANT')
        hashes.set(c.tempId, await bcrypt.hash(c.admin.password, 10));

    const batchId = randomUUID();
    const results: ChangeResult[] = [];

    // (5) Transaction — all-or-nothing.
    await this.prisma.$transaction(async (tx) => {
      const audit = (
        orgId: string,
        action: string,
        before: unknown,
        after: unknown,
        reason?: string,
      ) =>
        tx.activityLog.create({
          data: {
            userId: meta.actorUserId ?? null,
            organizationId: orgId,
            action,
            entity: `tenant:${orgId}`,
            meta: {
              batchId,
              requestId: input.requestId,
              before,
              after,
              reason,
              note: input.note,
              ip: meta.ip,
              userAgent: meta.userAgent,
            } as unknown as Prisma.InputJsonObject,
          },
        });

      for (const c of changes) {
        if (c.type === 'CREATE_TENANT') {
          const org = await tx.organization.create({
            data: {
              name: c.name.trim(),
              slug: slugify(c.name),
              plan: c.plan || 'free',
              note: c.note,
              subscriptionExpiresAt: c.expiresAt ? new Date(c.expiresAt) : null,
            },
          });
          await tx.user.create({
            data: {
              organizationId: org.id,
              email: c.admin.email.trim().toLowerCase(),
              passwordHash: hashes.get(c.tempId)!,
              fullName: c.admin.fullName.trim(),
              phone: c.admin.phone?.trim() || null,
              role: UserRole.ADMIN,
              mustChangePassword: c.admin.mustChangePassword ?? true,
            },
          });
          await audit(org.id, 'TENANT_CREATE_TENANT', null, {
            name: org.name,
            slug: org.slug,
            plan: org.plan,
            adminEmail: c.admin.email, // KHÔNG log mật khẩu
          });
          results.push({ ref: c.tempId, type: c.type, ok: true, tenantId: org.id });
          continue;
        }

        const before = await tx.organization.findUnique({ where: { id: c.tenantId } });
        let data: Prisma.OrganizationUpdateInput = {};
        if (c.type === 'UPDATE_TENANT')
          data = { ...(c.name ? { name: c.name.trim() } : {}), ...(c.note !== undefined ? { note: c.note } : {}) };
        else if (c.type === 'UPDATE_PLAN') data = { plan: c.plan };
        else if (c.type === 'EXTEND_EXPIRY') {
          const cur = before?.subscriptionExpiresAt?.getTime() ?? 0;
          const b = cur > Date.now() ? cur : Date.now();
          data = { subscriptionExpiresAt: new Date(b + c.addDays * DAY_MS) };
        } else if (c.type === 'SET_EXPIRY')
          data = { subscriptionExpiresAt: c.expiresAt ? new Date(c.expiresAt) : null };
        else if (c.type === 'UPDATE_STATUS') data = { isActive: c.isActive };
        else if (c.type === 'ARCHIVE_TENANT')
          data = { archivedAt: new Date(), isActive: false };

        const after = await tx.organization.update({ where: { id: c.tenantId }, data });
        await audit(
          c.tenantId,
          `TENANT_${c.type}`,
          {
            plan: before?.plan,
            isActive: before?.isActive,
            subscriptionExpiresAt: before?.subscriptionExpiresAt,
            archivedAt: before?.archivedAt,
            name: before?.name,
          },
          {
            plan: after.plan,
            isActive: after.isActive,
            subscriptionExpiresAt: after.subscriptionExpiresAt,
            archivedAt: after.archivedAt,
            name: after.name,
          },
          'reason' in c ? c.reason : undefined,
        );
        results.push({ ref: c.tenantId, type: c.type, ok: true, tenantId: c.tenantId });
      }

      // Batch audit + idempotency (trong cùng transaction).
      await tx.activityLog.create({
        data: {
          userId: meta.actorUserId ?? null,
          organizationId: DEFAULT_ORG_ID,
          action: 'ADMIN_APPLY_CHANGES',
          meta: {
            batchId,
            requestId: input.requestId,
            changeCount: changes.length,
            note: input.note,
            notifyTenantAdmins: !!input.notifyTenantAdmins,
          } as unknown as Prisma.InputJsonObject,
        },
      });
      await tx.adminBatchRequest.create({
        data: {
          requestId: input.requestId,
          result: { ok: true, batchId, results } as unknown as Prisma.InputJsonObject,
        },
      });
    });

    return { ok: true, batchId, results, tenants: await this.listTenants() };
  }

  /**
   * DỌN HỆ THỐNG: xoá vĩnh viễn các nhà trọ đã LƯU TRỮ và hết hạn quá lâu
   * (mặc định > 90 ngày) để nhẹ DB. KHÔNG đụng nhà trọ hệ thống. Cascade toàn bộ
   * dữ liệu con qua xoá thủ công theo thứ tự (tránh vướng FK RESTRICT).
   */
  async purgeStale(opts: { olderThanDays?: number; dryRun?: boolean } = {}, meta: ApplyMeta = {}) {
    const days = opts.olderThanDays ?? 90;
    const cutoff = new Date(Date.now() - days * DAY_MS);
    const candidates = await this.prisma.organization.findMany({
      where: {
        slug: { not: SYSTEM_SLUG },
        OR: [
          { archivedAt: { lt: cutoff } },
          { subscriptionExpiresAt: { lt: cutoff } },
        ],
      },
      select: { id: true, name: true, slug: true, archivedAt: true, subscriptionExpiresAt: true },
    });
    if (opts.dryRun) return { dryRun: true, count: candidates.length, candidates };

    let purged = 0;
    for (const org of candidates) {
      await this.prisma.$transaction(async (tx) => {
        const oid = org.id;
        // Xoá con trước (bảng phụ thuộc), rồi tới org.
        await tx.activityLog.deleteMany({ where: { organizationId: oid } });
        await tx.telegramNotification.deleteMany({ where: { organizationId: oid } });
        await tx.appointment.deleteMany({ where: { organizationId: oid } });
        await tx.careTask.deleteMany({ where: { organizationId: oid } });
        await tx.message.deleteMany({ where: { organizationId: oid } });
        await tx.conversation.deleteMany({ where: { organizationId: oid } });
        await tx.customerNote.deleteMany({ where: { organizationId: oid } });
        await tx.customer.deleteMany({ where: { organizationId: oid } });
        await tx.room.deleteMany({ where: { organizationId: oid } });
        await tx.importBatch.deleteMany({ where: { organizationId: oid } });
        await tx.replyTemplate.deleteMany({ where: { organizationId: oid } });
        await tx.appSetting.deleteMany({ where: { organizationId: oid } });
        await tx.facebookProfile.deleteMany({ where: { organizationId: oid } });
        await tx.user.deleteMany({ where: { organizationId: oid } });
        await tx.organization.delete({ where: { id: oid } });
      });
      purged++;
    }
    // Audit hành động dọn.
    await this.prisma.activityLog.create({
      data: {
        userId: meta.actorUserId ?? null,
        organizationId: DEFAULT_ORG_ID,
        action: 'ADMIN_PURGE_TENANTS',
        meta: {
          olderThanDays: days,
          purged,
          tenants: candidates.map((c) => ({ id: c.id, slug: c.slug })),
        } as unknown as Prisma.InputJsonObject,
      },
    });
    return { purged, tenants: candidates };
  }
}
