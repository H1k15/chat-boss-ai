import { DEFAULT_SELECTORS, FbSelectors } from './selectors';
import type { ConversationTurn } from '@cba/shared';

// Đọc nội dung hội thoại đang HIỂN THỊ trên màn hình (không quét ẩn, không tự thao tác).
// Đây là lớp mỏng — chỉ đọc DOM, mọi phân tích do server làm.
export function readConversation(
  selectors: FbSelectors = DEFAULT_SELECTORS,
): ConversationTurn[] {
  const thread = document.querySelector(selectors.messengerThread);
  if (!thread) return [];

  const rows = Array.from(thread.querySelectorAll(selectors.messageRow));
  const turns: ConversationTurn[] = [];

  for (const row of rows) {
    const textEl = row.querySelector(selectors.messageText);
    const text = textEl?.textContent?.trim();
    if (!text) continue;

    // Heuristic phân biệt khách/nhân viên: tin của mình thường căn phải.
    // Đây là ví dụ — cần tinh chỉnh theo DOM thực tế.
    const isStaff = isRightAligned(row as HTMLElement);
    turns.push({ role: isStaff ? 'staff' : 'customer', text });
  }
  return turns.slice(-20); // chỉ lấy 20 lượt gần nhất
}

function isRightAligned(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  return (
    style.justifyContent === 'flex-end' ||
    style.textAlign === 'right' ||
    el.classList.contains('outgoing')
  );
}

// Chèn gợi ý đã được nhân viên chọn vào ô soạn tin (KHÔNG tự bấm gửi).
export function insertIntoComposer(
  text: string,
  selectors: FbSelectors = DEFAULT_SELECTORS,
): boolean {
  const composer = document.querySelector<HTMLElement>(selectors.composer);
  if (!composer) return false;
  composer.focus();
  document.execCommand('insertText', false, text);
  return true;
}
