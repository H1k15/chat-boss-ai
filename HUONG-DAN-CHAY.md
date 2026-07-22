# Hướng dẫn chạy Chat Boss AI — chi tiết

Tài liệu này hướng dẫn chạy toàn bộ hệ thống từ đầu. Đọc [`PLAN.md`](PLAN.md)
để hiểu kiến trúc; tài liệu này chỉ tập trung vào **cách chạy**.

---

## 0. Yêu cầu

| Công cụ | Ghi chú |
|---|---|
| **Node.js 20+** | Chạy backend/dashboard |
| **pnpm 9** | `npm i -g pnpm@9` |
| **Docker Desktop** | Chạy Postgres, Redis, MinIO (và cả app nếu muốn) |
| **Ollama** (tuỳ chọn) | Nếu dùng model AI chạy trên máy, miễn phí |

> ⚠️ **Đường dẫn thư mục KHÔNG nên có dấu tiếng Việt.** Thư mục hiện tại là
> `C:\Hệ thống AI hỗ trợ tư vấn` — dấu tiếng Việt làm hỏng BuildKit của Docker
> (lỗi `x-docker-expose-session-sharedkey ... non-printable ASCII`). Cách vòng
> là dùng builder cũ (xem mục 5). Cách sửa triệt để: đặt repo ở đường dẫn thuần
> ASCII, ví dụ `C:\chat-boss-ai`.

---

## 1. Cài đặt lần đầu

```bash
pnpm install                     # cài dependency cho cả monorepo
cp .env.example .env             # tạo file cấu hình
```

Mở `.env`, tối thiểu cần xem 3 khối:
- **AI PROVIDER** — chọn Claude (cần API key + tiền) hoặc Ollama local (miễn phí). Xem mục 4.
- **DATABASE_URL** — mặc định trỏ Postgres của Docker, không cần sửa.
- **TELEGRAM** — điền sau nếu muốn thông báo; bỏ trống vẫn chạy.

> `.env` đã được `.gitignore` — chứa secret, không bao giờ commit.

---

## 2. Khởi động hạ tầng (Postgres, Redis, MinIO)

```bash
docker compose up -d postgres redis minio
```

Đợi Postgres "healthy" (vài giây):

```bash
docker compose ps
```

---

## 3. Tạo bảng và dữ liệu mẫu

```bash
# Sinh Prisma client + tạo bảng
pnpm --filter @cba/backend prisma migrate dev

# Nạp dữ liệu mẫu: 2 user, 3 phòng, 1 nick FB
pnpm --filter @cba/backend seed

# Nạp khung mẫu câu AI (14 mẫu ví dụ, 11 ý định)
pnpm --filter @cba/backend seed:templates
```

Tài khoản mặc định sau khi seed:

| Email | Mật khẩu | Quyền |
|---|---|---|
| `admin@chatboss.ai` | `admin123` | ADMIN |
| `sale1@chatboss.ai` | `sale123` | STAFF |

---

## 4. Cấu hình bộ não AI

Hệ thống cần một model ngôn ngữ. Chọn **một** trong hai:

### Cách A — Model chạy trên máy (Ollama), miễn phí

```bash
# Cài Ollama (Windows): winget install --id Ollama.Ollama --source winget
ollama serve                     # chạy nền (Windows: app tự chạy sau khi cài)
ollama pull qwen2.5:3b           # tải model (~2GB)
```

Trong `.env`:
```
AI_PROVIDER=openai
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_API_KEY=ollama
OPENAI_MODEL=qwen2.5:3b
```

- **Ưu:** miễn phí, dữ liệu khách không ra khỏi máy.
- **Nhược:** chậm trên máy không có GPU (mỗi câu vài chục giây), model nhỏ hay
  trả lời chưa chuẩn. SafetyGuard vẫn chặn được các câu bịa giá/SĐT.

### Cách B — Claude API (chất lượng cao)

Trong `.env`:
```
AI_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-api03-...   # lấy tại platform.claude.com
ANTHROPIC_MODEL=claude-sonnet-5
```

> ⚠️ Cần **nạp tiền** tại platform.claude.com → Billing. Key không có credit sẽ
> báo lỗi *"credit balance is too low"*.

- **Ưu:** nhanh (~2-3s), tiếng Việt tự nhiên, ít bịa.
- **Nhược:** tốn tiền theo lượt gọi (~vài trăm đồng/câu), dữ liệu gửi lên Anthropic.

> Đổi provider chỉ cần sửa `AI_PROVIDER` rồi khởi động lại backend — không phải
> build lại code.

---

## 5. Chạy ứng dụng — chọn 1 trong 2 cách

### Cách 1 — Chế độ dev (khuyên dùng khi phát triển)

Chạy backend + dashboard thẳng trên máy, hạ tầng vẫn ở Docker:

```bash
pnpm dev
```

- Backend: http://localhost:3001/api/v1
- Dashboard: http://localhost:3000

### Cách 2 — Chạy tất cả bằng Docker

```bash
# LƯU Ý: đường dẫn tiếng Việt cần builder cũ (DOCKER_BUILDKIT=0)
DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0 docker compose --profile full up -d --build
```

- Backend: http://localhost:3001
- Dashboard: http://localhost:3000

**Nếu cổng bị trùng** với dịch vụ khác trên máy, đổi cổng:
```bash
BACKEND_PORT=3011 DASHBOARD_PORT=3002 DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0 \
  docker compose --profile full up -d
```

> Khi chạy trong Docker, backend gọi Ollama trên máy host qua
> `host.docker.internal` (đã cấu hình sẵn trong docker-compose).

---

## 6. Kiểm tra chạy được

```bash
# Đăng nhập (phải trả về accessToken)
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@chatboss.ai","password":"admin123"}'
```

Rồi mở dashboard trên trình duyệt, đăng nhập `admin@chatboss.ai` / `admin123`.

---

## 7. Dùng dashboard

Mở http://localhost:3000 (hoặc :3002 nếu đổi cổng), đăng nhập. Các màn chính:

| Màn | Việc |
|---|---|
| **Mẫu câu AI** | Thêm/sửa/xoá mẫu câu để AI nói đúng giọng đội bạn |
| **Nhập phòng (Excel)** | Tải file mẫu, điền phòng, upload |
| **Cấu hình** | Bật/tắt thông báo Telegram, đổi chat ID |
| Khách hàng / Phòng / Lịch hẹn / Báo cáo | Xem dữ liệu |

**Việc quan trọng nhất khi mới chạy:** vào **Mẫu câu AI** điền mẫu cho 4 ý định
cốt lõi (`ASK_PRICE`, `ASK_AVAILABILITY`, `ASK_ADDRESS`, `WANT_VIEWING`). Nhớ
**3 quy tắc**: không ghi số tiền cụ thể (dùng `{{gia}}`), không ghi số điện
thoại, giữ ngắn dưới 200 ký tự.

---

## 8. Build và nạp Chrome Extension

```bash
pnpm --filter @cba/extension build
```

Rồi trong Chrome:
1. Vào `chrome://extensions`
2. Bật **Developer mode** (góc trên phải)
3. **Load unpacked** → chọn thư mục `apps/extension/dist`

> ⚠️ Selector Facebook trong extension hiện là **giá trị mẫu**, cần đối chiếu
> với DOM Messenger thật khi triển khai (rủi ro #1 của dự án — FB đổi giao diện).

---

## 9. Các lệnh tham khảo nhanh

```bash
pnpm dev                         # chạy dev (backend + dashboard)
pnpm test                        # chạy test (53 test ở backend)
pnpm typecheck                   # kiểm tra kiểu
pnpm --filter @cba/backend seed:templates   # nạp lại mẫu câu sau khi sửa
pnpm --filter @cba/backend export:finetune  # xuất dữ liệu AI→người-gửi ra JSONL

docker compose --profile full logs backend --tail 30   # xem log backend
docker compose --profile full down                     # dừng tất cả
```

---

## 10. Lỗi thường gặp

| Lỗi | Nguyên nhân & cách xử lý |
|---|---|
| Build Docker lỗi `non-printable ASCII` | Đường dẫn có dấu tiếng Việt. Dùng `DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0` trước lệnh, hoặc đặt repo ở đường dẫn ASCII. |
| `Bind for 0.0.0.0:3000 failed: port is already allocated` | Cổng bị chiếm. Đổi `DASHBOARD_PORT`/`BACKEND_PORT`. |
| Backend lỗi `Environment variable not found: DATABASE_URL` | Chạy lệnh Prisma sai chỗ. Dùng `pnpm --filter @cba/backend prisma ...` (script đã bọc dotenv trỏ về `.env` gốc). |
| AI trả lỗi 503 / "credit balance too low" | Dùng Claude nhưng chưa nạp tiền, hoặc key sai. Xem mục 4B. |
| `/sheets/sync` báo 503 | Chưa cấu hình Google service account. Đây là đúng thiết kế — cần setup Google Console + chia sẻ Sheet. |
| Model local rất chậm | Máy không có GPU. Thử model nhỏ hơn (`qwen2.5:1.5b`) hoặc chuyển sang Claude. |
| `pnpm lint` cần ESLint | Đã cài rồi; nếu lỗi thì `pnpm install` lại. |

---

## 11. Điều cần biết về giới hạn hiện tại

- **Model local (Qwen 3B)** chạy được nhưng chậm và hay bịa thông tin trên máy
  yếu. SafetyGuard chặn được câu bịa giá/SĐT, nhưng để tư vấn thật nên cân nhắc
  Claude hoặc máy mạnh hơn.
- **Extension chưa test trên Facebook thật** — selector là giá trị mẫu.
- **`/sheets/sync`** cần bạn setup Google Console mới chạy được.
- **Realtime Socket.IO (`/rt`)** trong PLAN §6.10 chưa dựng.
- Còn thu thập đủ dữ liệu "AI đề xuất → người gửi" (qua extension) thì mới
  fine-tune model riêng được — xem `export:finetune`.
