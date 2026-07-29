import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';

// Kiểm tra ÉP giới hạn thiết bị theo gói: đăng nhập vượt maxSeats -> thu hồi phiên
// cũ nhất để nhường chỗ. Gói 'default' có maxSeats = 3.
describe('AuthService — giới hạn thiết bị (maxSeats)', () => {
  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-access';
    process.env.JWT_REFRESH_SECRET = 'test-refresh';
  });

  it('login khi đã đủ 3 phiên -> thu hồi phiên cũ nhất + tạo phiên mới', async () => {
    const passwordHash = await bcrypt.hash('pw123456', 10);
    const evicted: string[][] = [];
    let created = 0;
    const activeSessions = [
      { id: 's1' }, // cũ nhất (findMany orderBy lastSeenAt asc)
      { id: 's2' },
      { id: 's3' },
    ];
    const prisma = {
      user: {
        findFirst: async () => ({
          id: 'u1',
          email: 'a@b.c',
          fullName: 'A',
          role: 'STAFF',
          isActive: true,
          organizationId: 'o1',
          passwordHash,
          mustChangePassword: false,
        }),
      },
      organization: { findUnique: async () => ({ plan: 'default' }) },
      userSession: {
        findMany: async () => activeSessions,
        updateMany: async ({ where }: { where: { id: { in: string[] } } }) => {
          evicted.push(where.id.in);
          return { count: where.id.in.length };
        },
        create: async () => {
          created++;
          return {};
        },
      },
    } as unknown as PrismaService;

    const svc = new AuthService(prisma, new JwtService());
    const res = await svc.login('a@b.c', 'pw123456', { userAgent: 'jest', ip: '1.2.3.4' });

    expect(res.accessToken).toBeTruthy();
    expect(res.refreshToken).toBeTruthy();
    // 3 phiên + 1 mới = 4 > 3 -> đá 1 phiên cũ nhất (s1).
    expect(evicted).toEqual([['s1']]);
    expect(created).toBe(1);
  });

  it('login sai mật khẩu -> 401, không tạo phiên', async () => {
    const passwordHash = await bcrypt.hash('dung', 10);
    let created = 0;
    const prisma = {
      user: {
        findFirst: async () => ({
          id: 'u1',
          organizationId: 'o1',
          isActive: true,
          passwordHash,
        }),
      },
      organization: { findUnique: async () => ({ plan: 'default' }) },
      userSession: {
        findMany: async () => [],
        create: async () => {
          created++;
          return {};
        },
      },
    } as unknown as PrismaService;
    const svc = new AuthService(prisma, new JwtService());
    await expect(svc.login('a@b.c', 'sai', {})).rejects.toThrow();
    expect(created).toBe(0);
  });
});
