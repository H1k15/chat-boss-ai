// LƯU Ý: KHÔNG import từ '../config' ở đây. Nếu popup và content cùng import một
// module (config.ts), Vite/Rollup tách nó thành chunk chung (assets/config-*.js)
// và chèn `import` vào content.js — mà content script MV3 chạy dạng script thường,
// không cho `import` -> "Cannot use import statement outside a module", chết ngay.
// Giữ API_BASE cục bộ ở popup để content.js luôn tự chứa, không phụ thuộc chunk.
const API_BASE =
  (globalThis as { CBA_API_BASE?: string }).CBA_API_BASE ||
  'http://localhost:3001/api/v1';

// URL dashboard quản trị (Next.js). Dev chạy port 3005; đổi qua CBA_DASHBOARD_URL.
const DASHBOARD_URL =
  (globalThis as { CBA_DASHBOARD_URL?: string }).CBA_DASHBOARD_URL ||
  'http://localhost:3005';

interface StoredUser {
  fullName?: string;
  email?: string;
  role?: string;
}

const $ = (id: string): HTMLElement | null => document.getElementById(id);
const setText = (id: string, t: string): void => {
  const el = $(id);
  if (el) el.textContent = t;
};

// Bong bóng thông báo ngắn (hiện ~2.2s rồi tự ẩn).
function toast(text: string): void {
  const el = $('toast');
  if (!el) return;
  el.textContent = '✓ ' + text;
  el.classList.add('show');
  window.setTimeout(() => el.classList.remove('show'), 2200);
}

function roleLabel(r?: string): string {
  return r === 'ADMIN'
    ? 'Quản trị'
    : r === 'MANAGER'
      ? 'Quản lý'
      : r === 'STAFF'
        ? 'Nhân viên'
        : r || 'Người dùng';
}

// Ẩn form đăng nhập, hiện thẻ tài khoản với thông tin người đang đăng nhập.
function showAccount(user: StoredUser): void {
  const name = user.fullName || user.email || 'Người dùng';
  setText('acct-name', name);
  setText('acct-email', user.email || '');
  setText('acct-role', roleLabel(user.role));
  const av = $('avatar');
  if (av) av.textContent = (name.trim()[0] || '?').toUpperCase();
  // Nút vào trang quản trị chỉ hiện với tài khoản ADMIN.
  $('admin-btn')?.classList.toggle('hidden', user.role !== 'ADMIN');
  $('login-view')?.classList.add('hidden');
  $('account-view')?.classList.remove('hidden');
}

function showLogin(): void {
  $('account-view')?.classList.add('hidden');
  $('login-view')?.classList.remove('hidden');
}

// Khởi tạo: đã đăng nhập -> hiện thẻ tài khoản; chưa -> form đăng nhập.
async function init(): Promise<void> {
  const { accessToken, user } = await chrome.storage.local.get([
    'accessToken',
    'user',
  ]);
  if (accessToken && user) showAccount(user as StoredUser);
  else showLogin();
}
void init();

const form = $('login-view') as HTMLFormElement | null;

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  setText('err', '');
  const btn = $('login-btn') as HTMLButtonElement | null;
  const email = ($('email') as HTMLInputElement).value.trim();
  const password = ($('password') as HTMLInputElement).value;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Đang đăng nhập...';
  }
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      setText(
        'err',
        res.status === 401
          ? 'Sai email hoặc mật khẩu.'
          : `Đăng nhập thất bại (HTTP ${res.status}).`,
      );
      return;
    }
    const data = await res.json();
    // Lưu CẢ refreshToken để content script tự làm mới accessToken khi hết hạn,
    // và lưu user để hiện thẻ tài khoản ở các lần mở popup sau.
    await chrome.storage.local.set({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
    });
    toast('Đăng nhập thành công');
    // Cho bong bóng hiện một nhịp rồi mới chuyển sang thẻ tài khoản (mượt hơn).
    window.setTimeout(() => showAccount(data.user as StoredUser), 650);
  } catch {
    // Thường gặp: backend chưa chạy, sai API_BASE, hoặc thiếu host_permissions.
    setText('err', 'Không gọi được backend — kiểm tra backend có đang chạy không.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Đăng nhập';
    }
  }
});

// Mở dashboard quản trị ở tab mới (chỉ ADMIN mới thấy nút này).
$('admin-btn')?.addEventListener('click', () => {
  void chrome.tabs.create({ url: DASHBOARD_URL });
});

$('logout-btn')?.addEventListener('click', async () => {
  await chrome.storage.local.remove(['accessToken', 'refreshToken', 'user']);
  showLogin();
  toast('Đã đăng xuất');
});
