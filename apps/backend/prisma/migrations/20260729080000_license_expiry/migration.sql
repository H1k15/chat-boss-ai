-- License/hạn dùng: subscriptionExpiresAt (nullable) + bảng license_keys.

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "subscriptionExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "license_keys" (
    "id" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "plan" TEXT,
    "note" TEXT,
    "activatedAt" TIMESTAMP(3),
    "activatedByOrg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "license_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "license_keys_keyHash_key" ON "license_keys"("keyHash");

-- CreateIndex
CREATE INDEX "license_keys_activatedByOrg_idx" ON "license_keys"("activatedByOrg");

