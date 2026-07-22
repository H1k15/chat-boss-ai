'use client';
import { logout } from '@/lib/api';

export default function LogoutButton() {
  return (
    <button
      onClick={logout}
      className="mt-4 text-sm text-gray-500 hover:text-red-600 text-left px-3 py-2"
    >
      Đăng xuất
    </button>
  );
}
