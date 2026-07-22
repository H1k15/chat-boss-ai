import './globals.css';
import AuthGuard from '@/components/AuthGuard';
import Shell from '@/components/Shell';

export const metadata = { title: 'Chat Boss AI — Dashboard' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <AuthGuard>
          <Shell>{children}</Shell>
        </AuthGuard>
      </body>
    </html>
  );
}
