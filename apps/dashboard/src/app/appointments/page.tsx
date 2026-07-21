'use client';
import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';

interface Appt { id: string; appointmentTime: string; customer?: { name?: string }; room?: { roomCode?: string }; status: string }

export default function AppointmentsPage() {
  const [items, setItems] = useState<Appt[]>([]);
  const [err, setErr] = useState('');
  useEffect(() => {
    apiGet<Appt[]>('/appointments').then(setItems).catch((e) => setErr(String(e)));
  }, []);
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Lịch hẹn xem phòng</h2>
      {err && <p className="text-red-600 text-sm mb-2">Chưa kết nối được API: {err}</p>}
      <ul className="space-y-2">
        {items.map((a) => (
          <li key={a.id} className="bg-white border rounded p-3 text-sm">
            <b>{a.customer?.name || '(khách)'}</b> · Phòng {a.room?.roomCode || '-'} ·{' '}
            {new Date(a.appointmentTime).toLocaleString('vi-VN')} · {a.status}
          </li>
        ))}
      </ul>
    </div>
  );
}
