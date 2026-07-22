import { aiFeedback } from '../api';
import { DEFAULT_SELECTORS } from './selectors';

// Ghép câu nhân viên thực sự gửi với lần AI đề xuất (suggestionLogId), để gom
// dữ liệu "AI gợi ý -> người gửi" phục vụ fine-tune sau này.
//
// Trạng thái gợi ý đang hoạt động: đặt khi render gợi ý mới, cập nhật khi nhân
// viên chèn một gợi ý, đọc khi nhân viên bấm gửi.
let active: {
  logId: string;
  suggestions: string[];
  insertedIndex?: number;
} | null = null;

export function setActiveSuggestion(
  logId: string | undefined,
  suggestions: string[],
): void {
  // Không có logId (backend ghi log hụt) thì không ghép được -> bỏ qua.
  active = logId ? { logId, suggestions } : null;
}

export function markInserted(index: number): void {
  if (active) active.insertedIndex = index;
}

// Nhân viên gửi tin: đọc câu cuối trong ô soạn, so với gợi ý để biết có sửa
// không, rồi báo backend. Mỗi lần gợi ý chỉ ghi một lần.
function onSend(finalText: string): void {
  const text = finalText.trim();
  if (!active || !text) return;

  const idx = active.insertedIndex;
  const chosen = idx != null ? active.suggestions[idx] : undefined;
  // Chèn gợi ý rồi gửi y nguyên -> edited=false. Chèn rồi sửa, hoặc tự gõ câu
  // khác (không chèn gợi ý nào) -> edited=true.
  const edited = chosen != null ? text !== chosen.trim() : true;

  void aiFeedback({
    suggestionLogId: active.logId,
    finalText: text,
    chosenIndex: idx,
    edited,
  });
  active = null; // đã ghi cho lần gợi ý này
}

// Lắng nghe phím gửi trong ô soạn. Trên Messenger: Enter = gửi, Shift+Enter =
// xuống dòng. Dùng capture để chạy TRƯỚC handler của Facebook, đọc được text
// trước khi ô soạn bị xoá.
//
// LƯU Ý: đây là heuristic theo hành vi Messenger hiện tại — cần đối chiếu DOM
// thực tế khi triển khai, giống các selector trong selectors.ts.
export function installSendWatcher(): void {
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      const el = e.target as HTMLElement | null;
      if (!el || !el.matches(DEFAULT_SELECTORS.composer)) return;
      onSend(el.textContent ?? '');
    },
    true,
  );
}
