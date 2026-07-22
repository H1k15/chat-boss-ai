// API client cho dashboard.
export const BASE =
  process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001/api/v1';

export function getToken(): string | null {
  return typeof window !== 'undefined'
    ? localStorage.getItem('accessToken')
    : null;
}

export function logout(): void {
  localStorage.removeItem('accessToken');
  window.location.href = '/login';
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

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() });
  handle401(res);
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.json();
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  handle401(res);
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status}`);
  return res.json();
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  handle401(res);
  if (!res.ok) throw new Error(`PATCH ${path} -> ${res.status}`);
  return res.json();
}

export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  handle401(res);
  if (!res.ok) throw new Error(`DELETE ${path} -> ${res.status}`);
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
