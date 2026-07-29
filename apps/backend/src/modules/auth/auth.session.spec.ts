import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';

// Quy tắc phiên (gói 'default': maxSeats = 10; MAX_SESSIONS_PER_USER = 2):
//  0) Có deviceId: đăng nhập MÁY MỚI -> đá NGAY mọi phiên máy khác (deviceId khác
//     hoặc null). dashboard + extension cùng máy (cùng deviceId) sống chung.
//  1) Mỗi máy tối đa 2 phiên -> vượt thì đá phiên cũ nhất trên máy đó.
//  2) Trần Key = tổng phiên org. Phiên mới làm TĂNG tổng mà tổng >= maxSeats -> CHẶN.
describe('AuthService — phiên theo MÁY (deviceId) + trần Key', () => {
  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-access';
    process.env.JWT_REFRESH_SECRET = 'test-refresh';
  });

  function makePrisma(opts: {
    passwordHash: string;
    mine: { id: string }[]; // phiên trên MÁY hiện tại (cũ -> mới)
    total: number; // tổng phiên đang mở của org
    evicted: string[][]; // các lần đá theo id (quy tắc 1)
    kicked: number; // số lần đá-nguyên-máy-khác (quy tắc 0)
    counters: { created: number };
  }) {
    const counters = opts.counters;
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
        updateMany: async ({
          where,
        }: {
          where: { id?: { in: string[] } };
        }) => {
          if (where.id?.in) {
            opts.evicted.push(where.id.in);
            return { count: where.id.in.length };
          }
          opts.kicked++; // đá-nguyên-máy-khác (where theo deviceId, không có id.in)
          return { count: 1 };
        },
        create: async () => {
          counters.created++;
          return {};
        },
      },
    } as unknown as PrismaService;
  }

  it('đăng nhập MÁY MỚI (deviceId khác) -> đá nguyên máy cũ ngay, tạo phiên máy mới', async () => {
    const passwordHash = await bcrypt.hash('pw123456', 10);
    const opts = {
      passwordHash,
      mine: [], // máy mới chưa có phiên nào của tài khoản
      total: 2,
      evicted: [] as string[][],
      kicked: 0,
      counters: { created: 0 },
    };
    const svc = new AuthService(makePrisma(opts), new JwtService());
    const res = await svc.login('a@b.c', 'pw123456', { deviceId: 'MAY-B' });
    expect(res.accessToken).toBeTruthy();
    expect(opts.kicked).toBe(1); // đã đá máy cũ
    expect(opts.counters.created).toBe(1);
    expect(opts.evicted).toEqual([]); // không cần đá theo cap
  });

  it('bề mặt thứ 2 CÙNG máy (cùng deviceId) -> sống chung, không đá theo cap', async () => {
    const passwordHash = await bcrypt.hash('pw123456', 10);
    const opts = {
      passwordHash,
      mine: [{ id: 'dash' }], // đã có dashboard trên máy này (1/2)
      total: 5,
      evicted: [] as string[][],
      kicked: 0,
      counters: { created: 0 },
    };
    const svc = new AuthService(makePrisma(opts), new JwtService());
    const res = await svc.login('a@b.c', 'pw123456', { deviceId: 'MAY-A' });
    expect(res.accessToken).toBeTruthy();
    expect(opts.counters.created).toBe(1);
    expect(opts.evicted).toEqual([]); // 1 < 2 -> chưa đá theo cap
  });

  it('đủ 2 phiên trên máy -> đá phiên cũ nhất của máy đó (không chặn dù org đầy)', async () => {
    const passwordHash = await bcrypt.hash('pw123456', 10);
    const opts = {
      passwordHash,
      mine: [{ id: 'old' }, { id: 'new' }], // máy đã đủ 2 (cũ -> mới)
      total: 10, // org đầy
      evicted: [] as string[][],
      kicked: 0,
      counters: { created: 0 },
    };
    const svc = new AuthService(makePrisma(opts), new JwtService());
    const res = await svc.login('a@b.c', 'pw123456', { deviceId: 'MAY-A' });
    expect(res.accessToken).toBeTruthy();
    expect(opts.evicted).toEqual([['old']]);
    expect(opts.counters.created).toBe(1);
  });

  it('phiên mới làm tăng tổng khi org đầy trần -> CHẶN (không tạo/đá theo cap)', async () => {
    const passwordHash = await bcrypt.hash('pw123456', 10);
    const opts = {
      passwordHash,
      mine: [], // máy chưa có phiên -> thêm sẽ tăng tổng
      total: 10, // org đầy 10/10
      evicted: [] as string[][],
      kicked: 0,
      counters: { created: 0 },
    };
    const svc = new AuthService(makePrisma(opts), new JwtService());
    await expect(
      svc.login('a@b.c', 'pw123456', { deviceId: 'MAY-C' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(opts.counters.created).toBe(0);
    expect(opts.evicted).toEqual([]);
  });

  it('login sai mật khẩu -> 401, không tạo phiên', async () => {
    const passwordHash = await bcrypt.hash('dung', 10);
    const opts = {
      passwordHash,
      mine: [],
      total: 0,
      evicted: [] as string[][],
      kicked: 0,
      counters: { created: 0 },
    };
    const svc = new AuthService(makePrisma(opts), new JwtService());
    await expect(svc.login('a@b.c', 'sai', {})).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(opts.counters.created).toBe(0);
  });
});
