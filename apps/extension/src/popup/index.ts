import { API_BASE } from '../config';

// Popup đăng nhập đơn giản: lưu accessToken + facebookProfileId vào chrome.storage.
const form = document.getElementById('login') as HTMLFormElement | null;
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = (document.getElementById('email') as HTMLInputElement).value;
  const password = (document.getElementById('password') as HTMLInputElement)
    .value;
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    (document.getElementById('msg') as HTMLElement).textContent =
      'Đăng nhập thất bại';
    return;
  }
  const data = await res.json();
  await chrome.storage.local.set({ accessToken: data.accessToken });
  (document.getElementById('msg') as HTMLElement).textContent =
    'Đã đăng nhập: ' + data.user.fullName;
});
