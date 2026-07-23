-- AlterEnum
ALTER TYPE "RoomStatus" ADD VALUE 'UNAVAILABLE';

-- AlterTable
ALTER TABLE "rooms" ADD COLUMN "code" TEXT,
ADD COLUMN "roomNumber" TEXT,
ADD COLUMN "stayDuration" TEXT,
ADD COLUMN "salePrice" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "rooms_code_key" ON "rooms"("code");
