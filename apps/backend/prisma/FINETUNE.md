# Fine-tune model từ dữ liệu học (gold pair)

Tài liệu này hướng dẫn biến **kho gold pair** (câu tư vấn THẬT của chủ trọ) thành
một model đã fine-tune, rồi cắm lại vào backend qua chuỗi tầng LLM.

> ⚠️ **PII:** các file `apps/backend/exports/*.jsonl` chứa tin nhắn KHÁCH THẬT
> (tên, có thể lẫn SĐT). Đã `.gitignore`. **KHÔNG commit, KHÔNG upload lên dịch
> vụ không tin cậy.** Chỉ dùng nền fine-tune bạn kiểm soát / tin tưởng.

## 1. Chuẩn bị dữ liệu

```bash
pnpm --filter @cba/backend export:finetune   # -> exports/finetune-YYYY-MM-DD.jsonl
pnpm --filter @cba/backend split:finetune     # -> exports/train.jsonl + val.jsonl (90/10)
```

- `export:finetune` gộp 2 nguồn: (a) cặp AI_SUGGEST→AI_SEND từ dùng thật, (b) gold
  pair nhập từ Facebook (`source=fb_history_import`), đã **lọc nhiễu** bằng
  `isUsableGoldReply` (bỏ tuyển dụng/chat cá nhân). Hiện có ~**536 cặp đạt**.
- Mỗi dòng có khối `messages` dạng chat: `user` = lượt khách, `assistant` = lượt
  chủ trọ; **câu `assistant` CUỐI là đích học**.

**Quan trọng — căn khớp lúc chạy:** khi train nên **chèn system prompt** giống lúc
suggest để model học đúng vai. Lấy từ `src/modules/ai/prompts.ts`
(`CONSTRAINED_REPLY_SYSTEM` — chế độ "chỉ diễn đạt"). Tiền xử lý: thêm
`{ role: "system", content: <CONSTRAINED_REPLY_SYSTEM> }` vào đầu mỗi `messages`.

## 2. Dữ liệu nhỏ → dùng LoRA

~536 cặp là **ít**. Đừng full-fine-tune (dễ overfit + quên kiến thức nền). Dùng:
- **LoRA/QLoRA**, 1–3 epoch, learning rate thấp (~1e-4), theo dõi loss trên `val.jsonl`.
- Giữ nhiệm vụ hẹp: chỉ dạy **giọng văn + cách tư vấn**, KHÔNG dạy số liệu phòng
  (số liệu vẫn do CODE + SafetyGuard lo lúc chạy).

## 3. Hai đường fine-tune

### A) Model mở tại chỗ (khuyến nghị — khớp hạ tầng hiện có)
Fine-tune một model mở nhỏ rồi phục vụ bằng **Ollama** (đã là tầng dự phòng FB4).

1. Chọn base: `Qwen2.5-3B/7B-Instruct` hoặc `Llama-3.1-8B-Instruct`.
2. Train LoRA bằng **Unsloth** (nhanh, ít VRAM) hoặc **Axolotl**:
   - Định dạng dữ liệu: chat JSONL ở trên (đã chuẩn cho cả hai).
   - Xuất **GGUF** (q4_k_m) sau khi merge LoRA.
3. Nạp vào Ollama:
   ```bash
   # Modelfile:  FROM ./chatboss-tuned.gguf
   ollama create chatboss-tuned -f Modelfile
   ```
4. Trỏ backend sang model đã tune (một tầng trong `.env`), ví dụ đặt làm tầng chính
   hoặc thêm tầng:
   ```env
   OPENAI_BASE_URL=http://localhost:11434/v1
   OPENAI_MODEL=chatboss-tuned
   # OPENAI_API_KEY để trống (local không cần)
   ```

### B) Google Gemini supervised tuning (nếu dùng tầng Gemini)
Tầng FB2 đang dùng `gemini-2.0-flash`. Google hỗ trợ **supervised tuning** cho một
số bản Gemini:
1. Upload `train.jsonl`/`val.jsonl` (chuyển sang định dạng tuning của Google AI
   Studio / Vertex — cặp input→output).
2. Tạo tuned model, lấy tên model đã tune.
3. Đặt `OPENAI_FB2_MODEL=<tuned-model>` (endpoint OpenAI-compat của Gemini).

## 4. Đánh giá trước khi thay thật

- So trên `val.jsonl`: model tune vs model gốc — câu có tự nhiên/đúng giọng hơn?
- Chạy vài ca thật qua `/ai/suggest` (SafetyGuard vẫn bật) để chắc **không bịa số
  liệu** — nếu model tune bắt đầu chế giá/phòng, giảm epoch hoặc siết dữ liệu.
- Chỉ khi đạt mới trỏ tầng chính sang model tune; giữ model gốc làm tầng dự phòng.

## 5. Ghi chú
- Muốn thêm dữ liệu: nhân viên dùng extension bấm "Gợi ý" rồi gửi → sinh cặp
  AI_SEND thật (quý hơn lịch sử FB vì có cả câu AI gợi ý để so). Chạy lại
  `export:finetune` để gộp.
- `reasoning_effort` chỉ áp cho model *reasoning* (gpt-oss); model tune mở thường
  KHÔNG cần — bỏ trống `*_REASONING_EFFORT` cho tầng đó.
