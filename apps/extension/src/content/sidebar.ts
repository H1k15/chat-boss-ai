import type { AiSuggestResponse } from '@cba/shared';
import { insertIntoComposer } from './reader';

// Sidebar hiển thị gợi ý AI + phòng phù hợp + nút thao tác.
// Nhân viên chọn gợi ý -> chèn vào ô soạn -> tự bấm gửi (human-in-the-loop).
let root: HTMLElement | null = null;

export function mountSidebar(): HTMLElement {
  if (root) return root;
  root = document.createElement('div');
  root.id = 'cba-sidebar';
  root.innerHTML = `
    <div class="cba-header">
      <span>🏠 Chat Boss AI</span>
      <button id="cba-refresh" title="Lấy gợi ý">Gợi ý trả lời</button>
    </div>
    <div id="cba-body" class="cba-body">
      <div class="cba-hint">Mở một hội thoại rồi bấm "Gợi ý trả lời".</div>
    </div>
    <div class="cba-actions">
      <button id="cba-save">Lưu khách</button>
      <button id="cba-appoint">Tạo lịch hẹn</button>
    </div>`;
  document.body.appendChild(root);
  return root;
}

export function renderSuggestions(res: AiSuggestResponse) {
  const body = document.getElementById('cba-body');
  if (!body) return;

  const rooms = res.matchedRooms
    .map(
      (r) =>
        `<li><b>${r.roomCode}</b> · ${r.area} · ${(r.price / 1_000_000).toFixed(1)}tr — ${r.highlights.join(', ')}</li>`,
    )
    .join('');

  const suggestions = res.suggestions
    .map(
      (s, i) =>
        `<div class="cba-sug"><p>${escapeHtml(s)}</p><button data-i="${i}">Chèn vào ô soạn</button></div>`,
    )
    .join('');

  body.innerHTML = `
    <div class="cba-meta">Ý định: <b>${res.intent}</b> · Bước tiếp: <b>${res.nextAction}</b></div>
    ${res.safety.blocked ? '<div class="cba-warn">⚠️ Một số gợi ý bị chặn vì lý do an toàn.</div>' : ''}
    <h4>Gợi ý trả lời</h4>
    ${suggestions}
    <h4>Phòng phù hợp</h4>
    <ul class="cba-rooms">${rooms || '<li>Chưa đủ thông tin để lọc phòng.</li>'}</ul>`;

  body.querySelectorAll<HTMLButtonElement>('.cba-sug button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.i);
      insertIntoComposer(res.suggestions[i]);
    });
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] || c,
  );
}
