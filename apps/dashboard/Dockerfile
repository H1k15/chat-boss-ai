FROM node:20-alpine AS base
RUN npm i -g pnpm@9
WORKDIR /app

# Cài dependencies (tận dụng cache)
COPY pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/dashboard/package.json apps/dashboard/
RUN pnpm install --frozen-lockfile || pnpm install

# Copy mã nguồn
COPY packages/shared packages/shared
COPY apps/dashboard apps/dashboard

# NEXT_PUBLIC_* được nhúng thẳng vào bundle lúc build, không đọc lúc chạy,
# nên phải truyền qua ARG. Đặt trong env_file thôi là không đủ.
ARG NEXT_PUBLIC_API_BASE=http://localhost:3001/api/v1
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE

WORKDIR /app/apps/dashboard
RUN pnpm build

EXPOSE 3000
CMD ["pnpm", "start"]
