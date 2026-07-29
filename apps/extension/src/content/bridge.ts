// Content-script "bridge" chạy trên trang dashboard: ghi mã MÁY của extension vào
// localStorage của dashboard (khoá 'cba_device_id'). Nhờ vậy dashboard và extension
// trên CÙNG một máy gửi cùng deviceId -> backend cho hai bề mặt sống chung, và
// đăng nhập máy khác sẽ đá nguyên máy này.
//
// Content-script chạy ở "isolated world" nhưng DÙNG CHUNG localStorage của trang,
// nên setItem ở đây chính là ghi vào localStorage mà code dashboard đọc được.
(async () => {
  try {
    let { cbaMachineId } = await chrome.storage.local.get('cbaMachineId');
    if (!cbaMachineId) {
      cbaMachineId = crypto.randomUUID();
      await chrome.storage.local.set({ cbaMachineId });
    }
    // Ghi đè để mã của extension luôn thắng (dashboard không tự sinh mã riêng khi
    // đã có extension) -> hai bề mặt chung một máy.
    if (localStorage.getItem('cba_device_id') !== cbaMachineId)
      localStorage.setItem('cba_device_id', cbaMachineId);
  } catch {
    /* thiếu quyền / trang lạ -> bỏ qua, dashboard tự sinh mã riêng */
  }
})();
