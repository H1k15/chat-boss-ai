import './globals.css';
import Link from 'next/link';

export const metadata = { title: 'Chat Boss AI — Dashboard' };

const nav = [
  { href: '/', label: 'Tổng quan' },
  { href: '/customers', label: 'Khách hàng' },
  { href: '/rooms', label: 'Phòng trọ' },
  { href: '/appointments', label: 'Lịch hẹn' },
  { href: '/reports', label: 'Báo cáo' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <div className="flex">
          <aside className="w-56 min-h-screen bg-white border-r p-4">
            <h1 className="font-bold text-lg mb-4">🏠 Chat Boss AI</h1>
            <nav className="flex flex-col gap-1">
              {nav.map((n) => (
                <Link key={n.href} href={n.href} className="px-3 py-2 rounded hover:bg-gray-100">
                  {n.label}
                </Link>
              ))}
            </nav>
          </aside>
          <main className="flex-1 p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
