'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getToken } from '@/lib/api';

// Chặn mọi trang khi chưa đăng nhập (trừ /login). Client-side: kiểm tra token
// trong localStorage, chưa có thì chuyển về /login. Không phải bảo mật thật
// (backend mới là nơi chặn bằng JWT) — chỉ để UX không hiện trang trống lỗi 401.
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (pathname === '/login') {
      setOk(true);
      return;
    }
    if (!getToken()) {
      router.replace('/login');
    } else {
      setOk(true);
    }
  }, [pathname, router]);

  if (!ok) return null; // tránh nháy nội dung trước khi kiểm tra xong
  return <>{children}</>;
}
