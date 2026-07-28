-- Multi-tenant Đợt 3: app_settings tách theo org (khoá kép organizationId+key).
-- ADD COLUMN NOT NULL DEFAULT tự backfill 4 dòng cấu hình hiện có về org mặc định.

-- AlterTable
ALTER TABLE "app_settings" DROP CONSTRAINT "app_settings_pkey",
ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_seed_default',
ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("organizationId", "key");

-- AddForeignKey
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
