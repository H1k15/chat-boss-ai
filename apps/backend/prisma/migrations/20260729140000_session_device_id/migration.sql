-- Thêm mã MÁY (deviceId) cho phiên để "đá nguyên máy cũ" khi đăng nhập máy mới.
-- dashboard + extension trên cùng một máy dùng chung deviceId nên cùng tồn tại.

-- AlterTable
ALTER TABLE "user_sessions" ADD COLUMN "deviceId" TEXT;

-- CreateIndex
CREATE INDEX "user_sessions_userId_deviceId_idx" ON "user_sessions"("userId", "deviceId");
