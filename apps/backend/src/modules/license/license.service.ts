import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

const DAY_MS = 86_400_000;

// Key chỉ lưu HASH (sha256). Chuẩn hoá trước khi hash để nhập không phân biệt hoa/thường.
export function hashKey(key: string): string {
  return createHash('sha256').update(key.trim().toUpperCase()).digest('hex');
}

// Sinh key dễ đọc: CBAI-XXXXX-XXXXX-XXXXX (bỏ ký tự dễ nhầm 0/O/1/I).
export function generateKeyString(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () =>
    Array.from(randomBytes(5))
      .map((b) => alphabet[b % alphabet.length])
      .join('');
  return `CBAI-${seg()}-${seg()}-${seg()}`;
}

@Injectable()
export class LicenseService {
  constructor(private readonly prisma: PrismaService) {}

  /** Super-admin sinh N key (trả về key thô MỘT LẦN — không lưu thô). */
  async generate(input: {
    durationDays: number;
    count?: number;
    plan?: string;
    note?: string;
  }) {
    if (!input.durationDays || input.durationDays <= 0)
      throw new BadRequestException('durationDays phải > 0');
    const n = Math.min(Math.max(input.count ?? 1, 1), 100);
    const keys: string[] = [];
    for (let i = 0; i < n; i++) {
      const key = generateKeyString();
      keys.push(key);
      await this.prisma.licenseKey.create({
        data: {
          keyHash: hashKey(key),
          keyPrefix: key.slice(0, 9),
          durationDays: input.durationDays,
          plan: input.plan,
          note: input.note,
        },
      });
    }
    return { keys };
  }

  async list() {
    return this.prisma.licenseKey.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        keyPrefix: true,
        durationDays: true,
        plan: true,
        note: true,
        activatedAt: true,
        activatedByOrg: true,
        createdAt: true,
      },
    });
  }

  /** Org kích hoạt key -> cộng thời hạn (nối tiếp nếu còn hạn). Key dùng một lần. */
  async activate(orgId: string, key: string) {
    if (!key?.trim()) throw new BadRequestException('Thiếu key');
    const lk = await this.prisma.licenseKey.findUnique({
      where: { keyHash: hashKey(key) },
    });
    if (!lk) throw new NotFoundException('Key không hợp lệ');
    if (lk.activatedAt) throw new ForbiddenException('Key đã được sử dụng');

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
    });
    if (!org) throw new NotFoundException('Không tìm thấy tổ chức');

    const current = org.subscriptionExpiresAt?.getTime() ?? 0;
    const base = current > Date.now() ? current : Date.now(); // còn hạn thì nối tiếp
    const expiresAt = new Date(base + lk.durationDays * DAY_MS);

    await this.prisma.$transaction([
      this.prisma.licenseKey.update({
        where: { id: lk.id },
        data: { activatedAt: new Date(), activatedByOrg: orgId },
      }),
      this.prisma.organization.update({
        where: { id: orgId },
        data: { subscriptionExpiresAt: expiresAt, ...(lk.plan ? { plan: lk.plan } : {}) },
      }),
    ]);
    return { expiresAt, durationDays: lk.durationDays };
  }

  /** Trạng thái hạn dùng của org (cho banner/extension). */
  async status(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { plan: true, isActive: true, subscriptionExpiresAt: true },
    });
    const exp = org?.subscriptionExpiresAt ?? null;
    return {
      plan: org?.plan ?? 'free',
      isActive: org?.isActive ?? true,
      expiresAt: exp,
      daysLeft: exp ? Math.ceil((exp.getTime() - Date.now()) / DAY_MS) : null,
      expired: exp ? exp.getTime() < Date.now() : false,
    };
  }
}
