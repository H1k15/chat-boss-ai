'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import LogoutButton from './LogoutButton';
import { getRole } from '@/lib/api';

const nav = [
  { href: '/', label: 'Tổng quan' },
  { href: '/customers', label: 'Khách hàng' },
  { href: '/rooms', label: 'Phòng trọ' },
  { href: '/appointments', label: 'Lịch hẹn' },
  { href: '/care-tasks', label: 'Chăm sóc' },
  { href: '/templates', label: 'Mẫu câu AI' },
  { href: '/landmarks', label: 'Điểm mốc AI' },
  { href: '/import', label: 'Nhập phòng (Excel)' },
  { href: '/reports', label: 'Báo cáo' },
  { href: '/settings', label: 'Cấu hình' },
];

// Khung có sidebar. Trang /login không dùng khung này (đứng riêng, không menu).
export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Đọc role sau khi mount -> tránh lệch hydrate. SUPER_ADMIN thấy menu SaaS;
  // ADMIN (chủ trọ) thấy menu quản lý nhân viên.
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => setRole(getRole()), []);
  const items = [
    ...nav,
    ...(role === 'ADMIN'
      ? [{ href: '/members', label: '👥 Nhân viên' }]
      : []),
    ...(role === 'SUPER_ADMIN'
      ? [{ href: '/organizations', label: '🏢 Nhà trọ (SaaS)' }]
      : []),
  ];
  if (pathname === '/login') return <>{children}</>;

  return (
    <div className="flex">
      <aside className="w-56 min-h-screen bg-white border-r p-4 flex flex-col">
        <h1 className="font-bold text-lg mb-4">🏠 Chat Boss AI</h1>
        <nav className="flex flex-col gap-1">
          {items.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`px-3 py-2 rounded hover:bg-gray-100 ${
                pathname === n.href ? 'bg-gray-100 font-medium' : ''
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto">
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
