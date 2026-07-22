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

export async function aiSuggest(
  req: AiSuggestRequest,
): Promise<AiSuggestResponse> {
  const res = await fetch(`${API_BASE}/ai/suggest`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`AI suggest lỗi: ${res.status}`);
  return res.json();
}

// Báo backend câu nhân viên thực sự gửi, để ghép cặp với lần AI đề xuất.
// Là việc phụ (thu dữ liệu) — lỗi thì nuốt, không làm phiền nhân viên.
export async function aiFeedback(req: AiFeedbackRequest): Promise<void> {
  try {
    await fetch(`${API_BASE}/ai/feedback`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(req),
    });
  } catch {
    // im lặng — không chặn thao tác của nhân viên
  }
}

export async function saveCustomer(payload: Record<string, unknown>) {
  const res = await fetch(`${API_BASE}/customers`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function createAppointment(payload: Record<string, unknown>) {
  const res = await fetch(`${API_BASE}/appointments`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });
  return res.json();
}
