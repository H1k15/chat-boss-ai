FROM node:20-alpine AS base
# Prisma dò phiên bản libssl bằng binary `openssl`, mà node:20-alpine không
# cài sẵn. Thiếu nó Prisma đoán bừa openssl-1.1.x, nạp engine linux-musl trơn
# rồi chết vì libssl.so.1.1 không tồn tại (image chỉ có libssl.so.3).
RUN apk add --no-cache openssl
RUN npm i -g pnpm@9
WORKDIR /app

# Cài dependencies (tận dụng cache)
COPY pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
RUN pnpm install --frozen-lockfile || pnpm install

# Copy mã nguồn
COPY packages/shared packages/shared
COPY apps/backend apps/backend

# Phải build shared trước: backend lấy type từ packages/shared/dist và
# require bản đã build lúc chạy, không dùng source TS.
RUN pnpm --filter @cba/shared build

WORKDIR /app/apps/backend
# pnpm exec chứ không phải script "prisma": script đó bọc dotenv trỏ vào
# ../../.env, mà .env bị loại khỏi build context qua .dockerignore.
RUN pnpm exec prisma generate && pnpm build

EXPOSE 3001
CMD ["node", "dist/src/main.js"]
