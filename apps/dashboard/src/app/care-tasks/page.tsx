'use client';
import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPatch } from '@/lib/api';

interface CareTask {
  id: string;
  dueAt: string;
  reason?: string;
  status: string;
  customer?: { name?: string; phone?: string; areaNeed?: string };
}
interface SuggestResult {
  suggestions: string[];
  safety: { blocked: boolean; reasons: string[] };
}

export default function CareTasksPage() {
  const [items, setItems] = useState<CareTask[]>([]);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState('');
  const [sug, setSug] = useState<Record<string, SuggestResult>>({});

  function load() {
    apiGet<CareTask[]>('/care-tasks')
      .then(setItems)
      .catch((e) => setErr(String(e)));
  }
  useEffect(load, []);

  async function suggest(id: string) {
    setBusyId(id);
    try {
      const r = await apiPost<SuggestResult>(`/care-tasks/${id}/suggest`, {});
      setSug((s) => ({ ...s, [id]: r }));
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusyId('');
    }
  }

  async function markDone(id: string) {
    await apiPatch(`/care-tasks/${id}`, { status: 'DONE' });
    load();
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-2xl font-bold mb-1">Chăm sóc khách</h2>
      <p className="text-gray-600 text-sm mb-4">
        Danh sách khách cần nhắn lại. Bấm “Gợi ý nhắn” để AI soạn câu chăm sóc
        (đi qua kiểm tra an toàn như gợi ý thường).
      </p>
      {err && <p className="text-red-600 text-sm mb-2">{err}</p>}

      <div className="space-y-3">
        {items.map((t) => (
          <div key={t.id} className="bg-white border rounded p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">
                  {t.customer?.name || '(chưa rõ tên)'}
                  {t.customer?.phone ? ` · ${t.customer.phone}` : ''}
                </div>
                <div className="text-gray-500">
                  {t.customer?.areaNeed || '-'} · hẹn{' '}
                  {new Date(t.dueAt).toLocaleString('vi-VN')}
                </div>
                {t.reason && (
                  <div className="text-gray-400 text-xs mt-1">Lý do: {t.reason}</div>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <span
                  className={`text-xs px-2 py-1 rounded ${
                    t.status === 'PENDING'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {t.status}
                </span>
                <button
                  onClick={() => suggest(t.id)}
                  disabled={busyId === t.id}
                  className="text-xs bg-blue-600 text-white px-2 py-1 rounded"
                >
                  {busyId === t.id ? 'Đang soạn...' : 'Gợi ý nhắn'}
                </button>
                {t.status === 'PENDING' && (
                  <button
                    onClick={() => markDone(t.id)}
                    className="text-xs border px-2 py-1 rounded"
                  >
                    Xong
                  </button>
                )}
              </div>
            </div>

            {sug[t.id] && (
              <div className="mt-2 border-t pt-2">
                {sug[t.id].suggestions.map((s, i) => (
                  <p key={i} className="bg-gray-50 rounded p-2 mb-1">
                    {s}
                  </p>
                ))}
                {sug[t.id].safety.blocked && (
                  <p className="text-amber-600 text-xs">
                    ⚠️ Một số câu bị chặn: {sug[t.id].safety.reasons.join('; ')}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
        {!items.length && !err && (
          <p className="text-gray-400 text-sm">Chưa có việc chăm sóc nào.</p>
        )}
      </div>
    </div>
  );
}
