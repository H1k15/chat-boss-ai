import type {
  AiSuggestRequest,
  AiSuggestResponse,
  AiFeedbackRequest,
} from '@cba/shared';
import { API_BASE } from './config';

async function token(): Promise<string | undefined> {
  const { accessToken } = await chrome.storage.local.get('accessToken');
  return accessToken;
}

async function authHeaders(): Promise<Record<string, string>> {
  const t = await token();
  return {
    'Content-Type': 'application/json',
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  };
}

// Dùng refreshToken (sống 7 ngày) đổi lấy accessToken mới (sống 15 phút). Trả
// token mới hoặc undefined nếu không refresh được (refresh token cũng hết hạn).
async function refreshAccessToken(): Promise<string | undefined> {
  const { refreshToken } = await chrome.storage.local.get('refreshToken');
  if (!refreshToken) return undefined;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return undefined;
    const data = await res.json();
    if (!data.accessToken) return undefined;
    await chrome.storage.local.set({ accessToken: data.accessToken });
    return data.accessToken as string;
  } catch {
    return undefined;
  }
}

// Fetch có TỰ LÀM MỚI token: gặp 401 -> refresh accessToken một lần -> thử lại.
// Refresh hỏng (phiên hết hạn hẳn) -> xoá accessToken để popup buộc đăng nhập lại,
// và trả về đúng phản hồi 401 để caller báo lỗi.
async function authedFetch(path: string, body: unknown): Promise<Response> {
  const call = async (): Promise<Response> =>
    fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(body),
    });

  let res = await call();
  if (res.status !== 401) return res;

  const renewed = await refreshAccessToken();
  if (!renewed) {
    await chrome.storage.local.remove('accessToken');
    return res; // 401 gốc — hết đường tự cứu, cần đăng nhập lại
  }
  return call(); // thử lại với accessToken vừa làm mới
}

export async function aiSuggest(
  req: AiSuggestRequest,
): Promise<AiSuggestResponse> {
  const res = await authedFetch('/ai/suggest', req);
  if (res.status === 401)
    throw new Error('Phiên đăng nhập hết hạn — mở extension đăng nhập lại nhé.');
  if (!res.ok) throw new Error(`AI suggest lỗi: ${res.status}`);
  return res.json();
}

// Báo backend câu nhân viên thực sự gửi, để ghép cặp với lần AI đề xuất.
// Là việc phụ (thu dữ liệu) — lỗi thì nuốt, không làm phiền nhân viên.
export async function aiFeedback(req: AiFeedbackRequest): Promise<void> {
  try {
    await authedFetch('/ai/feedback', req);
  } catch {
    // im lặng — không chặn thao tác của nhân viên
  }
}

export async function saveCustomer(payload: Record<string, unknown>) {
  const res = await authedFetch('/customers', payload);
  return res.json();
}

export async function createAppointment(payload: Record<string, unknown>) {
  const res = await authedFetch('/appointments', payload);
  return res.json();
}
