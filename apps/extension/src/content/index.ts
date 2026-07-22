import { Channel } from '@cba/shared';
import { readConversation } from './reader';
import { mountSidebar, renderSuggestions } from './sidebar';
import { installSendWatcher } from './feedback';
import { aiSuggest } from '../api';

// Content script: gắn sidebar, lắng nghe nút "Gợi ý trả lời".
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
    try {
      const res = await aiSuggest({
        facebookProfileId: facebookProfileId || 'unknown',
        channel: Channel.INBOX,
        conversation,
      });
      renderSuggestions(res);
    } catch (e) {
      alert('Lỗi gọi AI: ' + String(e));
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
