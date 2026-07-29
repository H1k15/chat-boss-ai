-- Quản lý nhà trọ nâng cao: note/archivedAt (org), phone/mustChangePassword (user), idempotency.

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "admin_batch_requests" (
    "requestId" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_batch_requests_pkey" PRIMARY KEY ("requestId")
);

