import { AiConfigService } from './ai-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_LANDMARKS } from '../ai/pipeline/landmarks';

// Khoá AppSetting nay là kép (organizationId_key). Rút 'key' cho khớp fake store.
type SettingWhere = { key?: string; organizationId_key?: { key: string } };
const keyOf = (w: SettingWhere): string => w.organizationId_key?.key ?? w.key ?? '';

function fakePrisma(stored: Record<string, unknown> = {}): PrismaService {
  return {
    appSetting: {
      findUnique: async ({ where }: { where: SettingWhere }) => {
        const key = keyOf(where);
        return key in stored ? { key, value: stored[key] } : null;
      },
      upsert: async ({
        where,
        update,
      }: {
        where: SettingWhere;
        update: { value: unknown };
      }) => {
        stored[keyOf(where)] = update.value;
        return {};
      },
      delete: async ({ where }: { where: SettingWhere }) => {
        delete stored[keyOf(where)];
        return {};
      },
    },
  } as unknown as PrismaService;
}

describe('AiConfigService — quản lý điểm mốc/cụm khu', () => {
  it('chưa override -> trả mặc định trong code, custom=false', async () => {
    const svc = new AiConfigService(fakePrisma());
    const r = await svc.getLandmarks();
    expect(r.custom).toBe(false);
    expect(r.landmarks).toBe(DEFAULT_LANDMARKS);
  });

  it('lưu landmarks hợp lệ -> chuẩn hoá keyword + đọc lại custom=true', async () => {
    const store: Record<string, unknown> = {};
    const svc = new AiConfigService(fakePrisma(store));
    const res = await svc.saveLandmarks([
      { area: 'Nhổn', keywords: ['DH Cong Nghiep', ' HAUI ', ''] },
      { area: '', keywords: ['bo'] }, // entry rỗng -> loại
    ]);
    expect(res.count).toBe(1);
    const back = await svc.getLandmarks();
    expect(back.custom).toBe(true);
    expect(back.landmarks[0].keywords).toEqual(['dh cong nghiep', 'haui']);
  });

  it('landmarks sai định dạng -> ném lỗi', async () => {
    const svc = new AiConfigService(fakePrisma());
    await expect(svc.saveLandmarks([{ area: 'x' }])).rejects.toThrow();
    await expect(svc.saveLandmarks('not-array')).rejects.toThrow();
  });

  it('area-groups: cụm < 2 khu bị loại, sai định dạng ném lỗi', async () => {
    const store: Record<string, unknown> = {};
    const svc = new AiConfigService(fakePrisma(store));
    const res = await svc.saveAreaGroups([['A', 'B'], ['C']]);
    expect(res.count).toBe(1);
    await expect(svc.saveAreaGroups([[1, 2]])).rejects.toThrow();
  });

  it('reset -> xoá override, quay về mặc định', async () => {
    const store: Record<string, unknown> = { landmarks: [{ area: 'X', keywords: ['x'] }] };
    const svc = new AiConfigService(fakePrisma(store));
    expect((await svc.getLandmarks()).custom).toBe(true);
    await svc.resetLandmarks();
    expect((await svc.getLandmarks()).custom).toBe(false);
  });
});
