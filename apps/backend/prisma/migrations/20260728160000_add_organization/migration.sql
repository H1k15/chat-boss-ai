-- Multi-tenancy Đợt 1: thêm Organization + organizationId vào mọi bảng nghiệp vụ.
-- ADD COLUMN NOT NULL DEFAULT 'org_seed_default' tự backfill dòng cũ về org mặc định.
-- Org mặc định được chèn NGAY sau khi tạo bảng organizations, TRƯỚC khối FK.

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN';

-- DropIndex
DROP INDEX "rooms_code_key";

-- DropIndex
DROP INDEX "rooms_roomCode_key";

-- DropIndex
DROP INDEX "telegram_notifications_dedupeKey_key";

-- DropIndex
DROP INDEX "users_email_key";

-- AlterTable
ALTER TABLE "activity_logs" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_seed_default';

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_seed_default';

-- AlterTable
ALTER TABLE "care_tasks" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_seed_default';

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_seed_default';

-- AlterTable
ALTER TABLE "customer_notes" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_seed_default';

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_seed_default';

-- AlterTable
ALTER TABLE "facebook_profiles" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_seed_default';

-- AlterTable
ALTER TABLE "import_batches" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_seed_default';

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_seed_default';

-- AlterTable
ALTER TABLE "reply_templates" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_seed_default';

-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_seed_default';

-- AlterTable
ALTER TABLE "telegram_notifications" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_seed_default';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_seed_default';

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- Seed org mặc định (mọi dữ liệu backfill ở trên thuộc org này). Phải có TRƯỚC FK.
INSERT INTO "organizations" ("id","name","slug","plan","isActive","updatedAt")
VALUES ('org_seed_default','Nhà trọ mặc định','default','free',true, CURRENT_TIMESTAMP);

-- CreateIndex
CREATE INDEX "activity_logs_organizationId_idx" ON "activity_logs"("organizationId");

-- CreateIndex
CREATE INDEX "appointments_organizationId_idx" ON "appointments"("organizationId");

-- CreateIndex
CREATE INDEX "care_tasks_organizationId_idx" ON "care_tasks"("organizationId");

-- CreateIndex
CREATE INDEX "conversations_organizationId_idx" ON "conversations"("organizationId");

-- CreateIndex
CREATE INDEX "customer_notes_organizationId_idx" ON "customer_notes"("organizationId");

-- CreateIndex
CREATE INDEX "customers_organizationId_idx" ON "customers"("organizationId");

-- CreateIndex
CREATE INDEX "facebook_profiles_organizationId_idx" ON "facebook_profiles"("organizationId");

-- CreateIndex
CREATE INDEX "import_batches_organizationId_idx" ON "import_batches"("organizationId");

-- CreateIndex
CREATE INDEX "messages_organizationId_idx" ON "messages"("organizationId");

-- CreateIndex
CREATE INDEX "reply_templates_organizationId_idx" ON "reply_templates"("organizationId");

-- CreateIndex
CREATE INDEX "rooms_organizationId_idx" ON "rooms"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_organizationId_roomCode_key" ON "rooms"("organizationId", "roomCode");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_organizationId_code_key" ON "rooms"("organizationId", "code");

-- CreateIndex
CREATE INDEX "telegram_notifications_organizationId_idx" ON "telegram_notifications"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_notifications_organizationId_dedupeKey_key" ON "telegram_notifications"("organizationId", "dedupeKey");

-- CreateIndex
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "users_organizationId_email_key" ON "users"("organizationId", "email");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facebook_profiles" ADD CONSTRAINT "facebook_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_tasks" ADD CONSTRAINT "care_tasks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_notifications" ADD CONSTRAINT "telegram_notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reply_templates" ADD CONSTRAINT "reply_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
