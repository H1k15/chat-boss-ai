'use client';
import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPatch, getRole } from '@/lib/api';

interface Org {
  id: string;
  name: string;
  slug: string;
  plan: string;
  isActive: boolean;
  counts: { users: number; rooms: number; customers: number };
}

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [allowed, setAllowed] = useState<boolean | null>(null);

  // Form tạo nhà trọ mới.
  const [name, setName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setOrgs(await apiGet<Org[]>('/admin/organizations'));
    } catch (e) {
      setMsg('Không tải được danh sách: ' + String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const ok = getRole() === 'SUPER_ADMIN';
    setAllowed(ok);
    if (ok) void load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    setSaving(true);
    try {
      await apiPost('/admin/organizations', { name, adminEmail, adminPassword });
      setName('');
      setAdminEmail('');
      setAdminPassword('');
      setMsg('✓ Đã tạo nhà trọ mới.');
      await load();
    } catch (e) {
      setMsg('Lỗi tạo: ' + String(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(o: Org) {
    try {
      await apiPatch(`/admin/organizations/${o.id}/active`, { isActive: !o.isActive });
      await load();
    } catch (e) {
      setMsg('Lỗi cập nhật: ' + String(e));
    }
  }

  if (allowed === false)
    return <p className="text-red-600">Chỉ super-admin mới xem được trang này.</p>;

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold mb-1">🏢 Nhà trọ (SaaS)</h1>
      <p className="text-sm text-gray-500 mb-6">
        Quản lý các nhà trọ dùng hệ thống. Mỗi nhà trọ có dữ liệu và tài khoản riêng.
      </p>

      {/* Form tạo mới */}
      <form onSubmit={create} className="bg-white border rounded-xl p-4 mb-6">
        <h2 className="font-semibold mb-3">Tạo nhà trọ mới</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            className="border p-2 rounded"
            placeholder="Tên nhà trọ"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="border p-2 rounded"
            type="email"
            placeholder="Email admin"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            required
          />
          <input
            className="border p-2 rounded"
            type="password"
            placeholder="Mật khẩu admin"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            required
          />
        </div>
        <button
          className="mt-3 bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-60"
          disabled={saving}
        >
          {saving ? 'Đang tạo...' : 'Tạo nhà trọ + admin'}
        </button>
        {msg && <span className="ml-3 text-sm text-gray-600">{msg}</span>}
      </form>

      {/* Danh sách */}
      {loading ? (
        <p className="text-gray-500">Đang tải...</p>
      ) : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="p-3">Nhà trọ</th>
                <th className="p-3">Gói</th>
                <th className="p-3">NV</th>
                <th className="p-3">Phòng</th>
                <th className="p-3">Khách</th>
                <th className="p-3">Trạng thái</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id} className="border-t">
                  <td className="p-3">
                    <div className="font-medium">{o.name}</div>
                    <div className="text-xs text-gray-400">{o.slug}</div>
                  </td>
                  <td className="p-3">{o.plan}</td>
                  <td className="p-3">{o.counts.users}</td>
                  <td className="p-3">{o.counts.rooms}</td>
                  <td className="p-3">{o.counts.customers}</td>
                  <td className="p-3">
                    <span
                      className={
                        o.isActive ? 'text-green-600' : 'text-red-600'
                      }
                    >
                      {o.isActive ? '● Hoạt động' : '● Đã khoá'}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => toggle(o)}
                      className="text-sm border rounded px-3 py-1 hover:bg-gray-50"
                    >
                      {o.isActive ? 'Khoá' : 'Mở lại'}
                    </button>
                  </td>
                </tr>
              ))}
              {orgs.length === 0 && (
                <tr>
                  <td className="p-3 text-gray-400" colSpan={7}>
                    Chưa có nhà trọ nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
