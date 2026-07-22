'use client';
import { useEffect, useState } from 'react';
import { apiGet, apiPatch } from '@/lib/api';

interface TelegramConfigView {
  defaultChatId: string;
  events: Record<string, boolean>;
  botConfigured: boolean;
  envChatId: string;
}

const EVENT_LABELS: Record<string, string> = {
  LEFT_PHONE: 'Khách để lại số điện thoại',
  APPOINTMENT: 'Khách hẹn xem phòng',
  URGENT_CALL: 'Cần gọi gấp',
  EOD_REPORT: 'Báo cáo cuối ngày',
  ROOM_LOW: 'Sắp hết phòng',
  CARE_REMINDER: 'Nhắc chăm sóc',
};

export default function SettingsPage() {
  const [cfg, setCfg] = useState<TelegramConfigView | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  function load() {
    apiGet<TelegramConfigView>('/telegram/config')
      .then(setCfg)
      .catch((e) => setErr(String(e)));
  }
  useEffect(load, []);

  async function save() {
    if (!cfg) return;
    setMsg('');
    try {
      const next = await apiPatch<TelegramConfigView>('/telegram/config', {
        defaultChatId: cfg.defaultChatId,
        events: cfg.events,
      });
      setCfg(next);
      setMsg('Đã lưu.');
    } catch (e) {
      setErr(String(e));
    }
  }

  if (err)
    return (
      <div>
        <h2 className="text-2xl font-bold mb-2">Cấu hình</h2>
        <p className="text-red-600 text-sm">{err}</p>
        <p className="text-gray-500 text-sm mt-1">
          Trang này chỉ admin xem được.
        </p>
      </div>
    );
  if (!cfg) return <p className="text-gray-500">Đang tải...</p>;

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold mb-1">Cấu hình Telegram</h2>
      <p className="text-gray-600 text-sm mb-4">
        Nơi nhận thông báo và bật/tắt từng loại sự kiện. Bot token đặt trong file
        .env (không sửa ở đây).
      </p>

      <div className="bg-white border rounded p-4">
        <div className="text-sm mb-3">
          Trạng thái bot:{' '}
          {cfg.botConfigured ? (
            <span className="text-green-700">Đã cấu hình token</span>
          ) : (
            <span className="text-red-600">Chưa có token trong .env</span>
          )}
        </div>

        <label className="block text-sm font-medium mb-1">
          Chat ID nhận thông báo
        </label>
        <input
          className="border p-2 rounded w-full mb-1"
          value={cfg.defaultChatId}
          onChange={(e) => setCfg({ ...cfg, defaultChatId: e.target.value })}
          placeholder={cfg.envChatId || '-100...'}
        />
        <p className="text-xs text-gray-400 mb-4">
          Để trống sẽ dùng giá trị trong .env ({cfg.envChatId || 'chưa đặt'}).
        </p>

        <div className="text-sm font-medium mb-2">Sự kiện gửi thông báo</div>
        <div className="space-y-1 mb-4">
          {Object.keys(EVENT_LABELS).map((ev) => (
            <label key={ev} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={cfg.events[ev] ?? true}
                onChange={(e) =>
                  setCfg({
                    ...cfg,
                    events: { ...cfg.events, [ev]: e.target.checked },
                  })
                }
              />
              {EVENT_LABELS[ev]}
            </label>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={save}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            Lưu cấu hình
          </button>
          {msg && <span className="text-green-700 text-sm">{msg}</span>}
        </div>
      </div>
    </div>
  );
}
