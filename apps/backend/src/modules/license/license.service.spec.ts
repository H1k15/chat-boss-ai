import {
  hashKey,
  generateKeyString,
  LicenseService,
} from './license.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('license — key hạn dùng', () => {
  it('hashKey: ổn định, không phân biệt hoa/thường/space', () => {
    expect(hashKey('cbai-abc')).toBe(hashKey('  CBAI-ABC '));
    expect(hashKey('a')).not.toBe(hashKey('b'));
    expect(hashKey('x')).toHaveLength(64); // sha256 hex
  });

  it('generateKeyString: đúng định dạng CBAI-XXXXX-XXXXX-XXXXX, không ký tự dễ nhầm', () => {
    const k = generateKeyString();
    expect(k).toMatch(/^CBAI-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    // Phần ngẫu nhiên (sau "CBAI-") không dùng ký tự dễ nhầm 0/1/O/I.
    expect(k.slice(5)).not.toMatch(/[01OI]/);
  });

  it('activate: cộng hạn nối tiếp, key dùng một lần', async () => {
    const store = {
      lk: {
        id: 'k1',
        keyHash: hashKey('CBAI-TEST'),
        durationDays: 30,
        plan: null as string | null,
        activatedAt: null as Date | null,
      },
      org: { id: 'o1', subscriptionExpiresAt: null as Date | null, plan: 'default' },
    };
    const prisma = {
      licenseKey: {
        findUnique: async ({ where: { keyHash } }: { where: { keyHash: string } }) =>
          keyHash === store.lk.keyHash && !store.lk.activatedAt ? store.lk : store.lk.activatedAt ? store.lk : null,
        update: async () => {
          store.lk.activatedAt = new Date();
          return store.lk;
        },
      },
      organization: {
        findUnique: async () => store.org,
        update: async ({ data }: { data: { subscriptionExpiresAt: Date } }) => {
          store.org.subscriptionExpiresAt = data.subscriptionExpiresAt;
          return store.org;
        },
      },
      $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    } as unknown as PrismaService;

    const svc = new LicenseService(prisma);
    const r = await svc.activate('o1', 'CBAI-TEST');
    // hạn mới ~ now + 30 ngày
    const days = Math.round((r.expiresAt.getTime() - Date.now()) / 86_400_000);
    expect(days).toBe(30);
    // dùng lại -> báo đã sử dụng
    await expect(svc.activate('o1', 'CBAI-TEST')).rejects.toThrow();
  });
});
