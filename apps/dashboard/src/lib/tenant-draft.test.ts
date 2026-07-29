import { describe, it, expect } from 'vitest';
import {
  buildChanges,
  slugPreview,
  expiryInfo,
  isDowngrade,
  randomPassword,
  mergeTenant,
  type ServerTenant,
  type NewTenant,
} from './tenant-draft';

const T = (over: Partial<ServerTenant> = {}): ServerTenant => ({
  id: 'o1',
  name: 'An Bình',
  slug: 'an-binh',
  plan: 'default',
  isActive: true,
  subscriptionExpiresAt: null,
  note: null,
  archivedAt: null,
  isSystem: false,
  adminEmail: 'a@x.vn',
  version: '2026-01-01T00:00:00.000Z',
  counts: { users: 1, rooms: 2, customers: 3 },
  ...over,
});

describe('tenant-draft', () => {
  it('không có draft -> không có change', () => {
    expect(buildChanges([T()], {}, [])).toHaveLength(0);
  });

  it('đổi gói -> 1 change UPDATE_PLAN, cờ danger khi giảm gói', () => {
    const up = buildChanges([T({ plan: 'default' })], { o1: { plan: 'pro' } }, []);
    expect(up).toHaveLength(1);
    expect(up[0].type).toBe('UPDATE_PLAN');
    expect(up[0].danger).toBeFalsy();
    const down = buildChanges([T({ plan: 'pro' })], { o1: { plan: 'default' } }, []);
    expect(down[0].danger).toBe(true);
  });

  it('gia hạn + khoá -> 2 change, UPDATE_STATUS danger', () => {
    const list = buildChanges([T()], { o1: { addDays: 30, isActive: false } }, []);
    expect(list.map((c) => c.type).sort()).toEqual(['EXTEND_EXPIRY', 'UPDATE_STATUS']);
    expect(list.find((c) => c.type === 'UPDATE_STATUS')!.danger).toBe(true);
  });

  it('setExpiry ưu tiên hơn addDays', () => {
    const list = buildChanges([T()], { o1: { addDays: 30, setExpiry: '2027-01-01' } }, []);
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe('SET_EXPIRY');
  });

  it('archive -> ARCHIVE_TENANT danger (không đồng thời UPDATE_STATUS)', () => {
    const list = buildChanges([T()], { o1: { archive: true, isActive: false } }, []);
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe('ARCHIVE_TENANT');
    expect(list[0].danger).toBe(true);
  });

  it('tenant mới -> CREATE_TENANT, payload có admin nhưng đúng cấu trúc', () => {
    const n: NewTenant = {
      tempId: 't1', name: 'Nhà Mới', plan: 'pro', expiresAt: null, note: '',
      admin: { fullName: 'Chủ', email: 'c@x.vn', phone: '', password: 'pw123456', mustChangePassword: true },
    };
    const list = buildChanges([], {}, [n]);
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe('CREATE_TENANT');
    expect((list[0].payload as { admin: { email: string } }).admin.email).toBe('c@x.vn');
  });

  it('pending count chính xác gộp edit + tenant mới', () => {
    const n: NewTenant = {
      tempId: 't1', name: 'X', plan: 'default', expiresAt: null, note: '',
      admin: { fullName: 'A', email: 'a@x.vn', phone: '', password: 'pw123456', mustChangePassword: true },
    };
    const list = buildChanges([T()], { o1: { plan: 'pro', addDays: 30 } }, [n]);
    expect(list).toHaveLength(3); // plan + extend + create
  });

  it('slugPreview khớp backend (bỏ dấu, gạch nối)', () => {
    expect(slugPreview('Nhà Trọ Đẹp')).toBe('nha-tro-dep');
  });

  it('expiryInfo: null -> none, quá khứ -> expired, ≤7 -> soon', () => {
    expect(expiryInfo(null).status).toBe('none');
    expect(expiryInfo('2020-01-01').status).toBe('expired');
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
    expect(expiryInfo(soon).status).toBe('soon');
  });

  it('isDowngrade + randomPassword + mergeTenant', () => {
    expect(isDowngrade('pro', 'default')).toBe(true);
    expect(isDowngrade('default', 'pro')).toBe(false);
    expect(randomPassword(16)).toHaveLength(16);
    expect(mergeTenant(T({ plan: 'default' }), { plan: 'pro' }).plan).toBe('pro');
    expect(mergeTenant(T(), { archive: true }).isActive).toBe(false);
  });
});
