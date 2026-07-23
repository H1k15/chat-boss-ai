# Chat Boss AI

Hệ thống AI hỗ trợ tư vấn khách thuê nhà trọ qua **Facebook cá nhân**, **Excel/Google Sheet** và **Telegram**.

Triết lý: **AI hỗ trợ người thật**, không spam/tự động điều khiển clone hàng loạt. AI soạn → nhân viên duyệt → nhân viên gửi. AI **không bịa** thông tin phòng.

## Cấu trúc

```
apps/backend     NestJS API + AI Engine + Prisma/PostgreSQL
apps/dashboard   Next.js (admin / quản lý / sale)
apps/extension   Chrome Extension MV3 (đọc hội thoại FB, gợi ý trả lời)
packages/shared  Types & enums dùng chung
PLAN.md          Kế hoạch triển khai chi tiết  ← ĐỌC FILE NÀY TRƯỚC
```

## Bắt đầu nhanh

```bash
pnpm install
cp .env.example .env            # điền ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN...
docker compose up -d postgres redis minio
pnpm --filter @cba/backend prisma migrate dev
pnpm --filter @cba/backend seed
pnpm --filter @cba/backend seed:templates   # khung mẫu câu AI
pnpm dev                        # backend :3001 + dashboard :3005
pnpm --filter @cba/extension build   # rồi load apps/extension/dist vào Chrome
```

> 📖 **Hướng dẫn chạy chi tiết** (cấu hình AI, cách chạy Docker, lỗi thường
> gặp): [`HUONG-DAN-CHAY.md`](HUONG-DAN-CHAY.md). Đăng nhập mặc định:
> `admin@chatboss.ai` / `admin123`.

## Chạy toàn bộ bằng Docker

```bash
docker compose --profile full up -d --build
```

Backend `:3001`, dashboard `:3000`. Đổi cổng khi bị trùng với dịch vụ khác:

```bash
BACKEND_PORT=3011 DASHBOARD_PORT=3002 docker compose --profile full up -d
```

> **Đường dẫn có dấu tiếng Việt:** BuildKit lấy đường dẫn build context làm
> session key gRPC, vốn chỉ nhận ASCII, nên build sẽ hỏng với lỗi khó hiểu
> `header key "x-docker-expose-session-sharedkey" contains value with
> non-printable ASCII characters`. Dùng builder cũ để vượt qua:
>
> ```bash
> DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0 docker compose --profile full build
> ```
>
> Cách sửa triệt để là đặt repo ở đường dẫn thuần ASCII.

Xem chi tiết kiến trúc, schema, API, roadmap trong [`PLAN.md`](PLAN.md).
