'use client';
import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiUpload, BASE, getToken } from '@/lib/api';

interface ImportResult {
  batchId: string;
  created: number;
  updated: number;
  errors: { row: number; roomCode?: string; message: string }[];
  missingColumns: string[];
}
interface Batch {
  id: string;
  source: string;
  fileName?: string;
  created: number;
  updated: number;
  createdAt: string;
}

export default function ImportPage() {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [sheetId, setSheetId] = useState('');
  const [sheetBusy, setSheetBusy] = useState(false);

  async function syncSheet() {
    if (!sheetId.trim()) return;
    setSheetBusy(true);
    setErr('');
    setResult(null);
    try {
      const r = await apiPost<ImportResult>('/sheets/sync', {
        spreadsheetId: sheetId.trim(),
      });
      setResult(r);
      loadBatches();
    } catch (e) {
      setErr(
        String(e) +
          ' (cần cấu hình Google service account — xem HUONG-DAN-GOOGLE-SHEETS.md)',
      );
    } finally {
      setSheetBusy(false);
    }
  }

  function loadBatches() {
    apiGet<Batch[]>('/excel/import-batches')
      .then(setBatches)
      .catch(() => {});
  }
  useEffect(loadBatches, []);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setErr('');
    setResult(null);
    try {
      const r = await apiUpload<ImportResult>('/excel/import', file);
      setResult(r);
      loadBatches();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  // Tải file mẫu: fetch kèm token rồi lưu blob (không mở tab mới vì cần header).
  async function downloadTemplate() {
    const res = await fetch(`${BASE}/excel/template`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mau-phong.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-2xl font-bold mb-1">Nhập phòng từ Excel</h2>
      <p className="text-gray-600 text-sm mb-4">
        Tải file mẫu, điền dữ liệu phòng, rồi tải lên. Hệ thống cập nhật theo{' '}
        <b>mã phòng</b> (trùng mã thì ghi đè).
      </p>

      <div className="flex gap-3 mb-4">
        <button
          onClick={downloadTemplate}
          className="border px-4 py-2 rounded bg-white hover:bg-gray-50"
        >
          ⬇ Tải file mẫu
        </button>
        <label className="bg-blue-600 text-white px-4 py-2 rounded cursor-pointer">
          {busy ? 'Đang nhập...' : '⬆ Tải lên file .xlsx'}
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={upload}
            disabled={busy}
          />
        </label>
      </div>

      {err && <p className="text-red-600 text-sm mb-2">{err}</p>}

      {result && (
        <div className="bg-white border rounded p-4 mb-6 text-sm">
          <p>
            Kết quả: <b className="text-green-700">{result.created} thêm mới</b>,{' '}
            <b className="text-blue-700">{result.updated} cập nhật</b>
            {result.errors.length > 0 && (
              <>
                , <b className="text-red-600">{result.errors.length} lỗi</b>
              </>
            )}
          </p>
          {result.missingColumns.length > 0 && (
            <p className="text-amber-600 mt-1">
              Thiếu cột bắt buộc: {result.missingColumns.join(', ')}
            </p>
          )}
          {result.errors.length > 0 && (
            <ul className="mt-2 text-red-600 list-disc ml-5">
              {result.errors.slice(0, 10).map((er, i) => (
                <li key={i}>
                  Dòng {er.row > 0 ? er.row : '?'}
                  {er.roomCode ? ` (${er.roomCode})` : ''}: {er.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="bg-white border rounded p-4 mb-6">
        <h3 className="font-semibold mb-1 text-sm">
          Hoặc đồng bộ từ Google Sheet
        </h3>
        <p className="text-xs text-gray-500 mb-2">
          Dán Spreadsheet ID (đoạn giữa <code>/d/</code> và <code>/edit</code>
          trong URL). Cần cấu hình service account trước — xem
          HUONG-DAN-GOOGLE-SHEETS.md.
        </p>
        <div className="flex gap-2">
          <input
            className="border p-2 rounded flex-1 text-sm"
            placeholder="1AbC...XyZ"
            value={sheetId}
            onChange={(e) => setSheetId(e.target.value)}
          />
          <button
            onClick={syncSheet}
            disabled={sheetBusy}
            className="border px-4 py-2 rounded bg-white hover:bg-gray-50 text-sm"
          >
            {sheetBusy ? 'Đang đồng bộ...' : 'Đồng bộ'}
          </button>
        </div>
      </div>

      <h3 className="font-semibold mb-2">Lịch sử nhập</h3>
      <table className="w-full bg-white border rounded overflow-hidden text-sm">
        <thead className="bg-gray-100 text-left">
          <tr>
            <th className="p-2">Thời gian</th>
            <th className="p-2">Nguồn</th>
            <th className="p-2">File</th>
            <th className="p-2">Thêm</th>
            <th className="p-2">Cập nhật</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => (
            <tr key={b.id} className="border-t">
              <td className="p-2">
                {new Date(b.createdAt).toLocaleString('vi-VN')}
              </td>
              <td className="p-2">{b.source}</td>
              <td className="p-2">{b.fileName || '-'}</td>
              <td className="p-2">{b.created}</td>
              <td className="p-2">{b.updated}</td>
            </tr>
          ))}
          {!batches.length && (
            <tr>
              <td className="p-2 text-gray-400" colSpan={5}>
                Chưa có lần nhập nào.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
