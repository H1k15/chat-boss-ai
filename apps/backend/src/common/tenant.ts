import { getOrgId } from './tenant-context';

// Org mặc định (dữ liệu single-tenant cũ đã backfill về đây). Dùng khi không có
// tenant context (script/seed) hoặc làm fallback.
export const DEFAULT_ORG_ID = 'org_seed_default';

/**
 * organizationId dùng cho các truy vấn CẦN nêu org tường minh (khoá kép: upsert
 * theo (org, roomCode), dedupe theo (org, dedupeKey)...). Ưu tiên org của request
 * hiện tại; ngoài request (script) rơi về org mặc định.
 */
export function currentOrgId(): string {
  return getOrgId() ?? DEFAULT_ORG_ID;
}

/**
 * where cho AppSetting (khoá kép organizationId+key) theo org hiện tại. Dùng cho
 * findUnique/upsert cấu hình per-org: prisma.appSetting.findUnique({ where: appSettingKey('landmarks') }).
 */
export function appSettingKey(key: string) {
  return { organizationId_key: { organizationId: currentOrgId(), key } };
}
