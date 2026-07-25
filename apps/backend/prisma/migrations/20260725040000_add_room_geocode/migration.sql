-- AlterTable: thêm toạ độ geocode cho phòng (lọc theo bán kính bằng Haversine).
-- Toàn bộ cột nullable -> không mất dữ liệu hiện có.
ALTER TABLE "rooms" ADD COLUMN     "geocodeSource" TEXT,
ADD COLUMN     "geocodedAddress" TEXT,
ADD COLUMN     "geocodedAt" TIMESTAMP(3),
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;
