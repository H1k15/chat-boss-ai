'use client';
import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api';

interface Room {
  id: string;
  roomCode: string;
  area: string;
  price: number;
  status: string;
  roomType?: string;
}
interface SheetConfig {
  spreadsheetId: string;
  sheetName?: string;
  headerRow: number;
}

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [err, setErr] = useState('');
  const [hasConfig, setHasConfig] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState('');

  function load() {
    apiGet<Room[]>('/rooms')
      .then(setRooms)
      .catch((e) => setErr(String(e)));
  }
  useEffect(() => {
    load();
    // Có cấu hình sheet đã lưu thì mới hiện nút đồng bộ một-cú-bấm.
    apiGet<SheetConfig | null>('/sheets/config')
      .then((c) => setHasConfig(!!c))
      .catch(() => {});
  }, []);

  async function sync() {
    setSyncing(true);
    setMsg('');
    try {
      const r = await apiPost<{
        created: number;
        updated: number;
        deleted: number;
      }>('/sheets/sync-saved', {});
      setMsg(
        `Đã đồng bộ: ${r.created} thêm, ${r.updated} cập nhật` +
          (r.deleted ? `, ${r.deleted} xoá (không còn trong sheet)` : '') +
          '.',
      );
      load();
    } catch (e) {
      setMsg('Lỗi đồng bộ: ' + String(e));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Phòng trọ ({rooms.length})</h2>
        {hasConfig && (
          <button
            onClick={sync}
            disabled={syncing}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded"
          >
            {syncing ? 'Đang đồng bộ...' : '↻ Đồng bộ từ Google Sheet'}
          </button>
        )}
      </div>
      {msg && <p className="text-sm text-green-700 mb-2">{msg}</p>}
      {err && (
        <p className="text-red-600 text-sm mb-2">Chưa kết nối được API: {err}</p>
      )}
      {!hasConfig && (
        <p className="text-xs text-gray-400 mb-2">
          Chưa cấu hình Google Sheet. Vào màn “Nhập phòng” đồng bộ một lần để bật
          nút đồng bộ nhanh ở đây.
        </p>
      )}
      <table className="w-full bg-white border rounded overflow-hidden text-sm">
        <thead className="bg-gray-100 text-left">
          <tr>
            <th className="p-2">Mã</th>
            <th className="p-2">Khu vực</th>
            <th className="p-2">Giá</th>
            <th className="p-2">Loại</th>
            <th className="p-2">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {rooms.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="p-2 font-medium">{r.roomCode}</td>
              <td className="p-2">{r.area}</td>
              <td className="p-2">{(r.price / 1_000_000).toFixed(1)}tr</td>
              <td className="p-2">{r.roomType || '-'}</td>
              <td className="p-2">{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
