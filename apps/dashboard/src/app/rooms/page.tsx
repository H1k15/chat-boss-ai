'use client';
import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';

interface Room { id: string; roomCode: string; area: string; price: number; status: string; roomType?: string }

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [err, setErr] = useState('');
  useEffect(() => {
    apiGet<Room[]>('/rooms').then(setRooms).catch((e) => setErr(String(e)));
  }, []);
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Phòng trọ</h2>
      {err && <p className="text-red-600 text-sm mb-2">Chưa kết nối được API: {err}</p>}
      <table className="w-full bg-white border rounded overflow-hidden text-sm">
        <thead className="bg-gray-100 text-left">
          <tr><th className="p-2">Mã</th><th className="p-2">Khu vực</th><th className="p-2">Giá</th><th className="p-2">Loại</th><th className="p-2">Trạng thái</th></tr>
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
