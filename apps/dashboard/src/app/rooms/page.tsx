'use client';
import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost, apiPatch } from '@/lib/api';

interface Room {
  id: string;
  roomCode: string;
  code?: string | null;
  roomNumber?: string | null;
  stayDuration?: string | null;
  salePrice?: number | null;
  area: string;
  price: number;
  status: string;
  roomType?: string | null;
  furniture?: string | null;
  note?: string | null; // "dịch vụ | điều khoản | ghi chú" ngăn bằng " | "
}
interface SheetConfig {
  spreadsheetId: string;
  sheetName?: string;
  headerRow: number;
}
interface RoomMedia {
  demo?: string; // ảnh/video demo (cột "Link ảnh")
  real?: string; // ảnh/video thực tế (cột "Video/ ảnh thực tế")
  location?: string; // vị trí (cột "Điểm hẹn khách" — Google Maps)
}

// 8 loại chuẩn (khớp ROOM_TYPE_KEYWORDS ở backend). Thêm loại mới thì bổ sung.
const KNOWN_TYPES = [
  'studio',
  'chung cư mini',
  'nguyên căn',
  'duplex',
  'gác',
  'khép kín',
  'vệ sinh chung',
  'ở ghép',
];

// Tách chuỗi tự do thành các ý ngắn để hiện gạch đầu dòng (mỗi ý 1 dòng).
function toBullets(text: string | null | undefined): string[] {
  return (text || '')
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
// note = "dịch vụ | điều khoản | ghi chú" (ngăn bằng " | "). Lấy đoạn thứ i;
// đoạn cuối để rest=true gom hết phần còn lại, tránh rớt data nếu lỡ có thêm "|".
function noteSegment(
  note: string | null | undefined,
  i: number,
  rest = false,
): string[] {
  const parts = (note || '').split('|');
  return toBullets(rest ? parts.slice(i).join('|') : parts[i] ?? '');
}

function BulletCell({ items }: { items: string[] }) {
  if (!items.length) return <span className="text-gray-300">-</span>;
  return (
    <ul className="list-disc list-inside space-y-0.5 text-xs text-gray-700">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

function MediaLinks({
  m,
  onCopy,
}: {
  m?: RoomMedia;
  onCopy: (url: string, label: string) => void;
}) {
  const items: [string, string | undefined][] = [
    ['📷 Demo', m?.demo],
    ['🎥 Thực tế', m?.real],
    ['📍 Vị trí', m?.location],
  ];
  const has = items.filter(([, u]) => u);
  if (!has.length) return <span className="text-gray-300">-</span>;
  return (
    <div className="flex flex-col gap-1">
      {has.map(([label, u]) => (
        <div key={label} className="flex items-center gap-1 whitespace-nowrap">
          <a
            href={u}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline text-xs"
          >
            {label}
          </a>
          <button
            onClick={() => onCopy(u as string, label)}
            className="text-xs text-gray-500 border rounded px-1"
            title="Copy link để dán vào chat gửi khách"
          >
            📋
          </button>
        </div>
      ))}
    </div>
  );
}

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [err, setErr] = useState('');
  const [hasConfig, setHasConfig] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [savingId, setSavingId] = useState('');
  const [media, setMedia] = useState<Record<string, RoomMedia>>({});

  function load() {
    apiGet<Room[]>('/rooms')
      .then(setRooms)
      .catch((e) => setErr(String(e)));
  }
  function loadMedia() {
    apiGet<Record<string, RoomMedia>>('/sheets/room-media')
      .then(setMedia)
      .catch(() => {});
  }
  useEffect(() => {
    load();
    loadMedia();
    // Có cấu hình sheet đã lưu thì mới hiện nút đồng bộ một-cú-bấm.
    apiGet<SheetConfig | null>('/sheets/config')
      .then((c) => setHasConfig(!!c))
      .catch(() => {});
  }, []);

  function copyLink(url: string, label: string) {
    navigator.clipboard
      ?.writeText(url)
      .then(() => setMsg(`Đã copy link ${label} — dán vào chat gửi khách.`))
      .catch(() => setMsg('Không copy được, bạn mở link rồi copy thủ công.'));
  }

  const missingCount = useMemo(
    () => rooms.filter((r) => !r.roomType).length,
    [rooms],
  );
  const shown = onlyMissing ? rooms.filter((r) => !r.roomType) : rooms;

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
      loadMedia();
    } catch (e) {
      setMsg('Lỗi đồng bộ: ' + String(e));
    } finally {
      setSyncing(false);
    }
  }

  // Nhân viên gán/sửa loại -> nhãn vàng. Cập nhật lạc quan tại chỗ.
  async function saveType(room: Room, type: string | null) {
    setSavingId(room.id);
    try {
      const r = await apiPatch<{ id: string; roomType: string | null }>(
        `/sheets/rooms/${room.id}/type`,
        { type },
      );
      setRooms((rs) =>
        rs.map((x) => (x.id === room.id ? { ...x, roomType: r.roomType } : x)),
      );
    } catch (e) {
      setMsg('Lỗi lưu loại: ' + String(e));
    } finally {
      setSavingId('');
    }
  }

  function onSelect(room: Room, value: string) {
    if (value === '__custom__') {
      const v = window.prompt('Nhập loại phòng mới:', room.roomType || '');
      if (v && v.trim()) saveType(room, v.trim());
      return;
    }
    saveType(room, value || null);
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

      <div className="flex items-center gap-3 mb-2 text-sm">
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyMissing}
            onChange={(e) => setOnlyMissing(e.target.checked)}
          />
          Chỉ hiện phòng chưa có loại
        </label>
        <span className="text-gray-500">
          Chưa có loại: <b className="text-orange-600">{missingCount}</b>/
          {rooms.length}
        </span>
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
      <div className="overflow-x-auto">
      <table className="w-full bg-white border rounded overflow-hidden text-sm">
        <thead className="bg-gray-100 text-left">
          <tr>
            <th className="p-2">Mã</th>
            <th className="p-2">Số phòng</th>
            <th className="p-2">Khu vực</th>
            <th className="p-2">Giá</th>
            <th className="p-2">Giá sale</th>
            <th className="p-2">Thời gian ở</th>
            <th className="p-2">Loại (gán tay = nhãn vàng)</th>
            <th className="p-2">Nội thất</th>
            <th className="p-2">Dịch vụ</th>
            <th className="p-2">Điều khoản</th>
            <th className="p-2">Ghi chú</th>
            <th className="p-2">Ảnh / Vị trí</th>
            <th className="p-2">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            // Nếu loại hiện tại không nằm trong 8 loại chuẩn -> vẫn cho hiện.
            const opts =
              r.roomType && !KNOWN_TYPES.includes(r.roomType)
                ? [...KNOWN_TYPES, r.roomType]
                : KNOWN_TYPES;
            return (
              <tr
                key={r.id}
                className={'border-t ' + (!r.roomType ? 'bg-orange-50' : '')}
              >
                <td className="p-2 font-medium">{r.code || r.roomCode}</td>
                <td className="p-2">{r.roomNumber || '-'}</td>
                <td className="p-2">{r.area}</td>
                <td className="p-2">{(r.price / 1_000_000).toFixed(1)}tr</td>
                <td className="p-2 text-orange-600">
                  {r.salePrice ? `${(r.salePrice / 1_000_000).toFixed(1)}tr` : ''}
                </td>
                <td className="p-2">{r.stayDuration || '-'}</td>
                <td className="p-2">
                  <select
                    value={r.roomType || ''}
                    disabled={savingId === r.id}
                    onChange={(e) => onSelect(r, e.target.value)}
                    className="border rounded px-1 py-0.5 text-sm bg-white"
                  >
                    <option value="">— chưa rõ —</option>
                    {opts.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                    <option value="__custom__">＋ loại khác…</option>
                  </select>
                </td>
                <td className="p-2 align-top max-w-[240px]">
                  <BulletCell items={toBullets(r.furniture)} />
                </td>
                <td className="p-2 align-top max-w-[240px]">
                  <BulletCell items={noteSegment(r.note, 0)} />
                </td>
                <td className="p-2 align-top max-w-[240px]">
                  <BulletCell items={noteSegment(r.note, 1)} />
                </td>
                <td className="p-2 align-top max-w-[240px]">
                  <BulletCell items={noteSegment(r.note, 2, true)} />
                </td>
                <td className="p-2 align-top">
                  <MediaLinks m={media[r.roomCode]} onCopy={copyLink} />
                </td>
                <td
                  className={
                    'p-2 align-top ' +
                    (r.status === 'AVAILABLE' ? 'text-green-700' : 'text-gray-400')
                  }
                >
                  {r.status}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
