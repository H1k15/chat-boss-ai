# KẾ HOẠCH TRIỂN KHAI CHI TIẾT — Chat Boss AI

> Hệ thống AI hỗ trợ tư vấn khách thuê nhà trọ qua Facebook cá nhân, Excel/Google Sheet và Telegram.
>
> Tài liệu này là kim chỉ nam kỹ thuật để đội phát triển bắt đầu code. Nó đi kèm bộ mã nguồn khởi tạo (scaffold) trong cùng repo.

---

## 1. Tổng quan & triết lý thiết kế

Chat Boss AI **không phải** công cụ tự động spam/điều khiển clone hàng loạt. Nó là lớp **AI hỗ trợ người thật**: nhân viên vẫn dùng nick Facebook cá nhân thật, extension chỉ đọc nội dung đang hiển thị, gợi ý câu trả lời và lưu dữ liệu; **con người luôn bấm gửi** những nội dung quan trọng.

Ba nguyên tắc xuyên suốt kiến trúc:

1. **Con người trong vòng lặp (human-in-the-loop).** AI soạn → nhân viên duyệt → nhân viên gửi. Chỉ vài câu xã giao đơn giản mới cho bán tự động, và luôn có log.
2. **AI không bịa.** Mọi thông tin phòng (giá, địa chỉ, tiện ích, trạng thái) chỉ lấy từ dữ liệu thật (Excel/DB). Nếu thiếu dữ liệu, AI hỏi lại hoặc báo nhân viên, tuyệt đối không tự chế.
3. **Tách rủi ro khỏi lõi.** Toàn bộ trí tuệ nằm ở server. Extension chỉ là lớp mỏng đọc DOM + hiển thị gợi ý, để khi Facebook đổi giao diện thì chỉ sửa selector chứ không đụng logic AI.

---

## 2. Quyết định công nghệ (tư vấn)

Bạn đã nhờ tôi chọn giúp **Backend** và **AI model**. Dưới đây là đề xuất kèm lý do.

### 2.1. Backend: **Node.js + NestJS (TypeScript)** ✅

| Tiêu chí | NestJS (chọn) | FastAPI |
|---|---|---|
| Chia sẻ code với Extension & Dashboard | ✅ Cùng TypeScript → dùng chung types trong `packages/shared` | ❌ Khác ngôn ngữ |
| Cấu trúc module hoá | ✅ Module/DI rất hợp hệ nhiều domain (customers, rooms, ai, telegram...) | Trung bình |
| Hàng đợi tác vụ (BullMQ + Redis) | ✅ Tích hợp mượt | Có (Celery) nhưng thêm stack Python |
| Realtime (WebSocket cho extension ⇄ dashboard) | ✅ Gateway sẵn có | Có |
| AI SDK | ✅ `@anthropic-ai/sdk`, `openai` đều có bản Node | ✅ |

**Lý do chính:** cả 3 phần frontend/extension đều là JS/TS. Chọn NestJS cho backend giúp **một ngôn ngữ, dùng chung type khai báo DTO/entity**, giảm chi phí bảo trì cho team nhỏ. NestJS cũng ép cấu trúc module rõ ràng — rất hợp một hệ thống nhiều domain như thế này.

> Nếu về sau cần xử lý AI/ML nặng (fine-tune, embedding cục bộ), có thể tách một **microservice Python FastAPI** riêng cho AI và gọi qua HTTP. Kiến trúc đã để sẵn ranh giới cho việc này (module `ai` chỉ là một adapter).

### 2.2. AI model: **Claude API (Anthropic)** làm mặc định, thiết kế provider-agnostic ✅

Yêu cầu #1 của dự án là **"không bịa thông tin phòng"** và trả lời tiếng Việt tự nhiên như nhân viên thật. Đây chính là điểm mạnh của Claude: bám sát chỉ dẫn (system prompt "chỉ dùng dữ liệu được cung cấp"), tiếng Việt tốt, hỗ trợ **tool-use/structured output** để phân loại ý định và trích xuất thông tin có cấu trúc.

Tuy nhiên, để tránh khoá cứng nhà cung cấp, **lớp AI được thiết kế theo interface `LlmProvider`** với 2 implementation: `ClaudeProvider` (mặc định) và `OpenAiProvider`. Đổi model chỉ cần đổi biến môi trường `AI_PROVIDER=claude|openai`.

```
AI_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-5       # cân bằng chi phí/chất lượng cho hội thoại
# hoặc
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

**Hai lưu ý kỹ thuật bắt buộc khi code lớp AI** (đã áp dụng trong scaffold):

1. **Không gửi `temperature`/`top_p`/`top_k`.** Các model đời hiện tại đã bỏ
   những tham số này — gửi lên là lỗi HTTP 400. Mọi điều chỉnh giọng văn / độ
   đa dạng phải viết vào system prompt (`src/modules/ai/prompts.ts`).
2. **Dùng structured outputs (`output_config.format`), không dùng tool-use giả.**
   API ràng buộc quá trình sinh token theo JSON schema nên không cần "dặn" model
   trả JSON. Ràng buộc schema: mọi object phải có `additionalProperties: false`
   và liệt kê ĐỦ field trong `required` — field tuỳ chọn biểu diễn bằng union
   với `null` (xem helper `strictObject()` / `nullable()` trong
   `llm-provider.interface.ts`), không phải bỏ khỏi `required`.

### 2.3. Bảng công nghệ tổng hợp

| Thành phần | Công nghệ |
|---|---|
| Chrome Extension | TypeScript, Manifest V3, Vite, React (sidebar/popup) |
| Dashboard | Next.js 14 (App Router), React, TailwindCSS, TanStack Query |
| Backend | Node.js 20, NestJS 10, TypeScript |
| ORM / DB | Prisma + PostgreSQL 16 |
| Cache / Queue | Redis 7 + BullMQ |
| Realtime | Socket.IO (NestJS Gateway) |
| AI | Anthropic Claude API (mặc định) / OpenAI (tuỳ chọn) |
| Excel / Sheet | `xlsx` (SheetJS) + Google Sheets API v4 |
| Telegram | `node-telegram-bot-api` / Telegram Bot API |
| Lưu file | S3-compatible (MinIO cho dev, AWS S3/Cloudflare R2 cho prod) |
| Auth | JWT (access + refresh), bcrypt, RBAC |
| Log/Monitor | Pino (log), Sentry (error), OpenTelemetry (tuỳ chọn) |
| Đóng gói/Chạy | Docker, docker-compose, Nginx (reverse proxy) |
| Kiểm thử | Jest (unit/e2e), Playwright (dashboard), Vitest (extension) |
| Monorepo | pnpm workspaces + Turborepo |

---

## 3. Kiến trúc tổng thể

```
┌──────────────────────────────────────────────────────────────────────┐
│                          TRÌNH DUYỆT NHÂN VIÊN                         │
│                                                                        │
│   Facebook / Messenger  ◀──đọc DOM──  Chrome Extension (MV3)           │
│                                          │  content-script (đọc/inject) │
│                                          │  sidebar UI (React)          │
│                                          │  background service worker   │
└──────────────────────────────────────────┼───────────────────────────┘
                                            │ HTTPS + WSS (JWT)
                                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          BACKEND (NestJS)                              │
│                                                                        │
│  API Gateway ─┬─ Auth/RBAC        ─┬─ Customers  ─┬─ Rooms             │
│               ├─ Conversations     ├─ Appointments├─ Reports           │
│               ├─ FacebookProfiles  ├─ CareTasks   ├─ Excel/Sheets      │
│               │                                                        │
│               ├─ AI Engine  ──►  LlmProvider (Claude/OpenAI)           │
│               │      ├─ IntentClassifier                               │
│               │      ├─ InfoExtractor                                  │
│               │      ├─ RoomMatcher (không gọi LLM — thuần logic)      │
│               │      ├─ ReplyGenerator                                 │
│               │      └─ SafetyGuard                                    │
│               │                                                        │
│               └─ Telegram Notifier ──►  Telegram Bot API              │
│                                                                        │
│  Queue (BullMQ): care-reminders, telegram-dispatch, excel-import,      │
│                  end-of-day-report                                     │
└───────────┬───────────────────────────────┬──────────────────────────┘
            │                                │
     ┌──────▼──────┐                  ┌──────▼──────┐        ┌──────────┐
     │ PostgreSQL  │                  │   Redis     │        │  S3/MinIO│
     │ (dữ liệu)   │                  │ (cache/queue)│       │  (ảnh)   │
     └─────────────┘                  └─────────────┘        └──────────┘

            ▲                                                  ▲
            │                                                  │
┌───────────┴──────────┐                          ┌────────────┴─────────┐
│  Dashboard (Next.js) │                          │ Excel / Google Sheet │
│  Admin/Quản lý/Sale  │                          │ (nguồn dữ liệu phòng)│
└──────────────────────┘                          └──────────────────────┘
```

**Luồng cốt lõi (inbox):** Extension đọc hội thoại → gửi `POST /ai/suggest` → Backend chạy IntentClassifier + InfoExtractor + RoomMatcher + ReplyGenerator + SafetyGuard → trả gợi ý → nhân viên duyệt & gửi → nếu có SĐT/lịch hẹn thì lưu lead + đẩy Telegram + cập nhật CRM.

---

## 4. Cấu trúc monorepo

```
chat-boss-ai/
├── docs/
│   ├── PLAN.md                 ← tài liệu này
│   └── API.md                  ← liệt kê endpoint (sinh dần khi code)
├── docker-compose.yml          ← postgres, redis, minio, backend, dashboard
├── package.json                ← workspace root (pnpm)
├── pnpm-workspace.yaml
├── turbo.json
├── .env.example
├── packages/
│   └── shared/                 ← types & enums dùng chung (customer status, intents...)
│       └── src/
├── apps/
│   ├── backend/                ← NestJS API + AI + queue
│   │   ├── prisma/schema.prisma
│   │   └── src/modules/{auth,users,facebook-profiles,customers,rooms,
│   │                     conversations,appointments,care-tasks,
│   │                     ai,telegram,excel,reports}/
│   ├── dashboard/              ← Next.js admin/quản lý/sale
│   │   └── src/app/{login,rooms,customers,appointments,reports}/
│   └── extension/              ← Chrome MV3
│       └── src/{content,background,sidebar,popup}/
```

---

## 5. Thiết kế cơ sở dữ liệu (PostgreSQL + Prisma)

Schema đầy đủ nằm ở `apps/backend/prisma/schema.prisma`. Tóm tắt các bảng và quan hệ:

### 5.1. Danh sách bảng

| Bảng | Vai trò |
|---|---|
| `users` | Tài khoản hệ thống (admin / manager / staff) |
| `facebook_profiles` | Các nick FB cá nhân mà nhân viên đang dùng |
| `customers` | Khách thuê (lead) |
| `conversations` | Hội thoại (mỗi khách × mỗi nick × kênh) |
| `messages` | Từng tin nhắn/comment trong hội thoại |
| `rooms` | Phòng trọ (đồng bộ từ Excel/Sheet) |
| `appointments` | Lịch hẹn xem phòng |
| `care_tasks` | Task nhắc chăm sóc lại khách |
| `telegram_notifications` | Log các thông báo đã gửi Telegram |
| `activity_logs` | Nhật ký thao tác nhân viên (bảo mật/audit) |
| `reply_templates` | Mẫu câu trả lời cấu hình bởi admin |
| `import_batches` | Lịch sử import Excel/Sheet (để rollback/đối soát) |

### 5.2. Các enum quan trọng (đặt trong `packages/shared` và ánh xạ Prisma)

```
UserRole         = ADMIN | MANAGER | STAFF
CustomerStatus   = NEW | ASKING_INFO | ADVISED | SENT_MEDIA | ASKED_PHONE
                 | HAS_PHONE | APPOINTED | VIEWED | CONSIDERING | CLOSED
                 | NOT_SUITABLE | NO_RESPONSE
Channel          = INBOX | COMMENT
SourceType       = INBOX | COMMENT
CustomerIntent   = ASK_AVAILABILITY | ASK_PRICE | ASK_ADDRESS | ASK_UTILITIES
                 | LEFT_PHONE | WANT_VIEWING | ASK_MEDIA | GREETING
                 | SMALL_TALK | IRRELEVANT | OTHER
RoomStatus       = AVAILABLE | DEPOSITED | RENTED
AppointmentStatus= SCHEDULED | ARRIVED | CANCELLED | NO_SHOW
CareTaskStatus   = PENDING | DONE | SNOOZED | CANCELLED
NotifyEvent      = LEFT_PHONE | APPOINTMENT | URGENT_CALL | EOD_REPORT
                 | ROOM_LOW | CARE_REMINDER
```

### 5.3. Quan hệ chính

- `users (1) ── (N) facebook_profiles` — một nhân viên nhiều nick.
- `customers (N) ── (1) users` qua `assigned_to` — khách được phân cho nhân viên.
- `customers (N) ── (1) facebook_profiles` qua `source_profile_id` — nick tiếp nhận lead.
- `conversations (N) ── (1) customers`, `conversations (1) ── (N) messages`.
- `appointments (N) ── (1) customers`, `(N) ── (1) rooms`, `(N) ── (1) users` (người đón).
- `care_tasks (N) ── (1) customers`, `(N) ── (1) users`.
- `rooms` gắn `import_batch_id` để biết đến từ lần import nào.

> Chi tiết đầy đủ từng cột (kiểu, index, ràng buộc) xem trong `schema.prisma`. Các cột tiền tệ dùng `Int` (đơn vị VND) để tránh sai số dấu phẩy động. Cột `budget_min/budget_max`, `price`, `deposit` đều là VND nguyên.

---

## 6. Thiết kế API (REST + WebSocket)

Base URL: `/api/v1`. Xác thực bằng `Authorization: Bearer <accessToken>`.

### 6.1. Auth
```
POST   /auth/login                { email, password } → { accessToken, refreshToken, user }
POST   /auth/refresh              { refreshToken } → { accessToken }
POST   /auth/logout
GET    /auth/me
```

### 6.2. AI (trái tim hệ thống — extension gọi nhiều nhất)
```
POST   /ai/suggest
  body: {
    facebookProfileId, channel: INBOX|COMMENT,
    conversation: [{ role: "customer"|"staff", text, ts }],
    postContext?: { text, roomCodeGuess? }   // với comment
  }
  → {
    intent, extracted: { name?, phone?, area?, budgetMin?, budgetMax?,
                         peopleCount?, moveInDate?, requirements? },
    matchedRooms: [{ roomCode, price, area, highlights }],
    suggestions: [ "Dạ còn phòng ạ...", ... ],   // 1-3 gợi ý
    nextAction: ASK_INFO|SEND_MEDIA|ASK_PHONE|BOOK_VIEWING|HANDOFF,
    safety: { blocked: false, reasons: [] },
    customerStageHint
  }

POST   /ai/extract                // chỉ trích xuất, không sinh câu trả lời
POST   /ai/classify-comment       // phân loại nhanh 1 comment
```

### 6.3. Customers (CRM)
```
GET    /customers                 ?status=&assignedTo=&area=&q=&page=
POST   /customers                 // lưu lead (extension "Lưu khách")
GET    /customers/:id             // màn chi tiết: hội thoại, phòng đã tư vấn, care history
PATCH  /customers/:id             // đổi trạng thái, ghi chú, phân nhân viên
POST   /customers/:id/notes
POST   /customers/:id/assign      { staffId }
```

### 6.4. Rooms
```
GET    /rooms                     ?area=&status=&priceMax=&roomType=&q=
POST   /rooms                     // tạo thủ công
PATCH  /rooms/:id                 // đổi trạng thái Còn/Cọc/Thuê
POST   /rooms/match               { area, budgetMax, peopleCount, requirements } → [rooms]
```

### 6.5. Excel / Google Sheet
```
POST   /excel/import              (multipart .xlsx)  → { batchId, created, updated, errors[] }
POST   /sheets/sync               { spreadsheetId, range }  → tương tự
GET    /excel/template            // tải file mẫu đúng cấu trúc cột
GET    /import-batches            // lịch sử import
```

### 6.6. Appointments
```
GET    /appointments              ?date=&staffId=&status=
POST   /appointments              // tạo lịch hẹn (kèm push Telegram)
PATCH  /appointments/:id          // đổi trạng thái Đã đến/Hủy/Không đến
```

### 6.7. Care tasks
```
GET    /care-tasks                ?staffId=&status=&due=today
POST   /care-tasks                // tạo thủ công
PATCH  /care-tasks/:id            // done/snooze
POST   /care-tasks/:id/suggest    // AI gợi ý nội dung nhắn lại
```

### 6.8. Telegram
```
POST   /telegram/test             // gửi thử
GET    /telegram/config           / PATCH (admin)
```

### 6.9. Reports
```
GET    /reports/overview          // tổng khách mới, có SĐT, đã hẹn, đã chốt, tỷ lệ chốt
GET    /reports/by-staff
GET    /reports/by-area
GET    /reports/by-room
```

### 6.10. WebSocket (Socket.IO namespace `/rt`)
- `lead:new`, `appointment:new`, `care:due`, `room:low` → đẩy realtime lên dashboard.
- Extension emit `conversation:activity` (tuỳ chọn) để đồng bộ trạng thái.

---

## 7. Thiết kế AI Engine

AI Engine là một **pipeline nhiều bước**, phần lớn dùng LLM có kiểm soát, riêng bước lọc phòng là **logic thuần** (không để LLM tự bịa).

```
Input hội thoại
   │
   ▼
[1] IntentClassifier ──► CustomerIntent (structured output/tool-use)
   │
   ▼
[2] InfoExtractor ──► { name, phone, area, budget, people, moveInDate, requirements }
   │                    (regex SĐT + LLM cho phần còn lại; merge với dữ liệu khách đã có)
   ▼
[3] RoomMatcher (THUẦN LOGIC, không LLM) ──► top N phòng phù hợp từ DB
   │                    lọc theo area/budget/people/requirements/status=AVAILABLE
   ▼
[4] ReplyGenerator ──► 1-3 gợi ý câu trả lời
   │                    LLM CHỈ được dùng dữ liệu phòng ở bước [3] + template admin
   ▼
[5] SafetyGuard ──► kiểm tra: không bịa giá/địa chỉ, không hứa sai,
   │                 không lộ SĐT khách khác, độ dài hợp lý, không spam
   ▼
Output { intent, extracted, matchedRooms, suggestions, nextAction, safety }
```

### 7.1. IntentClassifier
- Dùng structured output (Claude tool-use / OpenAI function calling) trả về đúng một `CustomerIntent`.
- Có nhánh nhanh bằng regex/keyword trước khi gọi LLM cho các case rõ ràng (ví dụ tin nhắn chứa số điện thoại → `LEFT_PHONE`) để tiết kiệm chi phí.

### 7.2. InfoExtractor
- **SĐT:** regex Việt Nam trước tiên (`(0|\+84)(3|5|7|8|9)\d{8}`), chuẩn hoá về `0xxxxxxxxx`. Không phụ thuộc LLM cho SĐT để tránh sai số.
- **Khu vực / ngân sách / số người / ngày dọn / yêu cầu:** LLM trích xuất có schema. Ngân sách hiểu được "3tr5", "3-4 triệu", "dưới 4tr" → quy về `budgetMin/budgetMax` VND.
- Merge thông tin mới với thông tin khách đã lưu (không ghi đè bằng null).

### 7.3. RoomMatcher (không LLM — quan trọng để chống bịa)
- Truy vấn DB: `status = AVAILABLE`, `area` khớp, `price <= budgetMax`, `people_count` phù hợp, match `requirements` (gác, WC riêng, máy lạnh...).
- Xếp hạng theo độ khớp (đúng khu vực > sát ngân sách > đủ tiện ích). Trả top 3.
- Đây là **nguồn sự thật duy nhất** về phòng cho bước sinh câu trả lời.

### 7.4. ReplyGenerator
- System prompt khoá chặt (xem 7.6). Đưa vào: intent, thông tin khách, **danh sách phòng đã match** (chỉ những phòng này được phép nhắc), template admin cho intent tương ứng, giai đoạn khách.
- Sinh 1–3 phương án, giọng thân thiện, ngắn, luôn dẫn tới hành động kế tiếp (xin khu vực/ngân sách → xin SĐT → hẹn xem).

### 7.5. SafetyGuard
- Đối chiếu mọi con số giá/địa chỉ trong câu trả lời với `matchedRooms`. Nếu xuất hiện giá/địa chỉ không có trong dữ liệu → chặn, thay bằng câu hỏi lại an toàn.
- Chặn lộ thông tin khách khác, chặn nội dung quá dài, chặn gửi nhiều tin liên tục (rate-limit theo hội thoại).
- Ghi `activity_logs` mọi lần chặn.

### 7.6. System prompt mẫu cho ReplyGenerator (rút gọn)

```
Bạn là trợ lý soạn tin cho NHÂN VIÊN tư vấn thuê phòng trọ (không phải chatbot tự gửi).
QUY TẮC BẮT BUỘC:
- CHỈ dùng thông tin phòng trong khối DỮ LIỆU_PHÒNG dưới đây. Tuyệt đối không bịa
  giá, địa chỉ, tiện ích hay trạng thái phòng.
- Nếu dữ liệu không đủ để trả lời, hãy soạn câu HỎI LẠI khách (khu vực/ngân sách/
  số người) thay vì phỏng đoán.
- Giọng: thân thiện, xưng "em", gọi khách "anh/chị", ngắn gọn như nhân viên thật.
- Luôn hướng khách tới bước tiếp theo: xin nhu cầu → gửi ảnh → xin SĐT → hẹn xem.
- Không hứa chắc điều ngoài dữ liệu (giữ phòng, giảm giá) trừ khi có trong template.
- Tối đa 3–4 câu. Không spam nhiều tin.
Trả về JSON: { "suggestions": ["...", "..."], "nextAction": "ASK_PHONE" }

DỮ LIỆU_PHÒNG:
{{matchedRooms_json}}
GIAI_ĐOẠN_KHÁCH: {{stage}}
THÔNG_TIN_KHÁCH: {{extracted_json}}
LỊCH_SỬ_HỘI_THOẠI: {{conversation}}
```

### 7.7. Kịch bản chăm sóc theo giai đoạn
Mỗi `CustomerStatus` có template nhắc riêng (chưa trả lời sau khi hỏi info / đã xem ảnh chưa phản hồi / đã hẹn chưa đến / đang cân nhắc). Được cấu hình trong `reply_templates` và dùng bởi `care-tasks/:id/suggest`.

---

## 8. Chrome Extension (Manifest V3)

### 8.1. Thành phần
- **content-script**: chèn vào `facebook.com` & `messenger.com`. Đọc DOM hội thoại/comment đang hiển thị (qua selector cấu hình được, tải từ server để dễ vá khi FB đổi UI). Chèn các nút: *Gợi ý trả lời, Lưu khách, Gửi Telegram, Tạo lịch hẹn* và một **sidebar** hiển thị gợi ý + phòng phù hợp.
- **background service worker**: giữ phiên đăng nhập (JWT trong `chrome.storage`), gọi API, giữ kết nối WSS, quản lý rate-limit.
- **sidebar/popup (React)**: hiển thị gợi ý, thông tin khách trích xuất, danh sách phòng match, nút thao tác.

### 8.2. Selector cấu hình từ xa (chống rủi ro #1 — FB đổi UI)
- Extension không hard-code selector. Nó tải `GET /extension/selectors` (versioned) khi khởi động. Khi FB đổi giao diện, chỉ cần cập nhật selector trên server, không cần phát hành lại extension.

### 8.3. Cơ chế an toàn (chống rủi ro #2 — khoá nick)
- Mặc định **không tự gửi**. AI soạn → nhân viên bấm gửi.
- Chế độ "bán tự động" chỉ cho vài câu xã giao whitelisted, có **giới hạn tần suất** (ví dụ tối đa N tin/phút/hội thoại) và **log đầy đủ** vào `activity_logs`.
- Không đọc/không gửi cookie hay mật khẩu FB về server (yêu cầu bảo mật #16).

### 8.4. Luồng
```
content-script phát hiện hội thoại đang mở
  → thu thập text (đã ẩn dữ liệu nhạy cảm không cần thiết)
  → background POST /ai/suggest
  → sidebar render gợi ý + phòng
  → nhân viên chọn 1 gợi ý → (tuỳ chọn) chèn vào ô soạn tin → nhân viên tự bấm gửi FB
  → nếu có SĐT/hẹn: nhân viên bấm "Lưu khách"/"Tạo lịch hẹn" → POST /customers, /appointments
```

---

## 9. Dashboard (Next.js)

Các màn hình (theo mục 7.10 mô tả gốc):

- **Đăng nhập** (JWT).
- **Danh sách khách** — bảng lọc theo trạng thái/nhân viên/khu vực + tìm kiếm; badge trạng thái.
- **Chi tiết khách** — lịch sử hội thoại, phòng đã tư vấn, media đã gửi, lịch sử chăm sóc, lịch hẹn, kết quả chốt/không chốt.
- **Danh sách & chi tiết phòng** — trạng thái, giá, khu vực, tiện ích, số khách hỏi/hẹn/chốt.
- **Lịch hẹn** — lịch theo ngày, người đón, trạng thái.
- **Chăm sóc** — hàng đợi task đến hạn hôm nay + gợi ý nội dung nhắn lại.
- **Báo cáo** — tổng khách mới, có SĐT, đã hẹn, đã chốt, tỷ lệ chốt, top nhân viên, top khu vực, top phòng.
- **Cấu hình (admin)** — import Excel/Sheet, quản lý nhân viên & nick FB, Telegram, template câu trả lời, selector extension.

Phân quyền theo `UserRole`: Admin thấy tất cả; Manager xem báo cáo/phân khách/theo dõi; Staff chỉ thấy khách được phân.

---

## 10. Telegram Bot

Sự kiện đẩy thông báo (mục 7.9 gốc): **khách để lại SĐT**, **khách hẹn xem phòng**, **cần gọi gấp**, **báo cáo cuối ngày**, **phòng sắp hết**, **nhắc chăm sóc**.

- Dùng BullMQ queue `telegram-dispatch` để gửi bất đồng bộ, có retry.
- Mỗi thông báo lưu vào `telegram_notifications` (idempotent — không gửi trùng cùng một lead-event).
- Định dạng tin nhắn theo đúng các mẫu trong mô tả (tên, SĐT, nhu cầu, nguồn nick, nhân viên, giờ, ghi chú).
- Báo cáo cuối ngày: cron 20:00 (giờ VN) → tổng hợp `/reports/overview` gửi nhóm quản lý.

---

## 11. Nhập dữ liệu phòng từ Excel / Google Sheet

- **Cấu trúc cột chuẩn** (theo mô tả): mã phòng, khu vực, địa chỉ, giá, cọc, diện tích, số người, loại phòng, WC, nội thất, điện, nước, giờ giấc, xe, thú cưng, trạng thái, link ảnh, link video, người phụ trách, ghi chú. File mẫu tải ở `GET /excel/template`.
- **Excel:** upload `.xlsx` → parse bằng SheetJS → validate từng dòng → upsert theo `room_code` → trả `{ created, updated, errors[] }`. Lưu `import_batches` để đối soát/rollback.
- **Google Sheet:** dùng Sheets API v4 (service account, chia sẻ quyền đọc sheet). Có thể đồng bộ định kỳ (cron) hoặc bấm "Sync".
- **Chuẩn hoá dữ liệu:** giá "3.500.000"/"3tr5" → `Int` VND; trạng thái "Còn/Đã cọc/Đã thuê" → enum `RoomStatus`; tiện ích tách thành mảng chuẩn để RoomMatcher lọc.
- **Chống rủi ro #3 (dữ liệu sai):** bắt buộc cột `status`; AI không tư vấn phòng `RENTED`; cảnh báo khi thiếu cột quan trọng.

---

## 12. Bảo mật (theo mục 16 mô tả)

- **Không** lưu mật khẩu Facebook, **không** yêu cầu cookie/token FB gửi lên server.
- JWT access (ngắn hạn) + refresh (dài hạn, revoke được). Mật khẩu bcrypt.
- RBAC theo `UserRole`; guard ở cả route và field-level cho dữ liệu khách.
- Mã hoá dữ liệu nhạy cảm khi lưu (SĐT có thể mã hoá ở tầng ứng dụng / hoặc dùng column encryption); TLS toàn tuyến.
- `activity_logs` ghi mọi thao tác (gửi tin bán tự động, xuất dữ liệu, đổi trạng thái) phục vụ audit.
- Rate-limit API và giới hạn tần suất gửi tin ở extension.
- Không gửi thông tin khách cho người không có quyền; SafetyGuard chặn lộ SĐT khách khác trong gợi ý.
- Secrets qua biến môi trường / secret manager, không commit `.env`.

---

## 13. Lộ trình triển khai (4 giai đoạn) + Checklist code

### Giai đoạn 1 — MVP (dùng được cho đội sale nhỏ)
**Mục tiêu:** đọc hội thoại → AI gợi ý → lưu khách → trích SĐT → đẩy Telegram.

Checklist:
- [ ] Monorepo + docker-compose (Postgres, Redis, MinIO) chạy được.
- [ ] Prisma schema + migration cho: users, facebook_profiles, customers, rooms, conversations, messages, telegram_notifications, activity_logs.
- [ ] Auth (login/refresh, RBAC cơ bản).
- [ ] Excel import + file mẫu + màn danh sách phòng (dashboard).
- [x] `LlmProvider` (Claude + OpenAI, structured outputs) + IntentClassifier + InfoExtractor (SĐT regex) + RoomMatcher + ReplyGenerator + SafetyGuard.
- [x] Auth guard toàn cục (mặc định mọi route cần JWT, opt-out bằng `@Public()`).
- [x] Unit test cho SafetyGuard / InfoExtractor / Excel parser (53 test).
- [ ] `POST /ai/suggest` chạy end-to-end với DB thật + API key thật.
- [ ] Extension MV3: đọc hội thoại đang mở, sidebar hiển thị gợi ý + phòng, nút "Lưu khách".
- [ ] Lưu lead + `POST /customers`.
- [ ] Telegram: sự kiện "khách để lại SĐT".
- [ ] Seed dữ liệu mẫu + hướng dẫn chạy.

### Giai đoạn 2 — CRM & chăm sóc khách
- [ ] Đầy đủ trạng thái khách + màn chi tiết khách (hội thoại, phòng đã tư vấn, care history).
- [ ] Appointments (tạo lịch + Telegram "khách hẹn xem phòng").
- [ ] care_tasks + hàng đợi nhắc chăm sóc + gợi ý nội dung nhắn lại.
- [ ] Phân lead cho nhân viên; quản lý nhiều nick FB.
- [ ] Báo cáo lead cơ bản (overview, by-staff).
- [ ] Xử lý comment (phân loại + gợi ý cạnh comment).

### Giai đoạn 3 — Tối ưu AI tư vấn
- [ ] RoomMatcher nâng cao (chấm điểm khớp, gợi ý thay thế).
- [ ] Nhận diện "độ nóng" của khách (lead scoring) + cảnh báo khả năng chốt cao.
- [ ] Kịch bản chốt theo giai đoạn; báo cáo cuối ngày tự động qua Telegram.
- [ ] A/B template câu trả lời; đánh giá chất lượng gợi ý.

### Giai đoạn 4 — Tích hợp kênh chính thức
- [ ] Facebook Page API, Zalo OA, website chat, Instagram.
- [ ] Google Calendar cho lịch hẹn.
- [ ] Tổng đài gọi điện (nếu cần).

---

## 14. Quy ước kỹ thuật

- **Code style:** ESLint + Prettier chung toàn monorepo; commit theo Conventional Commits.
- **Kiểm thử:** service AI có unit test cho SafetyGuard/RoomMatcher/InfoExtractor (đây là phần dễ sai nhất). E2E cho `/ai/suggest` và `/excel/import`. Playwright cho luồng dashboard chính.
- **CI:** lint → typecheck → test → build (Turborepo cache).
- **Migration:** Prisma migrate; không sửa DB tay ở prod.
- **Cấu hình:** mọi biến qua `.env` (mẫu ở `.env.example`).
- **Deploy:** Docker images cho backend & dashboard; Nginx reverse proxy + TLS; MinIO/S3 cho ảnh; backup Postgres định kỳ.

---

## 15. Rủi ro & giảm thiểu (tóm tắt)

| Rủi ro | Giảm thiểu (đã đưa vào kiến trúc) |
|---|---|
| FB đổi giao diện | Selector cấu hình từ xa; logic AI ở server; extension là lớp mỏng |
| Nick bị hạn chế | Không auto-gửi hàng loạt; human-in-the-loop; rate-limit; cá nhân hoá; log |
| Dữ liệu phòng sai | Bắt buộc cột `status`; không tư vấn phòng đã thuê; import có validate + batch |
| AI trả lời sai/bịa | RoomMatcher thuần logic là nguồn sự thật; SafetyGuard đối chiếu; nhân viên duyệt |
| Lộ dữ liệu khách | RBAC + mã hoá + SafetyGuard chặn lộ SĐT khách khác + activity log |

---

## 16. Bước tiếp theo ngay

1. Cài đặt: `pnpm install` tại thư mục gốc.
2. Copy `.env.example` → `.env`, điền `ANTHROPIC_API_KEY`, `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`.
3. `docker compose up -d postgres redis minio` → `pnpm --filter backend prisma migrate dev` → `pnpm --filter backend seed`.
4. `pnpm dev` (chạy backend + dashboard). Build extension: `pnpm --filter extension build` rồi load `apps/extension/dist` vào Chrome (chế độ Developer).
5. Bắt đầu tick checklist Giai đoạn 1.

> Bộ scaffold đi kèm đã tạo sẵn khung thư mục, `schema.prisma`, các module NestJS, khung extension và dashboard để đội bắt tay vào code ngay.
