'use client';
import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';

interface Overview { totalCustomers: number; withPhone: number; appointed: number; closed: number; closeRate: number }

export default function ReportsPage() {
  const [o, setO] = useState<Overview | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    apiGet<Overview>('/reports/overview').then(setO).catch((e) => setErr(String(e)));
  }, []);
  const cards = o
    ? [
        { label: 'Khách mới', value: o.totalCustomers },
        { label: 'Có SĐT', value: o.withPhone },
        { label: 'Đã hẹn', value: o.appointed },
        { label: 'Đã chốt', value: o.closed },
        { label: 'Tỷ lệ chốt', value: (o.closeRate * 100).toFixed(1) + '%' },
      ]
    : [];
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Báo cáo</h2>
      {err && <p className="text-red-600 text-sm mb-2">Chưa kết nối được API: {err}</p>}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-white border rounded-xl p-4">
            <div className="text-gray-500 text-sm">{c.label}</div>
            <div className="text-2xl font-bold">{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
