import { AsyncLocalStorage } from 'async_hooks';

// Ngữ cảnh tenant theo REQUEST: giữ organizationId của người đang đăng nhập,
// truyền xuyên suốt chuỗi async (interceptor -> handler -> Prisma) nhờ
// AsyncLocalStorage. Prisma middleware đọc org ở đây để tự lọc dữ liệu.

export interface TenantStore {
  organizationId: string;
}

const storage = new AsyncLocalStorage<TenantStore>();

export function runWithTenant<T>(store: TenantStore, fn: () => T): T {
  return storage.run(store, fn);
}

/** organizationId của request hiện tại; undefined ngoài request (script/cron). */
export function getOrgId(): string | undefined {
  return storage.getStore()?.organizationId;
}

// Model KHÔNG gắn org -> middleware bỏ qua. Chỉ còn Organization (bảng gốc quản
// lý org). AppSetting nay đã per-org (Đợt 3) nên KHÔNG loại trừ nữa: middleware
// tự set organizationId khi tạo, và bổ sung lọc org khi đọc.
export const TENANT_MODELS_SKIP = new Set([
  'Organization',
  'LicenseKey',
  'AdminBatchRequest',
]);

// Action Prisma dùng where UNIQUE — chèn thêm organizationId là hợp lệ nhờ tính
// năng extendedWhereUnique (GA từ Prisma 5): where có 1 khoá unique + lọc phụ.
const WHERE_ACTIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
]);

/**
 * Chèn organizationId vào args của một truy vấn Prisma để CÁCH LY theo org.
 * Hàm THUẦN (mutate args tại chỗ) -> unit test được, không cần DB.
 *
 * - đọc/xoá/sửa: thêm where.organizationId = org.
 * - create/createMany/upsert.create: ÉP data.organizationId = org (ghi đè, chống
 *   client tự khai org khác -> chống giả mạo).
 */
export function applyTenantScope(
  params: { model?: string; action: string; args?: Record<string, unknown> },
  orgId: string,
): void {
  if (!params.model || TENANT_MODELS_SKIP.has(params.model)) return;
  const args = (params.args = params.args ?? {});
  const action = params.action;

  if (action === 'create') {
    args.data = { ...(args.data as object), organizationId: orgId };
    return;
  }
  if (action === 'createMany') {
    const d = args.data;
    args.data = Array.isArray(d)
      ? d.map((x) => ({ ...(x as object), organizationId: orgId }))
      : { ...(d as object), organizationId: orgId };
    return;
  }
  if (action === 'upsert') {
    args.where = { ...(args.where as object), organizationId: orgId };
    args.create = { ...(args.create as object), organizationId: orgId };
    return;
  }
  if (WHERE_ACTIONS.has(action)) {
    args.where = { ...(args.where as object), organizationId: orgId };
  }
}
