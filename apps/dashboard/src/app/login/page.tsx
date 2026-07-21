'use client';
import { useState } from 'react';
import { apiPost } from '@/lib/api';

export default function LoginPage() {
  const [email, setEmail] = useState('admin@chatboss.ai');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const data = await apiPost<{ accessToken: string; user: { fullName: string } }>(
        '/auth/login',
        { email, password },
      );
      localStorage.setItem('accessToken', data.accessToken);
      setMsg('Đã đăng nhập: ' + data.user.fullName);
      window.location.href = '/';
    } catch {
      setMsg('Đăng nhập thất bại');
    }
  }

  return (
    <form onSubmit={submit} className="max-w-sm mx-auto mt-20 bg-white p-6 rounded-xl border">
      <h2 className="text-xl font-bold mb-4">Đăng nhập</h2>
      <input className="w-full border p-2 rounded mb-2" value={email}
        onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
      <input className="w-full border p-2 rounded mb-2" type="password" value={password}
        onChange={(e) => setPassword(e.target.value)} placeholder="Mật khẩu" />
      <button className="w-full bg-blue-600 text-white p-2 rounded">Đăng nhập</button>
      <p className="text-sm text-gray-600 mt-2">{msg}</p>
    </form>
  );
}
