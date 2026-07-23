import { Channel } from '@cba/shared';
import { readConversation } from './reader';
import { mountSidebar, renderSuggestions } from './sidebar';
import { installSendWatcher } from './feedback';
import { setContext, getContext, setSavedCustomerId, customerPayload } from './context';
import { aiSuggest, saveCustomer, createAppointment } from '../api';

// Content script: gắn sidebar, lắng nghe các nút thao tác.
function init() {
  mountSidebar();
  installSendWatcher(); // bắt sự kiện gửi để ghi lại câu nhân viên gửi thật

  document.getElementById('cba-refresh')?.addEventListener('click', async () => {
    const conversation = readConversation();
    if (!conversation.length) {
      alert('Chưa đọc được hội thoại. Hãy mở một cuộc trò chuyện.');
      return;
    }
    const { facebookProfileId } = await chrome.storage.local.get(
      'facebookProfileId',
    );
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
      alert('Lỗi gọi AI: ' + String(e));
    }
  });

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
