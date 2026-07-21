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
pnpm dev                        # backend :3001 + dashboard :3000
pnpm --filter @cba/extension build   # rồi load apps/extension/dist vào Chrome
```

Xem chi tiết kiến trúc, schema, API, roadmap trong [`PLAN.md`](PLAN.md).

> Lưu ý: chưa cài ESLint nên `pnpm lint` sẽ lỗi, dù mọi workspace đều khai báo script `lint`.
