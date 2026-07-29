// Background service worker (MV3).
// Giữ trạng thái đăng nhập, có thể mở rộng để giữ kết nối WebSocket tới server.

// Mã MÁY duy nhất cho lần cài này. dashboard + extension trên CÙNG máy dùng chung
// (bridge content-script ghi mã này vào localStorage của dashboard) -> backend coi
// là một máy, đăng nhập máy khác sẽ đá NGUYÊN máy này.
async function ensureMachineId(): Promise<void> {
  const { cbaMachineId } = await chrome.storage.local.get('cbaMachineId');
  if (!cbaMachineId)
    await chrome.storage.local.set({ cbaMachineId: crypto.randomUUID() });
}

chrome.runtime.onInstalled.addListener(() => {
  void ensureMachineId();
  // eslint-disable-next-line no-console
  console.log('Chat Boss AI extension đã cài đặt.');
});
chrome.runtime.onStartup?.addListener(() => void ensureMachineId());

// Ví dụ nhận message từ content/popup (mở rộng sau).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'PING') {
    sendResponse({ ok: true });
  }
  return true;
});
