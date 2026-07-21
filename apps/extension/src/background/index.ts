// Background service worker (MV3).
// Giữ trạng thái đăng nhập, có thể mở rộng để giữ kết nối WebSocket tới server.

chrome.runtime.onInstalled.addListener(() => {
  // eslint-disable-next-line no-console
  console.log('Chat Boss AI extension đã cài đặt.');
});

// Ví dụ nhận message từ content/popup (mở rộng sau).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'PING') {
    sendResponse({ ok: true });
  }
  return true;
});
