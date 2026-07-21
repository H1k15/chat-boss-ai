'use client';
import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';

interface Customer { id: string; name?: string; phone?: string; areaNeed?: string; status: string }

export default function CustomersPage() {
  const [items, setItems] = useState<Customer[]>([]);
  const [err, setErr] = useState('');
  useEffect(() => {
    apiGet<Customer[]>('/customers').then(setItems).catch((e) => setErr(String(e)));
  }, []);
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Khách hàng</h2>
      {err && <p className="text-red-600 text-sm mb-2">Chưa kết nối được API: {err}</p>}
      <table className="w-full bg-white border rounded overflow-hidden text-sm">
        <thead className="bg-gray-100 text-left">
          <tr><th className="p-2">Tên</th><th className="p-2">SĐT</th><th className="p-2">Khu vực</th><th className="p-2">Trạng thái</th></tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id} className="border-t">
              <td className="p-2">{c.name || '(chưa rõ)'}</td>
              <td className="p-2">{c.phone || '-'}</td>
              <td className="p-2">{c.areaNeed || '-'}</td>
              <td className="p-2">{c.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
