'use client';
import { useEffect, useState } from 'react';
import { apiPost } from '@/lib/api';

// Nhớ email đăng nhập gần nhất để gợi ý lần sau. KHÔNG lưu/gợi ý mật khẩu.
const LAST_EMAIL_KEY = 'lastLoginEmail';

export default function LoginPage() {
  // Điền THẲNG email làm giá trị thật (sửa được ngay), không để dạng placeholder.
  // Mặc định là tài khoản admin; nếu có email đăng nhập gần nhất thì ghi đè.
  const [email, setEmail] = useState('admin@chatboss.ai');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');

  // Đọc email gần nhất từ localStorage (chỉ chạy ở client, tránh lệch hydrate).
  useEffect(() => {
    const last = localStorage.getItem(LAST_EMAIL_KEY);
    if (last) setEmail(last);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const data = await apiPost<{
        accessToken: string;
        refreshToken: string;
        user: { fullName: string };
      }>('/auth/login', { email, password });
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem(LAST_EMAIL_KEY, email); // nhớ email cho lần sau
      setMsg('Đã đăng nhập: ' + data.user.fullName);
      window.location.href = '/';
    } catch (e) {
      // Hiện thông báo cụ thể từ backend (vd: vượt số thiết bị của Key).
      setMsg(e instanceof Error && e.message ? e.message : 'Đăng nhập thất bại');
    }
  }

  return (
    <form onSubmit={submit} className="max-w-sm mx-auto mt-20 bg-white p-6 rounded-xl border">
      <h2 className="text-xl font-bold mb-4">Đăng nhập</h2>
      {/* autoComplete="email": cho phép trình duyệt gợi ý email đã dùng. */}
      <input className="w-full border p-2 rounded mb-2" type="email" name="email"
        autoComplete="email" value={email}
        onChange={(e) => setEmail(e.target.value)} placeholder="Nhập email" />
      {/* autoComplete="new-password": trình duyệt/trình quản lý mật khẩu KHÔNG
          tự điền hay gợi ý mật khẩu đã lưu cho ô này. */}
      <input className="w-full border p-2 rounded mb-2" type="password" name="password"
        autoComplete="new-password" value={password}
        onChange={(e) => setPassword(e.target.value)} placeholder="Nhập mật khẩu" />
      <button className="w-full bg-blue-600 text-white p-2 rounded">Đăng nhập</button>
      <p className="text-sm text-gray-600 mt-2">{msg}</p>
    </form>
  );
}
