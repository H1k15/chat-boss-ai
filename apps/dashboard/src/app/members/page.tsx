'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';

interface Member {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  role: 'STAFF' | 'MANAGER' | 'ADMIN' | 'SUPER_ADMIN';
  isActive: boolean;
  activeSessions: number;
}
interface Status {
  planLabel: string;
  limits: { maxUsers: number | null; maxSeats: number | null };
}

const ROLE_LABEL: Record<string, string> = {
  STAFF: 'Nhân viên',
  MANAGER: 'Quản lý',
  ADMIN: 'Chủ trọ',
  SUPER_ADMIN: 'Quản trị hệ thống',
};

export default function MembersPage() {
  const [items, setItems] = useState<Member[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [err, setErr] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(() => {
    apiGet<Member[]>('/users').then(setItems).catch((e) => setErr(String(e)));
    apiGet<Status>('/license/status').then(setStatus).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const active = items.filter((m) => m.isActive && m.role !== 'ADMIN' && m.role !== 'SUPER_ADMIN');
  const maxUsers = status?.limits.maxUsers;
  const staffCount = items.filter((m) => m.isActive).length; // gồm cả chủ trọ
  const full = maxUsers != null && staffCount >= maxUsers;

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      load();
    } catch (e) {
      alert(String(e).replace(/^Error: /, ''));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Nhân viên</h2>
        <button
          onClick={() => setShowCreate(true)}
          disabled={full}
          className="px-4 py-2 rounded bg-blue-600 text-white text-sm disabled:opacity-40"
          title={full ? 'Đã đạt số tài khoản tối đa của gói' : ''}
        >
          + Thêm nhân viên
        </button>
      </div>

      {status && (
        <p className="text-sm text-gray-600 mb-3">
          Gói <b>{status.planLabel}</b> · Tài khoản đang dùng{' '}
          <b>{staffCount}</b>
          {maxUsers != null ? `/${maxUsers}` : ' (không giới hạn)'} · Thiết bị
          đăng nhập đồng thời tối đa{' '}
          <b>{status.limits.maxSeats ?? 'không giới hạn'}</b>
        </p>
      )}
      {full && (
        <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 text-sm mb-3">
          Đã đạt số tài khoản tối đa của gói. Khoá bớt tài khoản không dùng hoặc
          nâng gói để thêm.
        </p>
      )}
      {err && <p className="text-red-600 text-sm mb-2">Chưa kết nối được API: {err}</p>}

      <table className="w-full bg-white border rounded overflow-hidden text-sm">
        <thead className="bg-gray-100 text-left">
          <tr>
            <th className="p-2">Họ tên</th>
            <th className="p-2">Email</th>
            <th className="p-2">Vai trò</th>
            <th className="p-2">Thiết bị</th>
            <th className="p-2">Trạng thái</th>
            <th className="p-2 text-right">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {items.map((m) => {
            const locked = m.role === 'ADMIN' || m.role === 'SUPER_ADMIN';
            return (
              <tr key={m.id} className={`border-t ${m.isActive ? '' : 'opacity-50'}`}>
                <td className="p-2">{m.fullName}</td>
                <td className="p-2">{m.email}</td>
                <td className="p-2">{ROLE_LABEL[m.role] ?? m.role}</td>
                <td className="p-2">{m.activeSessions > 0 ? `${m.activeSessions} thiết bị` : '—'}</td>
                <td className="p-2">
                  {m.isActive ? (
                    <span className="text-green-700">Hoạt động</span>
                  ) : (
                    <span className="text-gray-500">Đã khoá</span>
                  )}
                </td>
                <td className="p-2 text-right whitespace-nowrap">
                  {locked ? (
                    <span className="text-gray-400 text-xs">— (được bảo vệ)</span>
                  ) : (
                    <>
                      <button
                        className="text-blue-600 hover:underline mr-3"
                        onClick={() => {
                          const pw = prompt(`Đặt mật khẩu mới cho ${m.fullName} (tối thiểu 6 ký tự):`);
                          if (pw) act(() => apiPatch(`/users/${m.id}`, { password: pw }));
                        }}
                      >
                        Đổi mật khẩu
                      </button>
                      <button
                        className="text-blue-600 hover:underline mr-3"
                        onClick={() =>
                          act(() =>
                            apiPatch(`/users/${m.id}`, {
                              role: m.role === 'STAFF' ? 'MANAGER' : 'STAFF',
                            }),
                          )
                        }
                      >
                        {m.role === 'STAFF' ? '↑ Quản lý' : '↓ Nhân viên'}
                      </button>
                      {m.isActive ? (
                        <button
                          className="text-red-600 hover:underline"
                          onClick={() => {
                            if (confirm(`Khoá tài khoản ${m.fullName}? Mọi phiên sẽ bị đăng xuất.`))
                              act(() => apiDelete(`/users/${m.id}`));
                          }}
                        >
                          Khoá
                        </button>
                      ) : (
                        <button
                          className="text-green-700 hover:underline"
                          onClick={() => act(() => apiPatch(`/users/${m.id}`, { isActive: true }))}
                        >
                          Mở lại
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
          {items.length === 0 && !err && (
            <tr>
              <td colSpan={6} className="p-4 text-center text-gray-400">
                Chưa có nhân viên. Bấm “Thêm nhân viên” để tạo tài khoản cho nhân viên của bạn.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onDone={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
      <p className="text-xs text-gray-400 mt-4">
        Nhân viên đăng nhập bằng email + mật khẩu này trên extension để dùng chung
        dữ liệu nhà trọ của bạn. {active.length} nhân viên đang hoạt động.
      </p>
    </div>
  );
}

function CreateModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'STAFF' | 'MANAGER'>('STAFF');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email.trim() || !password) {
      setErr('Nhập email và mật khẩu.');
      return;
    }
    setBusy(true);
    try {
      await apiPost('/users', {
        email: email.trim(),
        password,
        fullName: fullName.trim(),
        phone: phone.trim(),
        role,
      });
      onDone();
    } catch (e) {
      setErr(String(e).replace(/^Error: /, ''));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-5 w-96 max-w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-3">Thêm nhân viên</h3>
        <div className="flex flex-col gap-2 text-sm">
          <input className="border rounded px-3 py-2" placeholder="Họ tên" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <input className="border rounded px-3 py-2" placeholder="Email đăng nhập" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="border rounded px-3 py-2" placeholder="Số điện thoại (tuỳ chọn)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input className="border rounded px-3 py-2" type="password" placeholder="Mật khẩu (tối thiểu 6 ký tự)" value={password} onChange={(e) => setPassword(e.target.value)} />
          <select className="border rounded px-3 py-2" value={role} onChange={(e) => setRole(e.target.value as 'STAFF' | 'MANAGER')}>
            <option value="STAFF">Nhân viên</option>
            <option value="MANAGER">Quản lý</option>
          </select>
          {err && <p className="text-red-600 text-sm">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="px-3 py-2 text-sm" onClick={onClose}>Huỷ</button>
          <button className="px-4 py-2 rounded bg-blue-600 text-white text-sm disabled:opacity-50" disabled={busy} onClick={submit}>
            {busy ? 'Đang tạo…' : 'Tạo tài khoản'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Nhân viên sẽ được yêu cầu đổi mật khẩu ở lần đăng nhập đầu.
        </p>
      </div>
    </div>
  );
}
