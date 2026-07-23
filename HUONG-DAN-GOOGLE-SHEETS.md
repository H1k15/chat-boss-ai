# Hướng dẫn setup Google Sheets (đồng bộ phòng)

Cho phép đồng bộ danh sách phòng từ một Google Sheet online qua endpoint
`POST /sheets/sync`, thay vì tải file Excel lên. Dữ liệu đi qua **cùng pipeline
chuẩn hoá/upsert** với import Excel — cùng cấu trúc cột, cùng ràng buộc.

> **Có thật sự cần không?** Nếu đội bạn quản phòng bằng file Excel thì
> `POST /excel/import` (màn "Nhập phòng" trên dashboard) đã đủ. Google Sheets chỉ
> hơn ở chỗ nhiều người sửa chung online rồi bấm đồng bộ. Setup dưới đây cần làm
> trên Google Cloud Console (~10 phút, một lần).

---

## Tổng quan luồng xác thực

Hệ thống dùng **Service Account** — một "tài khoản máy" của Google. Bạn:
1. Tạo service account trên Google Cloud → nó có một **email** dạng
   `ten@project.iam.gserviceaccount.com` và một **file key JSON**.
2. **Chia sẻ Google Sheet** cho email đó (như chia sẻ cho một người, quyền Xem).
3. Backend dùng file key để đọc Sheet.

> Quan trọng: backend chỉ cần quyền **đọc** (`spreadsheets.readonly`). Không cần
> cấp "role" IAM gì cho service account — chỉ cần **share Sheet** cho email của
> nó, y như share cho một đồng nghiệp.

---

## Bước 1 — Tạo Google Cloud project

1. Vào https://console.cloud.google.com
2. Trên thanh trên cùng, bấm dropdown chọn project → **New Project**
3. Đặt tên (ví dụ `chat-boss-ai`) → **Create**
4. Đợi tạo xong, chọn project đó.

## Bước 2 — Bật Google Sheets API

1. Menu trái → **APIs & Services** → **Library**
2. Tìm **"Google Sheets API"** → bấm vào → **Enable**

## Bước 3 — Tạo Service Account

1. **APIs & Services** → **Credentials**
2. **Create Credentials** → **Service account**
3. Đặt tên (ví dụ `sheet-reader`) → **Create and Continue**
4. Phần "Grant this service account access" — **bỏ qua** (Continue), vì ta cấp
   quyền bằng cách share Sheet, không dùng IAM role.
5. **Done**.

## Bước 4 — Tạo và tải file key JSON

1. Trong danh sách Credentials, bấm vào service account vừa tạo.
2. Tab **Keys** → **Add Key** → **Create new key** → chọn **JSON** → **Create**.
3. File `.json` tự tải về máy. **Giữ kỹ — đây là secret, ai có file này đọc được
   mọi Sheet đã share cho service account.**

## Bước 5 — Đặt file key vào dự án

Tạo thư mục `secrets/` ở gốc repo (đã được `.gitignore`, không lên Git) và đặt
file key vào đó:

```
C:\Hệ thống AI hỗ trợ tư vấn\secrets\gsheet-service-account.json
```

> Cách khác: mở file JSON, copy toàn bộ nội dung, dán thẳng vào biến môi trường
> (xem Bước 9). Backend nhận cả hai kiểu.

## Bước 6 — Chia sẻ Google Sheet cho service account

1. Mở file JSON key, tìm dòng `"client_email"` — ví dụ
   `sheet-reader@chat-boss-ai.iam.gserviceaccount.com`.
2. Mở Google Sheet chứa danh sách phòng → bấm **Share** (Chia sẻ).
3. Dán email service account vào, chọn quyền **Viewer** (Người xem) → **Send**.

> Không share thì backend báo lỗi không đọc được Sheet, dù key đúng.

## Bước 7 — Chuẩn bị cấu trúc cột trong Sheet

Dòng đầu tiên phải là **tiêu đề cột**. Bốn cột **bắt buộc**:

| Cột bắt buộc | Tên header (dùng được nhiều cách viết) |
|---|---|
| Mã phòng | `Mã phòng`, `Mã`, `Room code`... |
| Khu vực | `Khu vực`, `Quận`, `Area`... |
| Giá | `Giá`, `Giá thuê`, `Price`... |
| Trạng thái | `Trạng thái`, `Tình trạng`, `Status`... |

Các cột khác (Cọc, Diện tích, Loại phòng, Nội thất, WC, Giờ giấc...) là tuỳ chọn.
**Cách chắc chắn nhất:** tải file mẫu ở màn "Nhập phòng" trên dashboard, xem đúng
tên cột rồi tạo Sheet giống vậy.

## Bước 8 — Lấy Spreadsheet ID

Từ URL của Sheet:
```
https://docs.google.com/spreadsheets/d/1AbC...XyZ/edit#gid=0
                                        └──── ID ────┘
```
`spreadsheetId` là đoạn giữa `/d/` và `/edit`.

## Bước 9 — Cấu hình `.env`

Trong file `.env` ở gốc repo (khối GOOGLE SHEETS):

```
# Đường dẫn tới file key (khuyên dùng):
GOOGLE_SERVICE_ACCOUNT_JSON=./secrets/gsheet-service-account.json
```

Hoặc dán thẳng nội dung JSON (một dòng):
```
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...",...}
```

Rồi **khởi động lại backend** để nạp cấu hình mới:
```bash
# nếu chạy dev: dừng pnpm dev rồi chạy lại
# nếu chạy Docker:
DASHBOARD_PORT=3002 DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0 \
  docker compose --profile full up -d backend
```

> Nếu để Docker đọc file key, nhớ file phải nằm trong build context (thư mục
> `secrets/` ở gốc repo là được, vì Dockerfile copy từ gốc).

## Bước 10 — Chạy đồng bộ

Cần token admin (đăng nhập trước). Gọi endpoint:

```bash
# Lấy token
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@chatboss.ai","password":"admin123"}' \
  | node -pe "JSON.parse(require('fs').readFileSync(0)).accessToken")

# Đồng bộ (đổi SPREADSHEET_ID; range mặc định A1:Z10000)
curl -X POST http://localhost:3001/api/v1/sheets/sync \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"spreadsheetId":"1AbC...XyZ","range":"A1:Z10000"}'
```

Kết quả trả về giống import Excel:
```json
{ "batchId": "...", "created": 5, "updated": 2, "errors": [], "missingColumns": [] }
```

> Hiện `sheets/sync` gọi qua API/curl (dashboard chưa có nút bấm cho nó). Có thể
> bổ sung nút "Đồng bộ Google Sheet" vào màn "Nhập phòng" nếu cần.

---

## Lỗi thường gặp

| Lỗi | Nguyên nhân |
|---|---|
| `503 Chưa có file key... tại "./secrets/..."` | File key chưa có ở đường dẫn, hoặc `.env` chưa trỏ đúng. |
| `503 GOOGLE_SERVICE_ACCOUNT_JSON không phải JSON hợp lệ` | Dán JSON bị lỗi (thiếu ngoặc, xuống dòng). |
| `The caller does not have permission` | Chưa share Sheet cho email service account (Bước 6). |
| `Unable to parse range` | Sai tên sheet/range. Dùng `A1:Z10000` hoặc `TênSheet!A1:Z10000`. |
| `Requested entity was not found` | Sai `spreadsheetId`. |
| Kết quả `missingColumns` có cột | Sheet thiếu cột bắt buộc (Mã phòng/Khu vực/Giá/Trạng thái). |

---

## Bảo mật

- File key JSON là **secret** — để trong `secrets/` (đã gitignore), không commit,
  không gửi qua chat.
- Chỉ share Sheet ở quyền **Viewer** (backend chỉ cần đọc).
- Nếu lộ key: vào Google Cloud → service account → Keys → xoá key cũ, tạo key mới.
