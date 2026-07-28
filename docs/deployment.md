# Hướng dẫn deploy production (SaaS nhiều nhà trọ)

> Phần code (billing/giới hạn, multi-tenant) đã xong. Deploy thực tế cần **hạ
> tầng của bạn** (server + domain + tài khoản dịch vụ) nên tài liệu này là các
> bước bạn tự chạy khi sẵn sàng.

## 1. Kiến trúc chạy thật

```
Người dùng ──HTTPS──> [Reverse proxy: Nginx/Caddy] ──> backend (NestJS :3001)
                                                  └──> dashboard (Next.js :3000)
Extension Chrome ──HTTPS──> backend API
backend ──> PostgreSQL (managed hoặc container) + Redis + MinIO/S3 + LLM (Groq/Ollama)
```

## 2. Yêu cầu hạ tầng (bạn chuẩn bị)
- **Server** (VPS/cloud) chạy Docker, hoặc nền tảng PaaS.
- **Domain** (vd `chatboss.ai`) + chứng chỉ HTTPS (Let's Encrypt qua Caddy/Nginx).
- **PostgreSQL**: khuyến nghị managed (Neon/Supabase/RDS) để tự backup + bền; hoặc container như dev.
- **LLM**: khoá Groq (hoặc Claude API) — biến `OPENAI_BASE_URL`/khoá tương ứng.

## 3. Biến môi trường production (`.env`)
Bắt buộc ĐỔI so với dev:
- `DATABASE_URL` — trỏ Postgres production.
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — chuỗi ngẫu nhiên MẠNH, khác dev.
- `JWT_ACCESS_TTL` (vd `12h`), `JWT_REFRESH_TTL` (`7d`).
- Khoá LLM (Groq/Claude), `TELEGRAM_BOT_TOKEN` (nếu dùng chung; per-org để Đợt secret).
- `NEXT_PUBLIC_API_BASE` cho dashboard trỏ domain backend thật.

## 4. Build & chạy
- Backend: `pnpm --filter @cba/backend build` -> `node dist/src/main.js` (hoặc Docker image).
- Dashboard: `pnpm --filter @cba/dashboard build` -> `pnpm --filter @cba/dashboard start`.
- Có thể đóng gói bằng Docker + `docker compose -f docker-compose.prod.yml up -d`
  (dựng file prod từ `docker-compose.yml`, bỏ mount code, dùng image đã build).

## 5. Khởi tạo dữ liệu
```
pnpm --filter @cba/backend prisma migrate deploy   # tạo/di trú schema
pnpm --filter @cba/backend seed                     # tạo org mặc định + super-admin
pnpm --filter @cba/backend seed:templates           # nạp mẫu câu
```
⚠️ **ĐỔI NGAY mật khẩu** `super@chatboss.ai` / `admin@chatboss.ai` mặc định sau seed.

## 6. Nhiều nhà trọ (multi-tenant)
- Đăng nhập super-admin -> trang **Nhà trọ (SaaS)** tạo từng nhà trọ + admin.
- Truy cập: đơn giản nhất là **một domain chung**, đăng nhập theo tài khoản (org gắn trong JWT). 
- Nâng cao: **subdomain mỗi nhà trọ** (`anbinh.chatboss.ai`) -> reverse proxy trỏ cùng backend, xác định org theo slug (cần thêm code map subdomain->org khi muốn).

## 7. Gói & giới hạn (đã có)
- Gói trong `apps/backend/src/common/plans.ts` (free/pro/unlimited): trần số NV,
  số phòng, **số gợi ý AI/ngày** (chốt chi phí LLM).
- Super-admin đổi gói qua trang Nhà trọ (dropdown) hoặc `PATCH /admin/organizations/:id/plan`.
- Vượt trần -> API trả 403 với thông báo rõ.

## 8. Backup
- Script `scripts/backup-db.ps1` (Windows) — xoay vòng ngày/tuần/tháng. Trên Linux
  dùng `pg_dump | gzip` qua cron tương tự. Managed Postgres thường tự backup.

## 9. Bảo mật CẦN LÀM trước khi mở cho khách thật
- [ ] Đổi toàn bộ secret/mật khẩu mặc định.
- [ ] HTTPS bắt buộc; CORS giới hạn domain.
- [ ] **Postgres RLS** làm lớp cách ly thứ 2 (hiện ép ở tầng ứng dụng qua Prisma
      middleware — đã verify, nhưng RLS chặn kể cả khi code lọt lỗi).
- [ ] **Secret per-org mã hoá** (Telegram bot/Google Sheet của từng nhà trọ) —
      chưa làm, cần khi mỗi nhà trọ dùng bot/sheet riêng.
- [ ] Rate limit theo org, giám sát usage LLM.
- [ ] Backup tự động chạy trên server production + lưu off-site.

## 10. Checklist gọn
1. Server + domain + HTTPS.
2. Postgres production + `DATABASE_URL`.
3. Đổi JWT secrets + khoá LLM trong `.env`.
4. `migrate deploy` + `seed` + đổi mật khẩu mặc định.
5. Build & chạy backend + dashboard sau reverse proxy.
6. Tạo nhà trọ qua trang super-admin, đặt gói.
7. Bật backup + theo dõi.
