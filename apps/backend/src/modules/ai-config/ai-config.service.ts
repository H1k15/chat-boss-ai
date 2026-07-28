import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { appSettingKey } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DEFAULT_LANDMARKS,
  Landmark,
} from '../ai/pipeline/landmarks';
import { DEFAULT_AREA_GROUPS } from '../ai/pipeline/area-groups';

// Quản lý cấu hình AI (điểm mốc + cụm khu lân cận) qua AppSetting — để admin
// "train" Lớp 1 KHÔNG cần sửa code. Khớp key mà RoomMatcher đọc: 'landmarks',
// 'area_groups'. Không có override -> RoomMatcher dùng mặc định trong code.
const LANDMARKS_KEY = 'landmarks';
const AREA_GROUPS_KEY = 'area_groups';

@Injectable()
export class AiConfigService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Landmarks ----------------------------------------------------------

  async getLandmarks(): Promise<{ landmarks: Landmark[]; custom: boolean }> {
    const row = await this.prisma.appSetting.findUnique({
      where: appSettingKey(LANDMARKS_KEY),
    });
    const v = row?.value as unknown;
    if (this.isLandmarkArray(v)) return { landmarks: v, custom: true };
    return { landmarks: DEFAULT_LANDMARKS, custom: false };
  }

  async saveLandmarks(landmarks: unknown): Promise<{ count: number }> {
    if (!this.isLandmarkArray(landmarks)) {
      throw new BadRequestException(
        'Dữ liệu landmarks không hợp lệ (cần mảng {area, keywords[]}).',
      );
    }
    // Chuẩn hoá: bỏ khoảng trắng thừa, loại keyword rỗng, loại entry rỗng.
    const clean = landmarks
      .map((l) => ({
        area: l.area.trim(),
        keywords: l.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean),
      }))
      .filter((l) => l.area && l.keywords.length);
    await this.upsert(LANDMARKS_KEY, clean);
    return { count: clean.length };
  }

  resetLandmarks(): Promise<unknown> {
    return this.remove(LANDMARKS_KEY);
  }

  // ---- Cụm khu lân cận (area groups) --------------------------------------

  async getAreaGroups(): Promise<{ groups: string[][]; custom: boolean }> {
    const row = await this.prisma.appSetting.findUnique({
      where: appSettingKey(AREA_GROUPS_KEY),
    });
    const v = row?.value as unknown;
    if (this.isStringMatrix(v)) return { groups: v, custom: true };
    return { groups: DEFAULT_AREA_GROUPS, custom: false };
  }

  async saveAreaGroups(groups: unknown): Promise<{ count: number }> {
    if (!this.isStringMatrix(groups)) {
      throw new BadRequestException(
        'Dữ liệu cụm khu không hợp lệ (cần mảng các mảng chuỗi).',
      );
    }
    const clean = groups
      .map((g) => g.map((x) => x.trim()).filter(Boolean))
      .filter((g) => g.length >= 2); // cụm phải >= 2 khu mới có nghĩa
    await this.upsert(AREA_GROUPS_KEY, clean);
    return { count: clean.length };
  }

  resetAreaGroups(): Promise<unknown> {
    return this.remove(AREA_GROUPS_KEY);
  }

  // ---- Helpers ------------------------------------------------------------

  private isLandmarkArray(v: unknown): v is Landmark[] {
    return (
      Array.isArray(v) &&
      v.every(
        (l) =>
          !!l &&
          typeof (l as Landmark).area === 'string' &&
          Array.isArray((l as Landmark).keywords) &&
          (l as Landmark).keywords.every((k) => typeof k === 'string'),
      )
    );
  }

  private isStringMatrix(v: unknown): v is string[][] {
    return (
      Array.isArray(v) &&
      v.every(
        (g) => Array.isArray(g) && g.every((x) => typeof x === 'string'),
      )
    );
  }

  private upsert(key: string, value: unknown): Promise<unknown> {
    const data = value as Prisma.InputJsonValue;
    return this.prisma.appSetting.upsert({
      where: appSettingKey(key),
      update: { value: data },
      create: { key, value: data },
    });
  }

  private async remove(key: string): Promise<{ ok: boolean }> {
    await this.prisma.appSetting
      .delete({ where: appSettingKey(key) })
      .catch(() => undefined); // chưa có override thì thôi
    return { ok: true };
  }
}
