// LƯU Ý: KHÔNG import từ '../config' ở đây. Nếu popup và content cùng import một
// module (config.ts), Vite/Rollup tách nó thành chunk chung (assets/config-*.js)
// và chèn `import` vào content.js — mà content script MV3 chạy dạng script thường,
// không cho `import` -> "Cannot use import statement outside a module", chết ngay.
// Giữ API_BASE cục bộ ở popup để content.js luôn tự chứa, không phụ thuộc chunk.
const API_BASE =
  (globalThis as { CBA_API_BASE?: string }).CBA_API_BASE ||
  'http://localhost:3001/api/v1';

// Popup đăng nhập đơn giản: lưu accessToken + facebookProfileId vào chrome.storage.
const form = document.getElementById('login') as HTMLFormElement | null;
const msg = (t: string): void => {
  const el = document.getElementById('msg');
  if (el) el.textContent = t;
};

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = (document.getElementById('email') as HTMLInputElement).value;
  const password = (document.getElementById('password') as HTMLInputElement)
    .value;
  msg('Đang đăng nhập...');
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      msg(`Đăng nhập thất bại (HTTP ${res.status})`);
      return;
    }
    const data = await res.json();
    await chrome.storage.local.set({ accessToken: data.accessToken });
    msg('Đã đăng nhập: ' + data.user.fullName);
  } catch (err) {
    // Thường gặp: backend chưa chạy, sai API_BASE, hoặc thiếu host_permissions
    // cho localhost trong manifest -> fetch bị chặn.
    msg('Không gọi được backend: ' + String(err));
  }
});
