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

// Mã MÁY để backend "đá nguyên máy cũ" khi đăng nhập máy khác. Dùng CHUNG với
// dashboard (bridge content-script ghi mã này vào localStorage dashboard).
async function deviceId(): Promise<string> {
  const { cbaMachineId } = await chrome.storage.local.get('cbaMachineId');
  if (cbaMachineId) return cbaMachineId as string;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ cbaMachineId: id });
  return id;
}

// Fetch có token (popup tự làm, không import api.ts để content.js luôn tự chứa).
async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const { accessToken } = await chrome.storage.local.get('accessToken');
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-device-id': await deviceId(),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });
}

// Hiện trạng thái hạn dùng (còn N ngày / đã hết hạn) trên thẻ tài khoản.
async function loadSubscription(): Promise<void> {
  const el = $('sub-status');
  if (!el) return;
  try {
    const res = await authFetch('/license/status');
    if (!res.ok) {
      el.textContent = '';
      return;
    }
    const s = (await res.json()) as {
      plan: string;
      expiresAt: string | null;
      daysLeft: number | null;
      expired: boolean;
    };
    if (s.expiresAt == null) {
      el.textContent = `Gói: ${s.plan} · không giới hạn`;
      el.className = 'sub';
      return;
    }
    const d = new Date(s.expiresAt).toLocaleDateString('vi-VN');
    if (s.expired) {
      el.textContent = `⚠️ Đã hết hạn (${d}) — nhập key để gia hạn`;
      el.className = 'sub warn';
    } else {
      el.textContent = `Gói: ${s.plan} · còn ${s.daysLeft} ngày (đến ${d})`;
      el.className = (s.daysLeft ?? 99) <= 7 ? 'sub warn' : 'sub';
    }
  } catch {
    el.textContent = '';
  }
}

// Ẩn form đăng nhập, hiện thẻ tài khoản với thông tin người đang đăng nhập.
function showAccount(user: StoredUser): void {
  const name = user.fullName || user.email || 'Người dùng';
  setText('acct-name', name);
  setText('acct-email', user.email || '');
  setText('acct-role', roleLabel(user.role));
  const av = $('avatar');
  if (av) av.textContent = (name.trim()[0] || '?').toUpperCase();
  const isSuper = user.role === 'SUPER_ADMIN';
  // Nút vào trang quản trị: cho SUPER_ADMIN (quản trị SaaS) và ADMIN (quản trị nhà trọ).
  $('admin-btn')?.classList.toggle('hidden', !(isSuper || user.role === 'ADMIN'));
  // Kích hoạt key + trạng thái gói là của tenant (admin/nhân viên) — KHÔNG dành cho
  // super-admin (chủ SaaS, không phải khách trả phí).
  $('sub-status')?.classList.toggle('hidden', isSuper);
  $('activate-box')?.classList.toggle('hidden', isSuper);
  $('login-view')?.classList.add('hidden');
  $('account-view')?.classList.remove('hidden');
  if (!isSuper) void loadSubscription();
}

function showLogin(): void {
  $('account-view')?.classList.add('hidden');
  $('login-view')?.classList.remove('hidden');
}

// Khởi tạo: đã đăng nhập -> hiện thẻ tài khoản; chưa -> form đăng nhập.
// Gợi ý email gần nhất (lưu ở lastEmail). KHÔNG gợi ý/tự điền mật khẩu.
async function init(): Promise<void> {
  const { accessToken, user, lastEmail } = await chrome.storage.local.get([
    'accessToken',
    'user',
    'lastEmail',
  ]);
  // Điền THẲNG email làm giá trị thật (sửa được ngay), không để dạng placeholder.
  // Mặc định tài khoản sale; nếu có email đăng nhập gần nhất thì ưu tiên.
  const emailInput = $('email') as HTMLInputElement | null;
  if (emailInput) emailInput.value = (lastEmail as string) || 'sale1@chatboss.ai';
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
      headers: {
        'Content-Type': 'application/json',
        'x-device-id': await deviceId(),
      },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      if (res.status === 401) {
        setText('err', 'Sai email hoặc mật khẩu.');
        return;
      }
      // Lỗi khác (vd: 403 vượt số thiết bị của Key) -> hiện thông báo của backend.
      const j = (await res.json().catch(() => ({}))) as { message?: string };
      setText('err', j.message || `Đăng nhập thất bại (HTTP ${res.status}).`);
      return;
    }
    const data = await res.json();
    // Lưu CẢ refreshToken để content script tự làm mới accessToken khi hết hạn,
    // và lưu user để hiện thẻ tài khoản ở các lần mở popup sau.
    await chrome.storage.local.set({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
      lastEmail: email, // nhớ email cho lần đăng nhập sau
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

// Kích hoạt key gia hạn.
$('activate-btn')?.addEventListener('click', async () => {
  const input = $('license-key') as HTMLInputElement | null;
  const key = input?.value.trim();
  if (!key) return;
  setText('activate-msg', 'Đang kích hoạt...');
  try {
    const res = await authFetch('/license/activate', {
      method: 'POST',
      body: JSON.stringify({ key }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { message?: string };
      setText('activate-msg', j.message || 'Kích hoạt thất bại');
      return;
    }
    if (input) input.value = '';
    setText('activate-msg', '');
    toast('Gia hạn thành công');
    void loadSubscription();
  } catch {
    setText('activate-msg', 'Không gọi được backend');
  }
});

$('logout-btn')?.addEventListener('click', async () => {
  // Báo backend thu hồi phiên để giải phóng chỗ trong hạn mức thiết bị của gói.
  const { refreshToken } = await chrome.storage.local.get('refreshToken');
  if (refreshToken)
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      /* offline vẫn cho đăng xuất cục bộ */
    }
  await chrome.storage.local.remove(['accessToken', 'refreshToken', 'user']);
  showLogin();
  toast('Đã đăng xuất');
});
