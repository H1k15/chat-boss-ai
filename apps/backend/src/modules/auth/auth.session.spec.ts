import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';

// Quy tắc phiên mới:
//  1) Mỗi tài khoản chỉ 1 thiết bị: đăng nhập máy mới -> đá phiên cũ CỦA CHÍNH nó.
//  2) Trần Key = số tài khoản online cùng lúc (default = 3). Tài khoản đang offline
//     đăng nhập khi org đã đầy -> CHẶN (không đá ai). Tài khoản đang online đăng
//     nhập lại (chuyển máy) thì luôn được, không tính vào trần.
describe('AuthService — 1 thiết bị/tài khoản + trần Key', () => {
  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-access';
    process.env.JWT_REFRESH_SECRET = 'test-refresh';
  });

  // Dựng prisma giả: findMany trả phiên của chính user (khi where.userId) hoặc
  // danh sách tài khoản đang online (khi truy vấn distinct).
  function makePrisma(opts: {
    passwordHash: string;
    mine: { id: string }[];
    online: { userId: string }[];
    evicted: string[][];
    counters: { created: number };
  }) {
    return {
      user: {
        findFirst: async () => ({
          id: 'u1',
          email: 'a@b.c',
          fullName: 'A',
          role: 'STAFF',
          isActive: true,
          organizationId: 'o1',
          passwordHash: opts.passwordHash,
          mustChangePassword: false,
        }),
      },
      organization: { findUnique: async () => ({ plan: 'default' }) }, // maxSeats = 3
      userSession: {
        findMany: async ({ where }: { where: { userId?: string } }) =>
          where.userId ? opts.mine : opts.online,
        updateMany: async ({ where }: { where: { id: { in: string[] } } }) => {
          opts.evicted.push(where.id.in);
          return { count: where.id.in.length };
        },
        create: async () => {
          opts.counters.created++;
          return {};
        },
      },
    } as unknown as PrismaService;
  }

  it('chuyển máy (tài khoản đã có phiên) -> đá phiên cũ của chính nó, tạo phiên mới', async () => {
    const passwordHash = await bcrypt.hash('pw123456', 10);
    const evicted: string[][] = [];
    const counters = { created: 0 };
    const prisma = makePrisma({
      passwordHash,
      mine: [{ id: 'old' }],
      online: [{ userId: 'x' }, { userId: 'y' }, { userId: 'u1' }], // org đang đầy (3)
      evicted,
      counters,
    });
    const svc = new AuthService(prisma, new JwtService());
    const res = await svc.login('a@b.c', 'pw123456', { userAgent: 'jest' });

    expect(res.accessToken).toBeTruthy();
    // Dù org đang đầy, tài khoản đang online vẫn được đổi máy (không bị chặn).
    expect(evicted).toEqual([['old']]);
    expect(counters.created).toBe(1);
  });

  it('tài khoản offline đăng nhập khi org đã đầy trần -> CHẶN, không tạo/đá phiên', async () => {
    const passwordHash = await bcrypt.hash('pw123456', 10);
    const evicted: string[][] = [];
    const counters = { created: 0 };
    const prisma = makePrisma({
      passwordHash,
      mine: [], // tài khoản này đang offline
      online: [{ userId: 'x' }, { userId: 'y' }, { userId: 'z' }], // 3 tài khoản khác = đầy
      evicted,
      counters,
    });
    const svc = new AuthService(prisma, new JwtService());
    await expect(svc.login('a@b.c', 'pw123456', {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(counters.created).toBe(0);
    expect(evicted).toEqual([]); // không đá ai
  });

  it('tài khoản offline đăng nhập khi còn chỗ -> tạo phiên mới', async () => {
    const passwordHash = await bcrypt.hash('pw123456', 10);
    const evicted: string[][] = [];
    const counters = { created: 0 };
    const prisma = makePrisma({
      passwordHash,
      mine: [],
      online: [{ userId: 'x' }, { userId: 'y' }], // mới 2/3 -> còn chỗ
      evicted,
      counters,
    });
    const svc = new AuthService(prisma, new JwtService());
    const res = await svc.login('a@b.c', 'pw123456', {});
    expect(res.accessToken).toBeTruthy();
    expect(counters.created).toBe(1);
    expect(evicted).toEqual([]); // không có phiên cũ của mình để đá
  });

  it('login sai mật khẩu -> 401, không tạo phiên', async () => {
    const passwordHash = await bcrypt.hash('dung', 10);
    const counters = { created: 0 };
    const prisma = makePrisma({
      passwordHash,
      mine: [],
      online: [],
      evicted: [],
      counters,
    });
    const svc = new AuthService(prisma, new JwtService());
    await expect(svc.login('a@b.c', 'sai', {})).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(counters.created).toBe(0);
  });
});
