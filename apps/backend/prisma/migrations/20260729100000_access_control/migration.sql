-- Đổi gói mặc định free->default + backfill; bảng user_sessions cho giới hạn thiết bị.

-- AlterTable
ALTER TABLE "organizations" ALTER COLUMN "plan" SET DEFAULT 'default';

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_refreshTokenHash_key" ON "user_sessions"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "user_sessions_organizationId_idx" ON "user_sessions"("organizationId");

-- CreateIndex
CREATE INDEX "user_sessions_userId_idx" ON "user_sessions"("userId");


-- Backfill: gói 'free' cũ -> 'default'.
UPDATE "organizations" SET "plan"='default' WHERE "plan"='free';
