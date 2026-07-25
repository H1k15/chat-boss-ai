import { DEFAULT_SELECTORS, FbSelectors } from './selectors';
import type { ConversationTurn } from '@cba/shared';

// Đọc nội dung hội thoại đang HIỂN THỊ trên màn hình (không quét ẩn, không tự thao tác).
// Đây là lớp mỏng — chỉ đọc DOM, mọi phân tích do server làm.
export function readConversation(
  selectors: FbSelectors = DEFAULT_SELECTORS,
): ConversationTurn[] {
  for (const thread of findThreadContainers(selectors)) {
    const turns = readTurns(thread, selectors);
    if (turns.length) return turns.slice(-20); // chỉ lấy 20 lượt gần nhất
  }
  return [];
}

// Thử lần lượt từng selector; trong mỗi selector, duyệt các phần tử theo thứ tự
// ngược DOM để ưu tiên cửa sổ chat popup mở sau cùng (nằm cuối trang).
function findThreadContainers(selectors: FbSelectors): Element[] {
  const containers: Element[] = [];
  for (const sel of selectors.messengerThread.split(',')) {
    const found = Array.from(document.querySelectorAll(sel.trim()));
    containers.push(...found.reverse());
  }
  return containers;
}

function readTurns(thread: Element, selectors: FbSelectors): ConversationTurn[] {
  const rows = Array.from(thread.querySelectorAll(selectors.messageRow));
  const turns: ConversationTurn[] = [];

  for (const row of rows) {
    const textEl = row.querySelector(selectors.messageText);
    const text = textEl?.textContent?.trim();
    if (!text || isMetaText(text)) continue;

    // Heuristic phân biệt khách/nhân viên: tin của mình thường căn phải.
    // Đây là ví dụ — cần tinh chỉnh theo DOM thực tế.
    const isStaff = isRightAligned(row as HTMLElement);
    turns.push({ role: isStaff ? 'staff' : 'customer', text });
  }
  return turns;
}

// Bỏ các dòng không phải tin nhắn: mốc thời gian (08:38, 09:40) và
// thông báo mã hoá đầu cuối của Facebook.
function isMetaText(text: string): boolean {
  return (
    /^\d{1,2}:\d{2}$/.test(text) ||
    text.includes('mã hóa đầu cuối') ||
    text.includes('end-to-end encrypted')
  );
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
