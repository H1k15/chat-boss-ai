// API client cho dashboard.
export const BASE =
  process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001/api/v1';

export function getToken(): string | null {
  return typeof window !== 'undefined'
    ? localStorage.getItem('accessToken')
    : null;
}

export function logout(): void {
  // Fire-and-forget: báo backend thu hồi phiên (giải phóng chỗ theo hạn mức
  // thiết bị của gói). Không chờ để đăng xuất luôn kể cả khi offline.
  const rt = localStorage.getItem('refreshToken');
  if (rt)
    void fetch(`${BASE}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    }).catch(() => {});
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  window.location.href = '/login';
}

/** Vai trò của người đang đăng nhập, đọc từ payload JWT (chỉ client). */
export function getRole(): string | null {
  const t = getToken();
  if (!t) return null;
  try {
    const b64 = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return (JSON.parse(atob(b64)).role as string) ?? null;
  } catch {
    return null;
  }
}

function authHeaders(json = true): Record<string, string> {
  const t = getToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  };
}

// 401 -> token hết hạn / chưa đăng nhập: đá về trang login.
function handle401(res: Response) {
  if (res.status === 401 && typeof window !== 'undefined') {
    logout();
  }
}

// Ném Error với thông báo của backend (NestJS trả { message }). message có thể là
// chuỗi hoặc mảng chuỗi (validation). Rơi về "METHOD path -> status" nếu không đọc được.
async function fail(res: Response, method: string, path: string): Promise<never> {
  let msg = `${method} ${path} -> ${res.status}`;
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (body?.message)
      msg = Array.isArray(body.message) ? body.message.join(', ') : body.message;
  } catch {
    /* body không phải JSON -> giữ msg mặc định */
  }
  throw new Error(msg);
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() });
  handle401(res);
  if (!res.ok) return fail(res, 'GET', path);
  return res.json();
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  handle401(res);
  if (!res.ok) return fail(res, 'POST', path);
  return res.json();
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  handle401(res);
  if (!res.ok) return fail(res, 'PATCH', path);
  return res.json();
}

export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  handle401(res);
  if (!res.ok) await fail(res, 'DELETE', path);
}

// Upload file (multipart) — cho import Excel.
export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(false), // để trình duyệt tự set multipart boundary
    body: form,
  });
  handle401(res);
  if (!res.ok) throw new Error(`UPLOAD ${path} -> ${res.status}`);
  return res.json();
}
