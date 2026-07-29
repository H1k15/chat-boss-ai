import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LimitsService } from '../billing/limits.service';
import { UserRole } from '@cba/shared';

// Mock Prisma tối thiểu cho các nhánh logic của quản lý nhân viên.
function makePrisma(overrides: Record<string, unknown> = {}) {
  const revoked: unknown[] = [];
  const prisma = {
    _revoked: revoked,
    user: {
      findFirst: async () => null,
      findUnique: async () => null,
      findMany: async () => [],
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'new',
        ...data,
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'u2',
        ...data,
      }),
      ...(overrides.user as object),
    },
    userSession: {
      groupBy: async () => [],
      updateMany: async (args: unknown) => {
        revoked.push(args);
        return { count: 1 };
      },
    },
  } as unknown as PrismaService & { _revoked: unknown[] };
  return prisma;
}

function makeSvc(prisma: PrismaService, canAdd = true) {
  const limits = {
    assertCanAddUser: canAdd
      ? async () => undefined
      : async () => {
          throw new Error('vượt trần gói');
        },
  } as unknown as LimitsService;
  return new UsersService(prisma, limits);
}

describe('UsersService — quản lý nhân viên nội bộ', () => {
  it('create: chặn vai trò không hợp lệ (ADMIN)', async () => {
    const svc = makeSvc(makePrisma());
    await expect(
      svc.create({ email: 'a@b.c', password: '123456', fullName: 'A', role: UserRole.ADMIN }),
    ).rejects.toThrow(/Nhân viên hoặc Quản lý/);
  });

  it('create: chặn mật khẩu quá ngắn', async () => {
    const svc = makeSvc(makePrisma());
    await expect(
      svc.create({ email: 'a@b.c', password: '123', fullName: 'A' }),
    ).rejects.toThrow(/6 ký tự/);
  });

  it('create: chặn email trùng trong org', async () => {
    const svc = makeSvc(makePrisma({ user: { findFirst: async () => ({ id: 'x' }) } }));
    await expect(
      svc.create({ email: 'a@b.c', password: '123456', fullName: 'A' }),
    ).rejects.toThrow(/đã tồn tại/);
  });

  it('create: chặn khi vượt trần gói', async () => {
    const svc = makeSvc(makePrisma(), false);
    await expect(
      svc.create({ email: 'a@b.c', password: '123456', fullName: 'A' }),
    ).rejects.toThrow();
  });

  it('create: thành công -> STAFF mặc định, buộc đổi mật khẩu, hash mật khẩu', async () => {
    const svc = makeSvc(makePrisma());
    const u = (await svc.create({
      email: 'A@B.C',
      password: '123456',
      fullName: 'A',
    })) as unknown as {
      role: UserRole;
      mustChangePassword: boolean;
      passwordHash: string;
      email: string;
    };
    expect(u.role).toBe(UserRole.STAFF);
    expect(u.mustChangePassword).toBe(true);
    expect(u.passwordHash).not.toBe('123456');
    expect(u.email).toBe('a@b.c'); // chuẩn hoá thường
  });

  it('update: chặn tự thao tác trên chính mình', async () => {
    const svc = makeSvc(makePrisma());
    await expect(svc.update('me', { isActive: false }, 'me')).rejects.toThrow(
      /của mình/,
    );
  });

  it('update: chặn thao tác trên tài khoản ADMIN', async () => {
    const svc = makeSvc(
      makePrisma({ user: { findUnique: async () => ({ id: 'u2', role: UserRole.ADMIN, isActive: true }) } }),
    );
    await expect(svc.update('u2', { role: UserRole.STAFF }, 'me')).rejects.toThrow(
      /quản trị/,
    );
  });

  it('update: khoá tài khoản -> thu hồi phiên', async () => {
    const prisma = makePrisma({
      user: { findUnique: async () => ({ id: 'u2', role: UserRole.STAFF, isActive: true }) },
    });
    const svc = makeSvc(prisma);
    await svc.update('u2', { isActive: false }, 'me');
    expect((prisma as unknown as { _revoked: unknown[] })._revoked.length).toBe(1);
  });

  it('remove: vô hiệu hoá + thu hồi phiên', async () => {
    const prisma = makePrisma({
      user: { findUnique: async () => ({ id: 'u2', role: UserRole.STAFF, isActive: true }) },
    });
    const svc = makeSvc(prisma);
    const r = await svc.remove('u2', 'me');
    expect(r).toEqual({ ok: true });
    expect((prisma as unknown as { _revoked: unknown[] })._revoked.length).toBe(1);
  });
});
