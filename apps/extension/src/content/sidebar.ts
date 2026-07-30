import type { AiSuggestResponse } from '@cba/shared';
import { insertIntoComposer } from './reader';
import { setActiveSuggestion, markInserted } from './feedback';

// Sidebar hiển thị gợi ý AI + phòng phù hợp + nút thao tác.
// Nhân viên chọn gợi ý -> chèn vào ô soạn -> tự bấm gửi (human-in-the-loop).
let root: HTMLElement | null = null;
let launcher: HTMLElement | null = null;

// Bật/tắt "tự động gợi ý" (mặc định TẮT — tránh tốn hạn mức AI ngoài ý muốn).
// Giữ trong bộ nhớ để observer đọc đồng bộ; lưu chrome.storage để nhớ qua lần tải.
let autoOn = false;
const AUTO_KEY = 'cbaAutoSuggest';
export function autoSuggestEnabled(): boolean {
  return autoOn;
}

// Gợi ý hiện tại (để phím tắt Alt+1/2/3 chèn nhanh).
let currentSuggestions: string[] = [];
export function insertSuggestionByIndex(i: number): void {
  const s = currentSuggestions[i];
  if (s == null) return;
  insertIntoComposer(s);
  markInserted(i);
}

// Trạng thái panel (vị trí + thu gọn + ẩn) lưu trong chrome.storage.local để
// nhớ qua các lần tải lại trang. Nhân viên kéo panel ra chỗ không che nội dung
// FB một lần là xong, lần sau vẫn ở đó.
const STATE_KEY = 'cbaPanelState';
interface PanelState {
  left?: number;
  top?: number;
  collapsed?: boolean;
  hidden?: boolean;
}

export function mountSidebar(): HTMLElement {
  if (root) return root;
  root = document.createElement('div');
  root.id = 'cba-sidebar';
  root.innerHTML = `
    <div class="cba-header" id="cba-drag">
      <span class="cba-title">🏠 Chat Boss AI</span>
      <div class="cba-ctrls">
        <button id="cba-refresh" title="Lấy gợi ý">Gợi ý trả lời</button>
        <label class="cba-auto" title="Tự động gợi ý khi có tin khách mới (tốn hạn mức AI/ngày)"><input type="checkbox" id="cba-auto"/>⚡</label>
        <button id="cba-min" class="cba-icon" title="Thu gọn/mở rộng">–</button>
        <button id="cba-hide" class="cba-icon" title="Ẩn (thu về nút tròn)">✕</button>
      </div>
    </div>
    <div id="cba-body" class="cba-body">
      <div class="cba-hint">Mở một hội thoại rồi bấm "Gợi ý trả lời".</div>
    </div>
    <div class="cba-actions">
      <button id="cba-save">Lưu khách</button>
      <button id="cba-appoint">Tạo lịch hẹn</button>
    </div>`;
  document.body.appendChild(root);

  const header = root.querySelector<HTMLElement>('.cba-header');
  if (header) enableDrag(root, header);
  document.getElementById('cba-min')?.addEventListener('click', toggleCollapse);
  document
    .getElementById('cba-hide')
    ?.addEventListener('click', () => setHidden(true));

  // Toggle "tự động gợi ý": khôi phục trạng thái + lưu khi đổi.
  const auto = document.getElementById('cba-auto') as HTMLInputElement | null;
  if (auto) {
    try {
      void chrome.storage.local.get(AUTO_KEY).then((g) => {
        autoOn = !!g[AUTO_KEY];
        auto.checked = autoOn;
      });
    } catch {
      /* ngoài context extension */
    }
    auto.addEventListener('change', () => {
      autoOn = auto.checked;
      try {
        void chrome.storage.local.set({ [AUTO_KEY]: autoOn });
      } catch {
        /* bỏ qua */
      }
    });
  }

  void restorePanelState();
  return root;
}

// ---- Ẩn / thu gọn ----------------------------------------------------------

// Nút tròn nổi để mở lại panel khi đã ẩn hẳn (nằm góc dưới phải).
function mountLauncher(): HTMLElement {
  if (launcher) return launcher;
  launcher = document.createElement('button');
  launcher.id = 'cba-launcher';
  launcher.title = 'Mở lại Chat Boss AI';
  launcher.textContent = '🏠';
  launcher.style.display = 'none';
  launcher.addEventListener('click', () => setHidden(false));
  document.body.appendChild(launcher);
  return launcher;
}

function setHidden(hidden: boolean): void {
  if (!root) return;
  root.classList.toggle('cba-hidden', hidden);
  const btn = mountLauncher();
  btn.style.display = hidden ? 'flex' : 'none';
  savePanelState();
}

function toggleCollapse(): void {
  if (!root) return;
  root.classList.toggle('cba-collapsed');
  const min = document.getElementById('cba-min');
  if (min)
    min.textContent = root.classList.contains('cba-collapsed') ? '▢' : '–';
  savePanelState();
}

// ---- Kéo di chuyển ---------------------------------------------------------

function enableDrag(panel: HTMLElement, handle: HTMLElement): void {
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;
  let dragging = false;

  handle.addEventListener('pointerdown', (e) => {
    // Bấm vào nút / ô chọn (gợi ý/thu gọn/ẩn/tự động) thì KHÔNG kéo.
    if ((e.target as HTMLElement).closest('button,input,label')) return;
    const r = panel.getBoundingClientRect();
    // Chuyển sang định vị theo left/top (bỏ neo phải) để kéo tự do.
    panel.style.left = `${r.left}px`;
    panel.style.top = `${r.top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    startX = e.clientX;
    startY = e.clientY;
    originX = r.left;
    originY = r.top;
    dragging = true;
    panel.classList.add('cba-dragging');
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const w = panel.offsetWidth;
    const nx = clamp(
      originX + (e.clientX - startX),
      0,
      Math.max(0, window.innerWidth - w),
    );
    const ny = clamp(
      originY + (e.clientY - startY),
      0,
      Math.max(0, window.innerHeight - 32), // chừa header luôn với tới được
    );
    panel.style.left = `${nx}px`;
    panel.style.top = `${ny}px`;
  });

  const end = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    panel.classList.remove('cba-dragging');
    try {
      handle.releasePointerCapture(e.pointerId);
    } catch {
      /* con trỏ đã nhả */
    }
    savePanelState();
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

// ---- Lưu / khôi phục trạng thái -------------------------------------------

function savePanelState(): void {
  if (!root) return;
  const st: PanelState = {
    collapsed: root.classList.contains('cba-collapsed'),
    hidden: root.classList.contains('cba-hidden'),
  };
  // Chỉ lưu toạ độ khi đã kéo (đang neo theo left thay vì right mặc định).
  if (root.style.left && root.style.right === 'auto') {
    st.left = parseInt(root.style.left, 10);
    st.top = parseInt(root.style.top, 10);
  }
  try {
    void chrome.storage.local.set({ [STATE_KEY]: st });
  } catch {
    /* ngoài context extension (test) -> bỏ qua */
  }
}

async function restorePanelState(): Promise<void> {
  if (!root) return;
  let st: PanelState | undefined;
  try {
    const got = await chrome.storage.local.get(STATE_KEY);
    st = got[STATE_KEY] as PanelState | undefined;
  } catch {
    return;
  }
  if (!st) return;
  if (typeof st.left === 'number' && typeof st.top === 'number') {
    // Kẹp lại trong màn hình phòng khi cửa sổ nhỏ hơn lần lưu trước.
    root.style.left = `${clamp(st.left, 0, Math.max(0, window.innerWidth - 60))}px`;
    root.style.top = `${clamp(st.top, 0, Math.max(0, window.innerHeight - 32))}px`;
    root.style.right = 'auto';
    root.style.bottom = 'auto';
  }
  if (st.collapsed) {
    root.classList.add('cba-collapsed');
    const min = document.getElementById('cba-min');
    if (min) min.textContent = '▢';
  }
  if (st.hidden) setHidden(true);
}

export function renderSuggestions(res: AiSuggestResponse) {
  const body = document.getElementById('cba-body');
  if (!body) return;

  // Ghi nhớ lần gợi ý này để khi nhân viên gửi thì ghép được cặp dữ liệu.
  setActiveSuggestion(res.suggestionLogId, res.suggestions);
  currentSuggestions = res.suggestions; // cho phím tắt Alt+1/2/3

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
      markInserted(i); // để biết nhân viên đã chọn gợi ý thứ mấy
    });
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] || c,
  );
}
