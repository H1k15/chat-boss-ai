import { applyTenantScope } from './tenant-context';

type Params = { model: string; action: string; args?: Record<string, unknown> };
const rec = (v: unknown) => v as Record<string, unknown>;

// Hàm scope thuần — chèn organizationId vào args truy vấn Prisma.
describe('applyTenantScope — cách ly tenant', () => {
  it('findMany: chèn where.organizationId, giữ điều kiện cũ', () => {
    const p: Params = { model: 'Room', action: 'findMany', args: { where: { area: 'X' } } };
    applyTenantScope(p, 'org1');
    expect(p.args!.where).toEqual({ area: 'X', organizationId: 'org1' });
  });

  it('create: ÉP data.organizationId (ghi đè org client tự khai -> chống giả mạo)', () => {
    const p: Params = {
      model: 'Room',
      action: 'create',
      args: { data: { roomCode: 'A', organizationId: 'evil' } },
    };
    applyTenantScope(p, 'org1');
    expect(rec(p.args!.data).organizationId).toBe('org1');
  });

  it('createMany: ép org cho từng phần tử', () => {
    const p: Params = {
      model: 'Room',
      action: 'createMany',
      args: { data: [{ roomCode: 'A' }, { roomCode: 'B' }] },
    };
    applyTenantScope(p, 'org1');
    expect((p.args!.data as Record<string, unknown>[]).every((x) => x.organizationId === 'org1')).toBe(
      true,
    );
  });

  it('upsert: cả where lẫn create đều gắn org', () => {
    const p: Params = {
      model: 'Room',
      action: 'upsert',
      args: { where: { id: '1' }, create: { roomCode: 'A' }, update: {} },
    };
    applyTenantScope(p, 'org1');
    expect(rec(p.args!.where).organizationId).toBe('org1');
    expect(rec(p.args!.create).organizationId).toBe('org1');
  });

  it('update/delete theo id: chèn where.organizationId (extendedWhereUnique)', () => {
    const p: Params = { model: 'Room', action: 'update', args: { where: { id: '1' }, data: {} } };
    applyTenantScope(p, 'org1');
    expect(rec(p.args!.where).organizationId).toBe('org1');
  });

  it('bỏ qua model toàn cục Organization (không gắn org)', () => {
    const p: Params = { model: 'Organization', action: 'findMany', args: { where: {} } };
    applyTenantScope(p, 'org1');
    expect(rec(p.args!.where).organizationId).toBeUndefined();
  });

  it('AppSetting (Đợt 3) nay ĐƯỢC scope theo org', () => {
    const p: Params = { model: 'AppSetting', action: 'findMany', args: { where: { key: 'landmarks' } } };
    applyTenantScope(p, 'org1');
    expect(rec(p.args!.where).organizationId).toBe('org1');
  });

  it('args rỗng: vẫn tạo where có org', () => {
    const p: Params = { model: 'Customer', action: 'findMany' };
    applyTenantScope(p, 'org1');
    expect(rec(p.args!.where).organizationId).toBe('org1');
  });
});
