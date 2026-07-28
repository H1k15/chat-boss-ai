# Kế hoạch Multi-tenancy — thương mại hoá cho nhiều chủ trọ

> Tài liệu thiết kế để duyệt TRƯỚC khi code. Mục tiêu: biến hệ thống single-tenant
> hiện tại thành SaaS phục vụ nhiều chủ trọ, mỗi nơi có admin + dữ liệu tách biệt,
> nhưng dùng CHUNG một database (hướng A) thay vì mỗi khách một DB.

## 1. Quyết định kiến trúc

- **Chọn: chung DB + cột `organizationId`** (pooled / row-level multi-tenancy).
- **Không chọn:** mỗi khách một database (vận hành cực nặng: N DB × mỗi lần
  migrate/backup/deploy) — chỉ dùng nếu sau này có khách "enterprise" đòi cách ly
  tuyệt đối, khi đó bán như gói riêng.
- **Nguyên tắc cách ly:** ép ở TẦNG TRUNG TÂM (Prisma extension + tenant context),
  KHÔNG dựa vào việc nhớ lọc `organizationId` trong từng service (rò 1 chỗ là lộ
  chéo dữ liệu). Thêm Postgres Row-Level Security làm lớp phòng thủ thứ hai.

Mỗi chủ trọ = một **Organization** (org). Nhân viên, phòng, khách, hội thoại,
mẫu câu, log... đều thuộc về đúng một org.

## 2. Model mới: `Organization`

```prisma
model Organization {
  id        String   @id @default(cuid())
  name      String                        // "Nhà trọ An Bình"
  slug      String   @unique              // "an-binh" (dùng cho URL/subdomain)
  plan      String   @default("free")     // gói dịch vụ (free/pro/...)
  isActive  Boolean  @default(true)       // super-admin khoá được
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  users     User[]
  // ... quan hệ ngược tới mọi model có organizationId
  @@map("organizations")
}
```

## 3. Bảng cần thêm `organizationId`

Tất cả bảng chứa dữ liệu nghiệp vụ. Mỗi bảng thêm:
`organizationId String` + quan hệ tới `Organization` + `@@index([organizationId])`.

| Bảng | Ghi chú |
|---|---|
| `users` | Nhân viên thuộc org. Email `@unique` toàn cục → đổi thành **unique theo (organizationId, email)** |
| `facebook_profiles` | Nick FB của org |
| `customers` | Khách của org |
| `customer_notes` | (đã gắn qua customer, thêm org để lọc trực tiếp + RLS) |
| `conversations` | |
| `messages` | (qua conversation; thêm org để RLS đồng nhất) |
| `rooms` | `roomCode`/`code` `@unique` toàn cục → **unique theo (organizationId, code)** |
| `appointments` | |
| `care_tasks` | |
| `telegram_notifications` | `dedupeKey @unique` → **unique theo (organizationId, dedupeKey)** |
| `activity_logs` | Dữ liệu học tách theo org (quan trọng cho AI riêng từng khách) |
| `reply_templates` | Mẫu câu riêng mỗi org (giọng khác nhau) |
| `import_batches` | |

### AppSetting — xử lý riêng
Hiện `key` là khoá chính toàn cục. Đổi thành **khoá kép `(organizationId, key)`**:
- `landmarks`, `area_groups`, `room_media`, `room_type_overrides`, `sheet_rooms`,
  `telegram` → **theo org**.
- `geocode_cache` (địa chỉ → toạ độ) → **GIỮ TOÀN CỤC** (chia sẻ giữa các org để
  tái dùng kết quả Nominatim, tiết kiệm rate-limit). Tách riêng thành bảng global
  hoặc org đặc biệt `__global__`.

## 4. Super-admin & phân quyền

- Thêm vai trò **`SUPER_ADMIN`** (chủ SaaS = bạn). User này KHÔNG thuộc org nào
  (hoặc `organizationId` null), quản lý mọi org.
- Vai trò hiện tại (`ADMIN` / `MANAGER` / `STAFF`) trở thành phân quyền TRONG một org.
  - `ADMIN` của org = admin nhà trọ đó (đúng ý "admin khác nhau").
- Super-admin module: tạo/khoá org, tạo admin đầu tiên cho org, xem usage/billing.

## 5. Cách ép cách ly dữ liệu (phần quan trọng nhất)

### 5.1 Tenant context theo request
- Dùng `AsyncLocalStorage` giữ `organizationId` của request hiện tại.
- Middleware/Interceptor: đọc `organizationId` từ JWT → set vào ALS đầu mỗi request.

### 5.2 Prisma Client Extension (ép tự động)
Một extension bọc mọi truy vấn:
- `find*/update*/delete*/count/aggregate` → tự chèn `where: { organizationId }`.
- `create/createMany` → tự set `data.organizationId`.
- Đọc org từ ALS. Model global (geocode_cache) nằm trong danh sách loại trừ.

→ Lập trình viên viết `prisma.room.findMany()` như bình thường, extension tự lọc
theo org. Không thể quên. Đây là xương sống chống rò chéo.

### 5.3 Postgres Row-Level Security (phòng thủ lớp 2, tuỳ chọn)
- Bật RLS trên các bảng, policy `organizationId = current_setting('app.org_id')`.
- App set `app.org_id` theo mỗi kết nối/giao dịch.
- Kể cả code lọt lỗi, DB vẫn chặn. Nên có cho bản thương mại nghiêm túc.

## 6. Auth

- Payload JWT thêm `organizationId` (login trả token gắn org của user).
- `JwtStrategy.validate` → `req.user = { userId, role, organizationId }`.
- Guard global hiện tại (fail-closed) GIỮ NGUYÊN — đã là nền tốt.
- Super-admin: token có cờ riêng, bỏ qua lọc org (hoặc chọn org để "impersonate"
  khi hỗ trợ khách).

## 7. Cấu hình & secret theo org

- **Telegram bot token**: hiện ở `.env` (một bot). Thương mại → mỗi org một chat/bot.
  Token là secret → **mã hoá tại DB** (KHÔNG để plaintext trong app_settings). Cân
  nhắc bảng `org_secrets` mã hoá bằng KMS/khoá server.
- **Google Sheet nguồn phòng**: mỗi org một sheet → cấu hình per-org.
- **LLM (Groq/Ollama)**: hạ tầng dùng chung được, nhưng **đo usage theo org** để
  tính tiền và chặn lạm dụng (rate limit theo org).

## 8. Di trú dữ liệu hiện có (an toàn, không mất dữ liệu)

1. Tạo bảng `organizations`, chèn **org đầu tiên** = nhà trọ hiện tại.
2. Thêm cột `organizationId` **nullable** vào mọi bảng.
3. **Backfill**: gán tất cả dòng hiện có = org đầu tiên.
4. Đổi cột sang **NOT NULL** + thêm unique kép (email, roomCode, dedupeKey...).
5. Chưa đổi hành vi gì (vẫn 1 org) → không gãy hệ thống đang chạy.

Migrate viết tay qua `prisma migrate diff` (giống migration geocode đã làm), vì
`migrate dev` bị chặn ở môi trường non-interactive.

## 9. Ảnh hưởng tới extension

- Nhân viên đăng nhập → JWT mang `organizationId` → API tự lọc org. Extension
  gần như không đổi (đã gửi token sẵn).
- `facebookProfileId` phải trỏ tới FacebookProfile THUỘC org của người đăng nhập.
- Nút "Mở trang quản trị" trỏ tới dashboard của đúng org (theo subdomain/slug nếu deploy).

## 10. Thứ tự triển khai (chia đợt, mỗi đợt merge được độc lập)

| Đợt | Nội dung | Rủi ro |
|---|---|---|
| **1. Nền dữ liệu** | Model `Organization` + org đầu tiên + `organizationId` (nullable→backfill→not null) + unique kép | Thấp (chưa đổi hành vi) |
| **2. Ép cách ly** | Tenant context (ALS) + Prisma extension lọc org + JWT mang org | Trung bình — cần test kỹ |
| **3. Cấu hình per-org** | AppSetting khoá kép, telegram/sheet/mẫu câu theo org, tách geocode_cache global | Trung bình |
| **4. Super-admin** | Module quản lý org, tạo org + admin, khoá/mở | Thấp |
| **5. Onboarding + billing** | Đăng ký org, chọn gói, thanh toán, giới hạn theo gói | Trung bình |
| **6. Production** | Deploy managed Postgres + domain, secret mã hoá, RLS, backup trên server | Trung bình |

Khuyến nghị làm **Đợt 1–2 sớm** (trước khi tích nhiều dữ liệu single-tenant, càng
để lâu càng khó tách), rồi mới tính thương mại (3–6).

## 11. Thương mại ngoài kỹ thuật

- **Billing**: gói (free/pro), giới hạn (số phòng, số tin AI/tháng), tính theo usage LLM.
- **Onboarding**: form tạo nhà trọ → tự dựng org + admin + cấu hình mặc định (mẫu câu, landmark seed).
- **Deploy cố định**: dashboard + backend lên server/domain thật (không `pnpm dev` trên máy bạn); mỗi org truy cập qua subdomain (`anbinh.chatboss.ai`) hoặc chọn org sau đăng nhập.
- **Xuất/xoá dữ liệu theo org**: khách rời đi → xuất DB của riêng họ + xoá sạch (nghĩa vụ dữ liệu). Với hướng A: filter theo org rồi dump.
- **Backup**: cơ chế đã có; chạy trên server production, giữ tách biệt theo môi trường.

## 12. Rủi ro & kiểm thử

- **Rò chéo dữ liệu** = rủi ro sống còn. Bắt buộc:
  - Test tự động: user org A **không** đọc/sửa được bất kỳ dữ liệu org B (mọi endpoint).
  - Test extension enforce org (findMany tự lọc).
  - Kiểm tra các truy vấn raw/aggregate cũng đi qua extension.
- **Unique keys**: quên đổi sang khoá kép sẽ chặn nhầm (2 org không thể có cùng
  email/roomCode). Đã liệt kê ở mục 3.
- **Migrate**: luôn backfill trước khi NOT NULL; test trên bản sao DB trước.

---

## Tóm tắt trả lời câu hỏi ban đầu
- **Admin riêng mỗi nhà:** ĐÚNG — mỗi org có admin riêng (`ADMIN` trong org).
- **Database khác nhau:** KHÔNG cần — dùng chung một DB + `organizationId`, ép cách
  ly ở tầng trung tâm. Nhẹ vận hành, dễ thêm khách, vẫn tách biệt an toàn.

Khi bạn duyệt xong tài liệu này, ta bắt đầu từ **Đợt 1** (nền dữ liệu) — ít rủi ro,
không đổi hành vi hệ thống đang chạy.
