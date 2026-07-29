import { TenantAdminService, slugify } from './tenant-admin.service';
import { PrismaService } from '../../prisma/prisma.service';

interface OrgRow {
  id: string;
  slug: string;
  name: string;
  plan: string;
  isActive: boolean;
  subscriptionExpiresAt: Date | null;
  archivedAt: Date | null;
  note: string | null;
  updatedAt: Date;
  createdAt: Date;
}

// Prisma giả: lưu in-memory, $transaction gọi callback với chính nó.
function makeFake() {
  const orgs: OrgRow[] = [
    { id: 'sys', slug: 'default', name: 'Hệ thống', plan: 'unlimited', isActive: true, subscriptionExpiresAt: null, archivedAt: null, note: null, updatedAt: new Date('2026-01-01T00:00:00Z'), createdAt: new Date('2026-01-01') },
    { id: 'o1', slug: 'an-binh', name: 'An Binh', plan: 'free', isActive: true, subscriptionExpiresAt: null, archivedAt: null, note: null, updatedAt: new Date('2026-01-02T00:00:00Z'), createdAt: new Date('2026-01-02') },
  ];
  const users: Record<string, unknown>[] = [];
  const logs: Record<string, unknown>[] = [];
  const batch: { requestId: string; result: unknown }[] = [];
  let seq = 0;

  const db: Record<string, unknown> = {
    organization: {
      findMany: async ({ where }: { where?: { archivedAt?: null } } = {}) =>
        orgs.filter((o) => (where && 'archivedAt' in where ? o.archivedAt === null : true)).map((o) => ({ ...o })),
      findUnique: async ({ where: { id } }: { where: { id: string } }) => {
        const o = orgs.find((x) => x.id === id);
        return o ? { ...o } : null;
      },
      create: async ({ data }: { data: Partial<OrgRow> }) => {
        const o: OrgRow = {
          id: 'new-' + seq++, slug: data.slug!, name: data.name!, plan: data.plan ?? 'free',
          isActive: true, subscriptionExpiresAt: data.subscriptionExpiresAt ?? null, archivedAt: null,
          note: data.note ?? null, updatedAt: new Date(), createdAt: new Date(),
        };
        orgs.push(o);
        return { ...o };
      },
      update: async ({ where: { id }, data }: { where: { id: string }; data: Partial<OrgRow> }) => {
        const o = orgs.find((x) => x.id === id)!;
        Object.assign(o, data);
        o.updatedAt = new Date();
        return { ...o };
      },
    },
    user: {
      create: async ({ data }: { data: Record<string, unknown> }) => { users.push(data); return { id: 'u' + seq++, ...data }; },
      findFirst: async () => null,
      count: async () => 0,
    },
    room: { count: async () => 0 },
    customer: { count: async () => 0 },
    activityLog: { create: async ({ data }: { data: Record<string, unknown> }) => { logs.push(data); return {}; } },
    adminBatchRequest: {
      findUnique: async ({ where: { requestId } }: { where: { requestId: string } }) =>
        batch.find((b) => b.requestId === requestId) ?? null,
      create: async ({ data }: { data: { requestId: string; result: unknown } }) => { batch.push(data); return {}; },
    },
  };
  db.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(db);
  return { db: db as unknown as PrismaService, orgs, users, logs, batch };
}

const REQ = (n: number) => 'req-' + n;

describe('TenantAdminService.applyChanges', () => {
  it('slugify: bỏ dấu, thường hoá, gạch nối', () => {
    expect(slugify('Nhà Trọ An Bình')).toBe('nha-tro-an-binh');
  });

  it('CREATE_TENANT: tạo org + admin nguyên tử, audit KHÔNG chứa mật khẩu', async () => {
    const f = makeFake();
    const svc = new TenantAdminService(f.db);
    const r = await svc.applyChanges(
      { requestId: REQ(1), changes: [{ type: 'CREATE_TENANT', tempId: 't1', name: 'Nhà Mới', admin: { fullName: 'Ad', email: 'ad@x.vn', password: 'secret123' } }] },
      {},
    );
    expect(r.ok).toBe(true);
    expect(f.orgs.some((o) => o.slug === 'nha-moi')).toBe(true);
    expect(f.users.length).toBe(1);
    expect(f.users[0].mustChangePassword).toBe(true); // mặc định buộc đổi
    const audit = f.logs.find((l) => l.action === 'TENANT_CREATE_TENANT');
    expect(JSON.stringify(audit)).not.toContain('secret123'); // không log mật khẩu
    expect(f.batch.length).toBe(1); // lưu idempotency
  });

  it('idempotency: cùng requestId chạy lần 2 -> trả replay, không tạo thêm', async () => {
    const f = makeFake();
    const svc = new TenantAdminService(f.db);
    const input = { requestId: REQ(2), changes: [{ type: 'CREATE_TENANT' as const, tempId: 't1', name: 'X Y', admin: { fullName: 'A', email: 'a@x.vn', password: 'pw12345' } }] };
    await svc.applyChanges(input, {});
    const before = f.orgs.length;
    const r2 = await svc.applyChanges(input, {});
    expect((r2 as { idempotentReplay?: boolean }).idempotentReplay).toBe(true);
    expect(f.orgs.length).toBe(before); // không tạo lần 2
  });

  it('optimistic concurrency: baseVersion cũ -> ném 409 với danh sách xung đột', async () => {
    const f = makeFake();
    const svc = new TenantAdminService(f.db);
    await expect(
      svc.applyChanges(
        {
          requestId: REQ(3),
          baseVersions: { o1: '2020-01-01T00:00:00.000Z' }, // cũ so với updatedAt thật
          changes: [{ type: 'UPDATE_PLAN', tenantId: 'o1', plan: 'pro' }],
        },
        {},
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('system tenant: không thể khoá/lưu trữ (validate)', async () => {
    const f = makeFake();
    const svc = new TenantAdminService(f.db);
    const r = await svc.applyChanges(
      { requestId: REQ(4), changes: [{ type: 'UPDATE_STATUS', tenantId: 'sys', isActive: false }] },
      {},
    );
    expect(r.ok).toBe(false);
    expect(r.results?.[0].error).toMatch(/hệ thống/i);
    expect(f.logs.length).toBe(0); // không ghi gì
  });

  it('validate: gói lạ / email sai / slug trùng -> ok:false, không áp', async () => {
    const f = makeFake();
    const svc = new TenantAdminService(f.db);
    const r = await svc.applyChanges(
      {
        requestId: REQ(5),
        changes: [
          { type: 'UPDATE_PLAN', tenantId: 'o1', plan: 'xxx' },
          { type: 'CREATE_TENANT', tempId: 't1', name: 'An Binh', admin: { fullName: 'A', email: 'bad-email', password: 'pw12345' } },
        ],
      },
      {},
    );
    expect(r.ok).toBe(false);
    expect(r.results!.length).toBe(2);
    expect(f.orgs.length).toBe(2); // không tạo gì
  });

  it('UPDATE_PLAN + EXTEND_EXPIRY: áp + audit before/after', async () => {
    const f = makeFake();
    const svc = new TenantAdminService(f.db);
    const r = await svc.applyChanges(
      { requestId: REQ(6), note: 'nâng cấp', changes: [
        { type: 'UPDATE_PLAN', tenantId: 'o1', plan: 'pro' },
        { type: 'EXTEND_EXPIRY', tenantId: 'o1', addDays: 30 },
      ] },
      { actorUserId: 'super' },
    );
    expect(r.ok).toBe(true);
    const o1 = f.orgs.find((o) => o.id === 'o1')!;
    expect(o1.plan).toBe('pro');
    expect(o1.subscriptionExpiresAt).toBeInstanceOf(Date);
    expect(f.logs.some((l) => l.action === 'TENANT_UPDATE_PLAN')).toBe(true);
    expect(f.logs.some((l) => l.action === 'ADMIN_APPLY_CHANGES')).toBe(true);
  });

  it('ARCHIVE_TENANT: đặt archivedAt + khoá', async () => {
    const f = makeFake();
    const svc = new TenantAdminService(f.db);
    await svc.applyChanges(
      { requestId: REQ(7), changes: [{ type: 'ARCHIVE_TENANT', tenantId: 'o1', reason: 'không dùng' }] },
      {},
    );
    const o1 = f.orgs.find((o) => o.id === 'o1')!;
    expect(o1.archivedAt).toBeInstanceOf(Date);
    expect(o1.isActive).toBe(false);
  });
});
