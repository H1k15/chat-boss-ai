import { AiConfigService } from './ai-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_LANDMARKS } from '../ai/pipeline/landmarks';

function fakePrisma(stored: Record<string, unknown> = {}): PrismaService {
  return {
    appSetting: {
      findUnique: async ({ where: { key } }: { where: { key: string } }) =>
        key in stored ? { key, value: stored[key] } : null,
      upsert: async ({
        where: { key },
        update,
      }: {
        where: { key: string };
        update: { value: unknown };
      }) => {
        stored[key] = update.value;
        return {};
      },
      delete: async ({ where: { key } }: { where: { key: string } }) => {
        delete stored[key];
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
