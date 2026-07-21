FROM node:20-alpine AS base
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
RUN pnpm prisma generate && pnpm build

EXPOSE 3001
CMD ["node", "dist/src/main.js"]
