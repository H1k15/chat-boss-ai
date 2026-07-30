import { Channel } from '@cba/shared';
import { readConversation } from './reader';
import {
  mountSidebar,
  renderSuggestions,
  autoSuggestEnabled,
  insertSuggestionByIndex,
} from './sidebar';
import { installSendWatcher } from './feedback';
import { setContext, getContext, setSavedCustomerId, customerPayload } from './context';
import { aiSuggest, saveCustomer, createAppointment } from '../api';

// Gọi AI lấy gợi ý. manual=true: báo lỗi cho nhân viên (bấm nút); auto: im lặng.
async function requestSuggestion(manual: boolean): Promise<void> {
  const conversation = readConversation();
  if (!conversation.length) {
    if (manual) alert('Chưa đọc được hội thoại. Hãy mở một cuộc trò chuyện.');
    return;
  }
  const { facebookProfileId } = await chrome.storage.local.get('facebookProfileId');
  const fbId = facebookProfileId || 'unknown';
  try {
    const res = await aiSuggest({
      facebookProfileId: fbId,
      channel: Channel.INBOX,
      conversation,
    });
    setContext(res, fbId); // để nút "Lưu khách"/"Tạo lịch hẹn" dùng lại
    renderSuggestions(res);
  } catch (e) {
    if (manual) alert('Lỗi gọi AI: ' + String(e));
  }
}

// TỰ ĐỘNG gợi ý khi có tin KHÁCH mới (chỉ khi bật toggle ⚡ — tránh tốn AI/ngày).
// Debounce + chỉ gọi khi lượt cuối là khách và hội thoại ĐỔI so với lần trước.
function installAutoSuggest(): void {
  let timer: number | undefined;
  let lastKey = '';
  const obs = new MutationObserver(() => {
    if (!autoSuggestEnabled()) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (!autoSuggestEnabled()) return;
      const conv = readConversation();
      if (!conv.length) return;
      if (conv[conv.length - 1].role !== 'customer') return; // chờ khách nhắn
      const key = conv.map((t) => `${t.role[0]}:${t.text}`).join('|');
      if (key === lastKey) return; // hội thoại chưa đổi -> khỏi gọi lại
      lastKey = key;
      void requestSuggestion(false);
    }, 1200);
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

// Phím tắt Alt+1/2/3: chèn nhanh gợi ý tương ứng vào ô soạn.
function installShortcuts(): void {
  document.addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    const i = { '1': 0, '2': 1, '3': 2 }[e.key];
    if (i === undefined) return;
    insertSuggestionByIndex(i);
  });
}

// Content script: gắn sidebar, lắng nghe các nút thao tác.
function init() {
  mountSidebar();
  installSendWatcher(); // bắt sự kiện gửi để ghi lại câu nhân viên gửi thật
  installAutoSuggest(); // tự động gợi ý (khi bật ⚡)
  installShortcuts(); // Alt+1/2/3 chèn gợi ý

  document
    .getElementById('cba-refresh')
    ?.addEventListener('click', () => void requestSuggestion(true));

  // Nút "Lưu khách": lưu lead từ thông tin AI đã trích xuất.
  document.getElementById('cba-save')?.addEventListener('click', async () => {
    const payload = customerPayload();
    if (!payload) {
      alert('Chưa có gợi ý. Bấm "Gợi ý trả lời" trước để đọc thông tin khách.');
      return;
    }
    try {
      const c = await saveCustomer(payload);
      setSavedCustomerId(c.id);
      alert('Đã lưu khách: ' + (c.name || c.id));
    } catch (e) {
      alert('Lỗi lưu khách: ' + String(e));
    }
  });

  // Nút "Tạo lịch hẹn": lưu khách (nếu chưa) rồi tạo lịch hẹn theo giờ nhập vào.
  document.getElementById('cba-appoint')?.addEventListener('click', async () => {
    const ctx = getContext();
    const payload = customerPayload();
    if (!ctx || !payload) {
      alert('Chưa có gợi ý. Bấm "Gợi ý trả lời" trước.');
      return;
    }
    try {
      let customerId = ctx.customerId;
      if (!customerId) {
        const c = await saveCustomer(payload);
        customerId = c.id;
        setSavedCustomerId(c.id);
      }
      const when = prompt('Giờ hẹn xem phòng (VD: 2026-07-24 15:00):');
      if (!when) return;
      const appt = await createAppointment({
        customerId,
        appointmentTime: when.replace(' ', 'T'),
      });
      alert('Đã tạo lịch hẹn (' + (appt.id || 'ok') + ').');
    } catch (e) {
      alert('Lỗi tạo lịch hẹn: ' + String(e));
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
