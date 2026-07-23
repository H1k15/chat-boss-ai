# Hướng dẫn test từng chức năng

Sau khi đã chạy (`pnpm dev` — xem [`HUONG-DAN-CHAY.md`](HUONG-DAN-CHAY.md)),
tài liệu này hướng dẫn test lần lượt từng chức năng.

## Cấu hình để test "như thật" không cần key ngoài

`.env` đã được đặt sẵn để test miễn phí:
- **AI = Ollama local** (`qwen2.5:3b`) — không cần API key, chạy trên máy.
- **Telegram để trống** — hệ thống bỏ qua gửi thông báo, không lỗi.
- **Postgres/Redis/MinIO** — chạy trong Docker.

> AI local **chậm** (mỗi câu vài chục giây trên máy không GPU) và model nhỏ nên
> có thể trả lời chưa chuẩn. Đây là để test luồng chạy, không phải chất lượng
> cuối. Muốn nhanh/chuẩn: đổi `AI_PROVIDER=claude` + key thật.

Mọi thứ dưới đây test tại dashboard: **http://localhost:3005** (dev), đăng nhập
`admin@chatboss.ai` / `admin123`.

---

## A. Chức năng test được ngay qua dashboard (không cần AI)

### 1. Đăng nhập + bảo vệ route
- Mở http://localhost:3005 → tự chuyển sang `/login`.
- Đăng nhập sai mật khẩu → báo "Đăng nhập thất bại".
- Đăng nhập đúng (`admin` / `admin123`) → vào trang Tổng quan.
- Thử mở thẳng http://localhost:3005/templates khi chưa đăng nhập → bị đá về login.
- Bấm **Đăng xuất** (góc dưới menu) → về login.

### 2. Quản lý mẫu câu AI (màn "Mẫu câu AI")
- Thấy 14 mẫu seed sẵn, nhóm theo ý định.
- **Thêm mẫu:** chọn ý định `ASK_PRICE`, nhập nhãn + nội dung
  `Dạ phòng này giá {{gia}}/tháng anh nhé` → **Thêm mẫu** → xuất hiện trong danh sách.
- Đếm ký tự đỏ khi vượt 200.
- Bấm **Đang bật/Đã tắt** để bật/tắt một mẫu.
- Bấm **Xoá** → xác nhận → mẫu biến mất.
- Đây là **việc quan trọng nhất**: điền mẫu cho 4 ý định cốt lõi (ASK_PRICE,
  ASK_AVAILABILITY, ASK_ADDRESS, WANT_VIEWING).

### 3. Nhập phòng từ Excel (màn "Nhập phòng")
- Bấm **⬇ Tải file mẫu** → tải `mau-phong.xlsx`.
- Mở file, sửa/thêm vài dòng phòng (giữ nguyên hàng tiêu đề), lưu lại.
- Bấm **⬆ Tải lên file .xlsx** → chọn file → thấy kết quả (thêm mới / cập nhật /
  lỗi từng dòng) và **Lịch sử nhập** cập nhật.
- Thử file sai (thiếu cột Mã phòng) → báo cột thiếu.

### 4. Xem dữ liệu
- **Khách hàng / Phòng trọ / Lịch hẹn** → bảng danh sách (có dữ liệu seed).
- **Báo cáo** → số liệu tổng quan.

### 5. Cấu hình Telegram (màn "Cấu hình")
- Thấy trạng thái bot (đang là "Chưa có token" vì để trống — đúng khi test).
- Tắt/bật các sự kiện, đổi Chat ID → **Lưu cấu hình** → tải lại trang thấy vẫn lưu.
- (Để gửi thật cần điền token Bot + chat ID — xem HUONG-DAN-CHAY.md mục 4.)

---

## B. Chức năng AI (chạy được với Ollama, nhưng CHẬM)

Dashboard chưa có nút gọi AI trực tiếp (AI được gọi từ extension khi tư vấn).
Để test AI ngay, dùng lệnh `curl`. Lấy token trước:

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@chatboss.ai","password":"admin123"}' \
  | node -pe "JSON.parse(require('fs').readFileSync(0)).accessToken")
```

> ⚠️ Trên Windows, gõ tiếng Việt thẳng vào `curl -d` bị lỗi font. Ghi nội dung
> ra file `.json` (UTF-8) rồi dùng `--data-binary @file.json`.

### 6. AI gợi ý trả lời (`POST /ai/suggest`) — luồng lõi
Tạo file `test.json`:
```json
{"facebookProfileId":"unknown","channel":"INBOX",
 "conversation":[{"role":"customer","text":"phòng còn không shop giá bao nhiêu"}]}
```
```bash
curl -X POST http://localhost:3001/api/v1/ai/suggest \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json; charset=utf-8' \
  --data-binary @test.json
```
Chờ ~30-60s (model local). Kết quả: `intent`, `extracted`, `matchedRooms`,
`suggestions` (1-3 câu gợi ý), `safety`. SafetyGuard đã chặn câu bịa giá/SĐT.

### 7. AI trích xuất / phân loại comment
```bash
# Phân loại 1 comment (nhanh, có đường tắt regex)
echo '{"text":"phòng này giá bao nhiêu"}' > cls.json
curl -X POST http://localhost:3001/api/v1/ai/classify-comment \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  --data-binary @cls.json
# -> {"intent":"ASK_PRICE"}
```

### 8. Lọc phòng (`POST /rooms/match`) — không dùng AI, nhanh
```bash
echo '{"area":"Gò Vấp","budgetMax":4200000}' > match.json
curl -X POST http://localhost:3001/api/v1/rooms/match \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json; charset=utf-8' \
  --data-binary @match.json
# -> danh sách phòng khớp kèm điểm
```

### 9. AI gợi ý nhắn chăm sóc (`POST /care-tasks/:id/suggest`)
Cần có một care task trong DB (tạo qua `POST /care-tasks`). Rồi:
```bash
curl -X POST http://localhost:3001/api/v1/care-tasks/<ID>/suggest \
  -H "Authorization: Bearer $TOKEN"
```

---

## C. Chức năng cần cấu hình thêm mới test được

| Chức năng | Cần gì |
|---|---|
| **Extension Chrome** | `pnpm --filter @cba/extension build` rồi load `apps/extension/dist`. Selector Facebook là mẫu — cần tinh chỉnh với DOM thật. |
| **Telegram thông báo thật** | Token bot (@BotFather) + chat ID trong `.env`. Xem HUONG-DAN-CHAY.md mục 4. |
| **Google Sheets sync** | Service account + chia sẻ Sheet. Xem [`HUONG-DAN-GOOGLE-SHEETS.md`](HUONG-DAN-GOOGLE-SHEETS.md). |

---

## Bảng tóm tắt: test được ngay hay cần thêm

| Chức năng | Test ngay? |
|---|---|
| Đăng nhập, bảo vệ route | ✅ |
| Quản lý mẫu câu | ✅ |
| Nhập Excel | ✅ |
| Xem khách/phòng/lịch/báo cáo | ✅ |
| Cấu hình Telegram (lưu) | ✅ |
| AI suggest / extract / classify | ✅ (Ollama, chậm) |
| Lọc phòng | ✅ |
| Care task suggest | ✅ (Ollama, chậm) |
| Gửi Telegram thật | ⚙️ cần token |
| Extension trên Facebook | ⚙️ cần build + selector thật |
| Google Sheets sync | ⚙️ cần service account |
