'use client';
import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api';
import { BASE, getToken } from '@/lib/api';

// PUT helper (api.ts chưa có apiPut) — dùng riêng ở trang này.
async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path} -> ${res.status}`);
  return res.json();
}

interface LmRow {
  area: string;
  keywords: string; // nhập dạng "kw1, kw2" cho dễ sửa
}

export default function LandmarksPage() {
  const [rows, setRows] = useState<LmRow[]>([]);
  const [custom, setCustom] = useState(false);
  const [groupsText, setGroupsText] = useState('');
  const [groupsCustom, setGroupsCustom] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  function load() {
    apiGet<{ landmarks: { area: string; keywords: string[] }[]; custom: boolean }>(
      '/ai-config/landmarks',
    )
      .then((d) => {
        setRows(d.landmarks.map((l) => ({ area: l.area, keywords: l.keywords.join(', ') })));
        setCustom(d.custom);
      })
      .catch((e) => setErr(String(e)));
    apiGet<{ groups: string[][]; custom: boolean }>('/ai-config/area-groups')
      .then((d) => {
        setGroupsText(d.groups.map((g) => g.join(', ')).join('\n'));
        setGroupsCustom(d.custom);
      })
      .catch((e) => setErr(String(e)));
  }
  useEffect(load, []);

  const setRow = (i: number, patch: Partial<LmRow>) =>
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const addRow = () => setRows((r) => [{ area: '', keywords: '' }, ...r]);
  const delRow = (i: number) => setRows((r) => r.filter((_, j) => j !== i));

  async function saveLandmarks() {
    setMsg('');
    setErr('');
    const landmarks = rows
      .map((r) => ({
        area: r.area.trim(),
        keywords: r.keywords.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean),
      }))
      .filter((l) => l.area && l.keywords.length);
    try {
      const res = await apiPut<{ count: number }>('/ai-config/landmarks', { landmarks });
      setMsg(`Đã lưu ${res.count} điểm mốc. AI dùng ngay không cần deploy.`);
      setCustom(true);
    } catch (e) {
      setErr(String(e));
    }
  }
  async function resetLandmarks() {
    if (!confirm('Về lại bộ điểm mốc mặc định trong code?')) return;
    await apiPost('/ai-config/landmarks/reset', {});
    load();
    setMsg('Đã về mặc định.');
  }

  async function saveGroups() {
    setMsg('');
    setErr('');
    const groups = groupsText
      .split('\n')
      .map((line) => line.split(',').map((x) => x.trim()).filter(Boolean))
      .filter((g) => g.length >= 2);
    try {
      const res = await apiPut<{ count: number }>('/ai-config/area-groups', { groups });
      setMsg(`Đã lưu ${res.count} cụm khu.`);
      setGroupsCustom(true);
    } catch (e) {
      setErr(String(e));
    }
  }
  async function resetGroups() {
    if (!confirm('Về lại cụm khu mặc định?')) return;
    await apiPost('/ai-config/area-groups/reset', {});
    load();
  }

  return (
    <div className="max-w-4xl">
      <h2 className="text-2xl font-bold mb-1">Điểm mốc AI</h2>
      <p className="text-gray-600 text-sm mb-4">
        Dạy AI hiểu khách hỏi theo điểm mốc: gõ tên khách hay nói (không dấu) → khu
        chuẩn có phòng. VD khách nói &quot;gần ĐH Công nghiệp&quot; → khu &quot;Nhổn&quot;.
        Lưu là AI dùng ngay, không cần sửa code.
      </p>

      {msg && <p className="text-green-700 text-sm mb-2">{msg}</p>}
      {err && <p className="text-red-600 text-sm mb-2">{err}</p>}

      <div className="flex items-center gap-3 mb-2">
        <button onClick={addRow} className="bg-gray-100 border px-3 py-1 rounded text-sm">
          + Thêm mốc
        </button>
        <button onClick={saveLandmarks} className="bg-blue-600 text-white px-4 py-1 rounded text-sm">
          Lưu điểm mốc
        </button>
        <button onClick={resetLandmarks} className="text-red-500 text-sm">
          Về mặc định
        </button>
        <span className="text-xs text-gray-400">
          {custom ? 'Đang dùng bộ tuỳ chỉnh' : 'Đang dùng bộ mặc định trong code'}
        </span>
      </div>

      <div className="bg-white border rounded divide-y mb-8">
        <div className="grid grid-cols-[1fr_2fr_auto] gap-2 p-2 text-xs font-semibold text-gray-500">
          <div>Khu chuẩn (có phòng)</div>
          <div>Từ khoá khách hay gõ (cách nhau dấu phẩy, không dấu)</div>
          <div></div>
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2 p-2 items-center">
            <input
              className="border p-1 rounded text-sm"
              value={r.area}
              placeholder="VD: Nhổn"
              onChange={(e) => setRow(i, { area: e.target.value })}
            />
            <input
              className="border p-1 rounded text-sm"
              value={r.keywords}
              placeholder="dh cong nghiep, haui, ga nhon"
              onChange={(e) => setRow(i, { keywords: e.target.value })}
            />
            <button onClick={() => delRow(i)} className="text-red-500 text-xs px-2">
              Xoá
            </button>
          </div>
        ))}
        {!rows.length && <div className="p-3 text-sm text-gray-400">Chưa có điểm mốc nào.</div>}
      </div>

      <h3 className="text-lg font-bold mb-1">Cụm khu lân cận</h3>
      <p className="text-gray-600 text-sm mb-2">
        Mỗi dòng là một cụm các khu ở gần nhau (cách nhau dấu phẩy). Khi khách hỏi
        khu chưa có phòng, AI ưu tiên gợi ý phòng ở khu CÙNG CỤM (đi lại vài km).
      </p>
      <textarea
        className="border rounded w-full p-2 text-sm font-mono"
        rows={5}
        value={groupsText}
        onChange={(e) => setGroupsText(e.target.value)}
        placeholder={'Phú Diễn, Đức Diễn, Cầu Diễn, Nhổn\nLĩnh Nam, Vĩnh Hưng, Mai Động'}
      />
      <div className="flex items-center gap-3 mt-2">
        <button onClick={saveGroups} className="bg-blue-600 text-white px-4 py-1 rounded text-sm">
          Lưu cụm khu
        </button>
        <button onClick={resetGroups} className="text-red-500 text-sm">
          Về mặc định
        </button>
        <span className="text-xs text-gray-400">
          {groupsCustom ? 'Đang dùng bộ tuỳ chỉnh' : 'Đang dùng mặc định'}
        </span>
      </div>
    </div>
  );
}
