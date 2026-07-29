// Logic thuần cho trang "Quản lý nhà trọ": tách state draft khỏi UI để test được.

export interface ServerTenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  isActive: boolean;
  subscriptionExpiresAt: string | null;
  note: string | null;
  archivedAt: string | null;
  isSystem: boolean;
  adminEmail: string | null;
  version: string; // updatedAt ISO — cho optimistic concurrency
  counts: { users: number; rooms: number; customers: number };
}

// Chỉnh sửa nháp cho một tenant đã có (chỉ giữ field khác gốc).
export interface DraftEdit {
  name?: string;
  note?: string;
  plan?: string;
  addDays?: number;
  setExpiry?: string | null; // dùng khi đặt ngày cụ thể (ưu tiên hơn addDays)
  isActive?: boolean;
  archive?: boolean;
  reason?: string;
}

export interface NewTenant {
  tempId: string;
  name: string;
  plan: string;
  expiresAt: string | null;
  note: string;
  admin: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    mustChangePassword: boolean;
  };
}

export type ChangeType =
  | 'CREATE_TENANT'
  | 'UPDATE_TENANT'
  | 'UPDATE_PLAN'
  | 'EXTEND_EXPIRY'
  | 'SET_EXPIRY'
  | 'UPDATE_STATUS'
  | 'ARCHIVE_TENANT';

export interface Change {
  ref: string; // tenantId | tempId
  tenantName: string;
  type: ChangeType;
  label: string;
  oldValue?: string;
  newValue?: string;
  danger?: boolean;
  payload: Record<string, unknown>;
}

export const PLANS = ['free', 'pro', 'unlimited'] as const;
export const PLAN_LABEL: Record<string, string> = {
  free: 'Miễn phí',
  pro: 'Chuyên nghiệp',
  unlimited: 'Không giới hạn',
};
const PLAN_RANK: Record<string, number> = { free: 0, pro: 1, unlimited: 2 };
export const isDowngrade = (from: string, to: string) =>
  (PLAN_RANK[to] ?? 0) < (PLAN_RANK[from] ?? 0);

// Slug preview khớp backend (bỏ dấu + gạch nối).
export function slugPreview(name: string): string {
  return (name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

const DAY = 86_400_000;
export function expiryInfo(
  iso: string | null,
  addDays = 0,
  setExpiry?: string | null,
): { text: string; daysLeft: number | null; status: 'ok' | 'soon' | 'expired' | 'none' } {
  let ms: number | null;
  if (setExpiry !== undefined) ms = setExpiry ? new Date(setExpiry).getTime() : null;
  else ms = iso ? new Date(iso).getTime() + addDays * DAY : addDays ? Date.now() + addDays * DAY : null;
  if (ms === null) return { text: 'Không giới hạn', daysLeft: null, status: 'none' };
  const d = Math.ceil((ms - Date.now()) / DAY);
  const date = new Date(ms).toLocaleDateString('vi-VN');
  if (d < 0) return { text: `Hết hạn · ${date}`, daysLeft: d, status: 'expired' };
  return { text: `${date}`, daysLeft: d, status: d <= 7 ? 'soon' : 'ok' };
}

// Giá trị hiển thị hiện tại (gốc + draft) cho một tenant.
export function mergeTenant(o: ServerTenant, e?: DraftEdit) {
  return {
    ...o,
    name: e?.name ?? o.name,
    note: e?.note ?? o.note,
    plan: e?.plan ?? o.plan,
    isActive: e?.archive ? false : e?.isActive ?? o.isActive,
    archived: e?.archive || !!o.archivedAt,
    pendingAddDays: e?.addDays ?? 0,
    pendingSetExpiry: e?.setExpiry,
    dirty: !!e && Object.keys(e).length > 0,
  };
}

// Xây danh sách change có cấu trúc từ draft. Đây là "pendingChanges".
export function buildChanges(
  server: ServerTenant[],
  editsById: Record<string, DraftEdit>,
  newTenants: NewTenant[],
): Change[] {
  const list: Change[] = [];
  for (const o of server) {
    const e = editsById[o.id];
    if (!e) continue;
    if (e.name !== undefined || e.note !== undefined) {
      list.push({
        ref: o.id,
        tenantName: o.name,
        type: 'UPDATE_TENANT',
        label: 'Sửa thông tin',
        oldValue: `${o.name}`,
        newValue: `${e.name ?? o.name}`,
        payload: { type: 'UPDATE_TENANT', tenantId: o.id, name: e.name, note: e.note },
      });
    }
    if (e.plan !== undefined) {
      list.push({
        ref: o.id,
        tenantName: o.name,
        type: 'UPDATE_PLAN',
        label: 'Đổi gói',
        oldValue: PLAN_LABEL[o.plan] ?? o.plan,
        newValue: PLAN_LABEL[e.plan] ?? e.plan,
        danger: isDowngrade(o.plan, e.plan),
        payload: { type: 'UPDATE_PLAN', tenantId: o.id, plan: e.plan },
      });
    }
    if (e.setExpiry !== undefined) {
      list.push({
        ref: o.id,
        tenantName: o.name,
        type: 'SET_EXPIRY',
        label: 'Đặt hạn dùng',
        newValue: e.setExpiry ? new Date(e.setExpiry).toLocaleDateString('vi-VN') : 'Không giới hạn',
        payload: { type: 'SET_EXPIRY', tenantId: o.id, expiresAt: e.setExpiry },
      });
    } else if (e.addDays) {
      list.push({
        ref: o.id,
        tenantName: o.name,
        type: 'EXTEND_EXPIRY',
        label: 'Gia hạn',
        newValue: `+${e.addDays} ngày`,
        payload: { type: 'EXTEND_EXPIRY', tenantId: o.id, addDays: e.addDays },
      });
    }
    if (e.archive) {
      list.push({
        ref: o.id,
        tenantName: o.name,
        type: 'ARCHIVE_TENANT',
        label: 'Lưu trữ nhà trọ',
        danger: true,
        payload: { type: 'ARCHIVE_TENANT', tenantId: o.id, reason: e.reason },
      });
    } else if (e.isActive !== undefined) {
      list.push({
        ref: o.id,
        tenantName: o.name,
        type: 'UPDATE_STATUS',
        label: e.isActive ? 'Mở khoá' : 'Tạm khoá',
        oldValue: o.isActive ? 'Hoạt động' : 'Đã khoá',
        newValue: e.isActive ? 'Hoạt động' : 'Đã khoá',
        danger: !e.isActive,
        payload: { type: 'UPDATE_STATUS', tenantId: o.id, isActive: e.isActive, reason: e.reason },
      });
    }
  }
  for (const n of newTenants) {
    list.push({
      ref: n.tempId,
      tenantName: n.name,
      type: 'CREATE_TENANT',
      label: 'Tạo nhà trọ mới',
      newValue: `${n.name} · admin ${n.admin.email} · ${PLAN_LABEL[n.plan] ?? n.plan}`,
      payload: {
        type: 'CREATE_TENANT',
        tempId: n.tempId,
        name: n.name,
        plan: n.plan,
        expiresAt: n.expiresAt,
        note: n.note || undefined,
        admin: {
          fullName: n.admin.fullName,
          email: n.admin.email,
          phone: n.admin.phone || undefined,
          password: n.admin.password,
          mustChangePassword: n.admin.mustChangePassword,
        },
      },
    });
  }
  return list;
}

// Mật khẩu ngẫu nhiên an toàn, dễ đọc.
export function randomPassword(len = 14): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#$%';
  const arr =
    typeof crypto !== 'undefined' && crypto.getRandomValues
      ? crypto.getRandomValues(new Uint32Array(len))
      : Array.from({ length: len }, () => Math.floor(Math.random() * 1e9));
  return Array.from(arr, (x) => chars[x % chars.length]).join('');
}
