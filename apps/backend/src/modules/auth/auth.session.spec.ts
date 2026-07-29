import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';

// Quy tắc phiên (gói 'default': maxSeats = 10; MAX_SESSIONS_PER_USER = 2):
//  1) Mỗi tài khoản ~ 1 máy = tối đa 2 phiên (dashboard + extension). Đăng nhập
//     vượt 2 -> đá phiên CŨ NHẤT của chính nó (không tăng tổng phiên org).
//  2) Trần Key = tổng phiên org. Phiên mới LÀM TĂNG tổng mà tổng đã >= maxSeats
//     -> CHẶN (không đá ai).
describe('AuthService — phiên/máy + trần Key theo tổng phiên', () => {
  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-access';
    process.env.JWT_REFRESH_SECRET = 'test-refresh';
  });

  function makePrisma(opts: {
    passwordHash: string;
    mine: { id: string }[]; // phiên đang mở của chính tài khoản (cũ -> mới)
    total: number; // tổng phiên đang mở của org
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
      organization: { findUnique: async () => ({ plan: 'default' }) }, // maxSeats = 10
      userSession: {
        findMany: async () => opts.mine,
        count: async () => opts.total,
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

  it('bề mặt thứ 2 cùng máy (1/2 phiên) khi org còn chỗ -> tạo thêm, không đá', async () => {
    const passwordHash = await bcrypt.hash('pw123456', 10);
    const evicted: string[][] = [];
    const counters = { created: 0 };
    const prisma = makePrisma({
      passwordHash,
      mine: [{ id: 'dash' }], // đang có 1 phiên (dashboard)
      total: 5, // org 5/10 -> còn chỗ
      evicted,
      counters,
    });
    const svc = new AuthService(prisma, new JwtService());
    const res = await svc.login('a@b.c', 'pw123456', { userAgent: 'ext' });
    expect(res.accessToken).toBeTruthy();
    expect(counters.created).toBe(1);
    expect(evicted).toEqual([]); // chưa đủ 2 phiên -> không đá
  });

  it('đủ 2 phiên rồi đăng nhập máy mới -> đá phiên cũ nhất, KHÔNG chặn dù org đầy', async () => {
    const passwordHash = await bcrypt.hash('pw123456', 10);
    const evicted: string[][] = [];
    const counters = { created: 0 };
    const prisma = makePrisma({
      passwordHash,
      mine: [{ id: 'old' }, { id: 'new' }], // đã đủ 2 (cũ -> mới)
      total: 10, // org đang ĐẦY (10/10)
      evicted,
      counters,
    });
    const svc = new AuthService(prisma, new JwtService());
    const res = await svc.login('a@b.c', 'pw123456', {});
    expect(res.accessToken).toBeTruthy();
    // Đá phiên cũ nhất của chính mình -> tổng org không tăng -> không dính trần.
    expect(evicted).toEqual([['old']]);
    expect(counters.created).toBe(1);
  });

  it('phiên mới làm tăng tổng khi org đã đầy trần -> CHẶN, không tạo/đá', async () => {
    const passwordHash = await bcrypt.hash('pw123456', 10);
    const evicted: string[][] = [];
    const counters = { created: 0 };
    const prisma = makePrisma({
      passwordHash,
      mine: [{ id: 'dash' }], // mới 1 phiên -> thêm phiên sẽ tăng tổng
      total: 10, // org đầy 10/10
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

  it('login sai mật khẩu -> 401, không tạo phiên', async () => {
    const passwordHash = await bcrypt.hash('dung', 10);
    const counters = { created: 0 };
    const prisma = makePrisma({
      passwordHash,
      mine: [],
      total: 0,
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
