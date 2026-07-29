'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Clock,
  Lock,
  Plus,
  MoreVertical,
  Users,
  DoorClosed,
  UserRound,
  X,
  RotateCcw,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { apiGet, apiPost, getRole } from '@/lib/api';
import {
  buildChanges,
  expiryInfo,
  mergeTenant,
  slugPreview,
  randomPassword,
  PLANS,
  PLAN_LABEL,
  type ServerTenant,
  type DraftEdit,
  type NewTenant,
} from '@/lib/tenant-draft';

type StatusFilter = 'all' | 'active' | 'soon' | 'locked';

export default function OrganizationsPage() {
  const [server, setServer] = useState<ServerTenant[]>([]);
  const [edits, setEdits] = useState<Record<string, DraftEdit>>({});
  const [newTenants, setNewTenants] = useState<NewTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [extendFor, setExtendFor] = useState<string | null>(null);
  const [editFor, setEditFor] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ tenantId: string; slug: string }[] | null>(null);
  const [errorsByRef, setErrorsByRef] = useState<Record<string, string>>({});

  // Save modal fields
  const [saveNote, setSaveNote] = useState('');
  const [notify, setNotify] = useState(false);

  // Dọn hệ thống (purge tenant hết hạn/lưu trữ lâu)
  const [showPurge, setShowPurge] = useState(false);
  const [purgeInfo, setPurgeInfo] = useState<{ count: number; candidates: { id: string; name: string; slug: string }[] } | null>(null);
  const [purging, setPurging] = useState(false);
  const PURGE_DAYS = 90;

  async function load() {
    setLoading(true);
    setError('');
    try {
      setServer(await apiGet<ServerTenant[]>('/admin/tenants'));
    } catch (e) {
      setError('Không tải được danh sách nhà trọ.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const ok = getRole() === 'SUPER_ADMIN';
    setAllowed(ok);
    if (ok) void load();
  }, []);

  const changes = useMemo(() => buildChanges(server, edits, newTenants), [server, edits, newTenants]);
  const n = changes.length;
  const hasDraft = n > 0;

  // Cảnh báo khi rời trang còn thay đổi chưa lưu.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (hasDraft) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [hasDraft]);

  // Ctrl/Cmd+S mở modal xác nhận (KHÔNG tự lưu).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (hasDraft && !saving) setShowSave(true);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [hasDraft, saving]);

  // ===== Draft helpers (không gọi API) =====
  const patchEdit = useCallback(
    (id: string, patch: DraftEdit) => {
      setEdits((prev) => {
        const o = server.find((x) => x.id === id);
        const cur: DraftEdit = { ...prev[id], ...patch };
        if (o) {
          if (cur.plan === o.plan) delete cur.plan;
          if (cur.isActive === o.isActive) delete cur.isActive;
          if (cur.name === o.name) delete cur.name;
          if (cur.note === (o.note ?? '')) delete cur.note;
        }
        if (cur.addDays === 0) delete cur.addDays;
        const next = { ...prev };
        if (Object.keys(cur).length === 0) delete next[id];
        else next[id] = cur;
        return next;
      });
    },
    [server],
  );
  const bumpDays = (id: string, days: number) =>
    setEdits((prev) => {
      const cur: DraftEdit = { ...prev[id], addDays: (prev[id]?.addDays ?? 0) + days, setExpiry: undefined };
      if (cur.addDays === 0) delete cur.addDays;
      const next = { ...prev };
      next[id] = cur;
      return next;
    });
  const revert = (id: string) =>
    setEdits((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  const discardAll = async () => {
    setEdits({});
    setNewTenants([]);
    setErrorsByRef({});
    setMsg('');
    await load();
  };

  // Dọn hệ thống: xem trước (dry-run) rồi mới xoá thật (thao tác riêng, tức thời).
  async function openPurge() {
    try {
      const r = await apiPost<{ count: number; candidates: { id: string; name: string; slug: string }[] }>(
        '/admin/tenants/purge',
        { olderThanDays: PURGE_DAYS, dryRun: true },
      );
      setPurgeInfo(r);
      setShowPurge(true);
    } catch {
      setMsg('Không xem trước được danh sách dọn.');
    }
  }
  async function doPurge() {
    if (purging) return;
    setPurging(true);
    try {
      const r = await apiPost<{ purged: number }>('/admin/tenants/purge', { olderThanDays: PURGE_DAYS });
      setShowPurge(false);
      setPurgeInfo(null);
      await load();
      setMsg(`Đã xoá vĩnh viễn ${r.purged} nhà trọ để làm nhẹ hệ thống.`);
    } catch (e) {
      setMsg('Dọn thất bại: ' + String(e));
    } finally {
      setPurging(false);
    }
  }

  // ===== Save =====
  async function confirmSave() {
    if (saving) return; // chống double submit
    setSaving(true);
    setErrorsByRef({});
    try {
      const baseVersions: Record<string, string> = {};
      for (const c of changes)
        if (c.type !== 'CREATE_TENANT') {
          const o = server.find((x) => x.id === c.ref);
          if (o) baseVersions[o.id] = o.version;
        }
      const res = await apiPost<{
        ok?: boolean;
        results?: { ref: string; ok: boolean; error?: string }[];
        idempotentReplay?: boolean;
      }>('/admin/tenants/apply-changes', {
        requestId: crypto.randomUUID(),
        note: saveNote || undefined,
        notifyTenantAdmins: notify,
        baseVersions,
        changes: changes.map((c) => c.payload),
      });
      if (res.ok === false) {
        const errs: Record<string, string> = {};
        (res.results || []).filter((r) => !r.ok).forEach((r) => (errs[r.ref] = r.error || 'Lỗi'));
        setErrorsByRef(errs);
        setMsg('Có lỗi — chưa lưu gì. Xem chi tiết trong danh sách thay đổi.');
        return;
      }
      setShowSave(false);
      setEdits({});
      setNewTenants([]);
      setSaveNote('');
      setNotify(false);
      await load();
      setMsg(`Đã lưu ${n} thay đổi.`);
    } catch (e: unknown) {
      // 409 -> xung đột phiên bản (tenant đã bị người khác đổi sau khi tải trang).
      const m = String((e as Error)?.message || e);
      if (m.includes('409')) {
        setConflict([]);
        setShowSave(false);
      } else {
        setMsg('Lưu thất bại: ' + m);
      }
    } finally {
      setSaving(false);
    }
  }

  // ===== Display data =====
  const merged = server.map((o) => ({ o, m: mergeTenant(o, edits[o.id]), e: edits[o.id] }));
  const filtered = merged.filter(({ o, m }) => {
    if (q && !`${o.name} ${o.slug} ${o.adminEmail ?? ''}`.toLowerCase().includes(q.toLowerCase()))
      return false;
    const exp = expiryInfo(o.subscriptionExpiresAt, m.pendingAddDays, m.pendingSetExpiry);
    if (statusFilter === 'active') return m.isActive && exp.status !== 'expired';
    if (statusFilter === 'locked') return !m.isActive;
    if (statusFilter === 'soon') return exp.status === 'soon';
    return true;
  });
  const stats = {
    total: server.length + newTenants.length,
    active: merged.filter(({ m }) => m.isActive).length,
    soon: merged.filter(({ o, m }) => expiryInfo(o.subscriptionExpiresAt, m.pendingAddDays, m.pendingSetExpiry).status === 'soon').length,
    locked: merged.filter(({ m }) => !m.isActive).length,
  };

  if (allowed === false)
    return <p className="text-red-600 p-2">Chỉ super-admin mới xem được trang này.</p>;

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
        <div>
          <h1 className="text-2xl font-bold">Quản lý nhà trọ</h1>
          <p className="text-sm text-gray-500">
            Quản lý tài khoản, gói dịch vụ, thời hạn và trạng thái hoạt động của từng nhà trọ.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={discardAll}
            disabled={!hasDraft || saving}
            className="px-3 py-2 rounded-lg border text-sm disabled:opacity-40 hover:bg-gray-50"
          >
            Hủy thay đổi
          </button>
          <button
            onClick={() => setShowSave(true)}
            disabled={!hasDraft || saving}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-40 flex items-center gap-2"
          >
            {saving && <RefreshCw size={15} className="animate-spin" />}
            Lưu thay đổi{n > 0 ? ` (${n})` : ''}
          </button>
        </div>
      </div>
      {hasDraft && (
        <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-800 rounded px-2 py-0.5 mb-4">
          <AlertTriangle size={12} /> {n} thay đổi chưa lưu — nhớ bấm “Lưu thay đổi”.
        </span>
      )}
      {msg && <div className="text-sm text-gray-600 mb-3">{msg}</div>}

      {/* Stats — bấm để lọc */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {(
          [
            { key: 'all', label: 'Tổng nhà trọ', value: stats.total, Icon: Building2, color: 'text-gray-900', bg: 'bg-gray-100' },
            { key: 'active', label: 'Đang hoạt động', value: stats.active, Icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
            { key: 'soon', label: 'Sắp hết hạn (≤7 ngày)', value: stats.soon, Icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
            { key: 'locked', label: 'Tạm khóa', value: stats.locked, Icon: Lock, color: 'text-red-600', bg: 'bg-red-50' },
          ] as const
        ).map((s) => (
          <button
            key={s.key}
            onClick={() => setStatusFilter(s.key as StatusFilter)}
            className={`text-left bg-white border rounded-xl p-4 hover:shadow-sm transition ${statusFilter === s.key ? 'ring-2 ring-blue-500' : ''}`}
          >
            <div className="flex items-center justify-between">
              <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
              <span className={`p-2 rounded-lg ${s.bg} ${s.color}`}><s.Icon size={18} /></span>
            </div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <input
          className="border p-2 rounded-lg text-sm flex-1 min-w-[200px]"
          placeholder="Tìm theo tên, slug, email admin..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm flex items-center gap-1"
        >
          <Plus size={16} /> Tạo nhà trọ
        </button>
        <button
          onClick={openPurge}
          title="Xoá vĩnh viễn nhà trọ đã lưu trữ / hết hạn quá lâu để làm nhẹ hệ thống"
          className="px-3 py-2 rounded-lg border text-sm text-red-600 flex items-center gap-1 hover:bg-red-50"
        >
          <Trash2 size={16} /> Dọn hệ thống
        </button>
      </div>

      {/* Nhà trọ mới trong nháp */}
      {newTenants.length > 0 && (
        <div className="mb-4 space-y-1">
          {newTenants.map((no) => (
            <div key={no.tempId} className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm flex items-center gap-2">
              <span className="text-[10px] bg-blue-600 text-white rounded px-1.5 py-0.5">MỚI TẠO</span>
              <b>{no.name}</b> <span className="text-gray-400">/{slugPreview(no.name)}</span>
              · admin {no.admin.email} · {PLAN_LABEL[no.plan]}
              <span className="text-gray-400 italic">— sẽ được tạo khi lưu</span>
              {errorsByRef[no.tempId] && <span className="text-red-600 text-xs">— {errorsByRef[no.tempId]}</span>}
              <button onClick={() => setNewTenants((p) => p.filter((x) => x.tempId !== no.tempId))} className="ml-auto text-red-500"><X size={14} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Bảng */}
      <div className="bg-white border rounded-xl overflow-x-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-red-600 mb-3">{error}</p>
            <button onClick={load} className="px-3 py-2 border rounded-lg text-sm inline-flex items-center gap-1"><RefreshCw size={14} /> Tải lại</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            <Building2 size={32} className="mx-auto mb-2 opacity-50" />
            {server.length === 0 ? 'Chưa có nhà trọ nào. Bấm “Tạo nhà trọ”.' : 'Không có nhà trọ khớp bộ lọc.'}
          </div>
        ) : (
          <table className="w-full text-sm min-w-[860px]">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="p-3">Nhà trọ</th>
                <th className="p-3">Gói dịch vụ</th>
                <th className="p-3">Hạn dùng</th>
                <th className="p-3">Mức sử dụng</th>
                <th className="p-3">Trạng thái</th>
                <th className="p-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ o, m, e }) => {
                const exp = expiryInfo(o.subscriptionExpiresAt, m.pendingAddDays, m.pendingSetExpiry);
                const dirty = m.dirty;
                return (
                  <tr key={o.id} className={`border-t ${dirty ? 'bg-amber-50 border-l-4 border-l-amber-400' : ''}`}>
                    <td className="p-3">
                      <div className="font-medium flex items-center gap-2 flex-wrap">
                        {m.name}
                        {o.isSystem && <span className="text-[10px] bg-indigo-100 text-indigo-700 rounded px-1.5 py-0.5 inline-flex items-center gap-0.5"><ShieldCheck size={11} /> Hệ thống</span>}
                        {dirty && <span className="text-[10px] bg-amber-200 text-amber-800 rounded px-1.5 py-0.5">Chưa lưu</span>}
                        {m.archived && <span className="text-[10px] bg-gray-200 text-gray-600 rounded px-1.5 py-0.5">Lưu trữ</span>}
                      </div>
                      <div className="text-xs text-gray-400">/{o.slug}{o.adminEmail ? ` · ${o.adminEmail}` : ''}</div>
                      {errorsByRef[o.id] && <div className="text-xs text-red-600">{errorsByRef[o.id]}</div>}
                    </td>
                    <td className="p-3">
                      <select className="border rounded px-2 py-1 text-sm" value={m.plan} onChange={(ev) => patchEdit(o.id, { plan: ev.target.value })}>
                        {PLANS.map((p) => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}
                      </select>
                      {e?.plan && <div className="text-xs text-amber-700 mt-0.5">{PLAN_LABEL[o.plan]} → {PLAN_LABEL[e.plan]}</div>}
                    </td>
                    <td className="p-3">
                      <div className={exp.status === 'expired' || exp.status === 'soon' ? 'text-red-600' : 'text-gray-700'}>{exp.text}</div>
                      {exp.daysLeft !== null && <div className="text-xs text-gray-400">Còn {exp.daysLeft} ngày</div>}
                      {(m.pendingAddDays > 0 || m.pendingSetExpiry !== undefined) && <div className="text-xs text-amber-700">(nháp)</div>}
                      <button onClick={() => setExtendFor(o.id)} className="text-xs text-blue-600 mt-1 hover:underline">Gia hạn</button>
                    </td>
                    <td className="p-3 text-gray-600">
                      <div className="flex gap-3 text-xs">
                        <span className="inline-flex items-center gap-1"><Users size={13} /> {o.counts.users}</span>
                        <span className="inline-flex items-center gap-1"><DoorClosed size={13} /> {o.counts.rooms}</span>
                        <span className="inline-flex items-center gap-1"><UserRound size={13} /> {o.counts.customers}</span>
                      </div>
                    </td>
                    <td className="p-3">
                      <StatusBadge active={m.isActive} exp={exp.status} />
                      {e?.isActive !== undefined && <div className="text-xs text-amber-700">{o.isActive ? 'Hoạt động' : 'Khoá'} → {e.isActive ? 'Hoạt động' : 'Khoá'}</div>}
                    </td>
                    <td className="p-3 text-right relative">
                      {dirty && <button onClick={() => revert(o.id)} title="Hoàn tác" className="text-gray-400 hover:text-gray-700 mr-1 inline-flex"><RotateCcw size={15} /></button>}
                      <button onClick={() => setMenuOpen(menuOpen === o.id ? null : o.id)} className="p-1 rounded hover:bg-gray-100 inline-flex"><MoreVertical size={16} /></button>
                      {menuOpen === o.id && (
                        <ActionMenu
                          isSystem={o.isSystem}
                          active={m.isActive}
                          onClose={() => setMenuOpen(null)}
                          onEdit={() => { setEditFor(o.id); setMenuOpen(null); }}
                          onExtend={() => { setExtendFor(o.id); setMenuOpen(null); }}
                          onToggle={() => { patchEdit(o.id, { isActive: !m.isActive }); setMenuOpen(null); }}
                          onArchive={() => { patchEdit(o.id, { archive: true }); setMenuOpen(null); }}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Panel thay đổi chờ lưu (drawer phải) */}
      {hasDraft && (
        <div className="fixed right-4 bottom-4 w-[340px] max-h-[70vh] bg-white border shadow-xl rounded-xl flex flex-col z-30">
          <div className="p-3 border-b font-semibold text-sm flex items-center justify-between">
            Thay đổi chờ lưu ({n})
          </div>
          <div className="p-3 overflow-y-auto text-sm space-y-2 flex-1">
            {changes.map((c, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className={c.danger ? 'text-red-600' : 'text-gray-700'}>
                  {c.danger ? <AlertTriangle size={13} className="inline mt-0.5" /> : '•'}{' '}
                  <b>{c.tenantName}</b>: {c.label}
                  {c.oldValue && c.newValue ? ` (${c.oldValue} → ${c.newValue})` : c.newValue ? ` (${c.newValue})` : ''}
                </span>
                {c.type !== 'CREATE_TENANT' && (
                  <button onClick={() => revert(c.ref)} className="ml-auto text-gray-400 hover:text-gray-700"><RotateCcw size={13} /></button>
                )}
              </div>
            ))}
          </div>
          <div className="p-3 border-t flex gap-2">
            <button onClick={discardAll} className="flex-1 border rounded-lg py-2 text-sm">Hủy tất cả</button>
            <button onClick={() => setShowSave(true)} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm">Lưu ({n})</button>
          </div>
        </div>
      )}

      {/* ===== Modals ===== */}
      {showCreate && (
        <CreateTenantModal
          onClose={() => setShowCreate(false)}
          onAdd={(t) => { setNewTenants((p) => [...p, t]); setShowCreate(false); }}
        />
      )}
      {extendFor && (
        <ExtendModal
          onClose={() => setExtendFor(null)}
          onDays={(d) => { bumpDays(extendFor, d); setExtendFor(null); }}
          onDate={(iso) => { patchEdit(extendFor, { setExpiry: iso }); setExtendFor(null); }}
          onUnlimited={() => { patchEdit(extendFor, { setExpiry: null }); setExtendFor(null); }}
        />
      )}
      {editFor && (
        <EditInfoModal
          tenant={server.find((x) => x.id === editFor)!}
          edit={edits[editFor]}
          onClose={() => setEditFor(null)}
          onSave={(name, note) => { patchEdit(editFor, { name, note }); setEditFor(null); }}
        />
      )}
      {showSave && (
        <SaveModal
          changes={changes}
          note={saveNote}
          setNote={setSaveNote}
          notify={notify}
          setNotify={setNotify}
          saving={saving}
          onClose={() => setShowSave(false)}
          onConfirm={confirmSave}
        />
      )}
      {conflict && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-5">
            <h3 className="text-lg font-bold mb-2 text-red-600">Dữ liệu đã thay đổi</h3>
            <p className="text-sm text-gray-600 mb-3">Một quản trị viên khác đã cập nhật dữ liệu sau khi bạn tải trang. Tải lại để xem thay đổi mới nhất (các chỉnh sửa nháp của bạn vẫn giữ).</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConflict(null)} className="px-3 py-2 border rounded-lg text-sm">Đóng</button>
              <button onClick={async () => { setConflict(null); await load(); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Tải dữ liệu mới</button>
            </div>
          </div>
        </div>
      )}
      {showPurge && (
        <PurgeModal
          info={purgeInfo}
          days={PURGE_DAYS}
          purging={purging}
          onClose={() => !purging && setShowPurge(false)}
          onConfirm={doPurge}
        />
      )}
    </div>
  );
}

// ===== Sub-components =====
function StatusBadge({ active, exp }: { active: boolean; exp: string }) {
  if (!active) return <span className="text-red-600 inline-flex items-center gap-1"><Lock size={12} /> Tạm khóa</span>;
  if (exp === 'expired') return <span className="text-red-600">● Hết hạn</span>;
  if (exp === 'soon') return <span className="text-amber-600">● Sắp hết hạn</span>;
  return <span className="text-green-600">● Hoạt động</span>;
}

function ActionMenu(props: {
  isSystem: boolean;
  active: boolean;
  onClose: () => void;
  onEdit: () => void;
  onExtend: () => void;
  onToggle: () => void;
  onArchive: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={props.onClose} />
      <div className="absolute right-3 top-8 z-20 bg-white border rounded-lg shadow-lg w-52 py-1 text-sm text-left">
        <MenuItem onClick={props.onEdit}>Chỉnh sửa thông tin</MenuItem>
        <MenuItem onClick={props.onExtend}>Gia hạn</MenuItem>
        <div className="border-t my-1" />
        <MenuItem onClick={props.onToggle} disabled={props.isSystem && props.active} danger>
          {props.active ? 'Tạm khóa' : 'Mở khóa'}
        </MenuItem>
        <MenuItem onClick={props.onArchive} disabled={props.isSystem} danger>
          Lưu trữ nhà trọ
        </MenuItem>
      </div>
    </>
  );
}
function MenuItem({ children, onClick, disabled, danger }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed ${danger ? 'text-red-600' : ''}`}
    >
      {children}
    </button>
  );
}

function CreateTenantModal({ onClose, onAdd }: { onClose: () => void; onAdd: (t: NewTenant) => void }) {
  const [name, setName] = useState('');
  const [plan, setPlan] = useState('default');
  const [expiresAt, setExpiresAt] = useState('');
  const [note, setNote] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [mustChange, setMustChange] = useState(true);
  const [err, setErr] = useState('');

  function submit() {
    if (!name.trim() || !fullName.trim() || !email.trim() || !password) {
      setErr('Nhập đủ tên nhà trọ, họ tên + email + mật khẩu admin.');
      return;
    }
    onAdd({
      tempId: 'new-' + crypto.randomUUID().slice(0, 8),
      name: name.trim(),
      plan,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      note: note.trim(),
      admin: { fullName: fullName.trim(), email: email.trim(), phone: phone.trim(), password, mustChangePassword: mustChange },
    });
  }
  return (
    <Modal onClose={onClose} title="Tạo nhà trọ">
      <div className="space-y-3 text-sm">
        <div className="font-semibold text-gray-700">Thông tin nhà trọ</div>
        <input className="border p-2 rounded w-full" placeholder="Tên nhà trọ" value={name} onChange={(e) => setName(e.target.value)} />
        {name && <div className="text-xs text-gray-400">Mã tenant (slug): <b>/{slugPreview(name)}</b></div>}
        <div className="grid grid-cols-2 gap-2">
          <select className="border p-2 rounded" value={plan} onChange={(e) => setPlan(e.target.value)}>
            {PLANS.map((p) => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}
          </select>
          <input type="date" className="border p-2 rounded" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} title="Thời hạn (bỏ trống = không giới hạn)" />
        </div>
        <input className="border p-2 rounded w-full" placeholder="Ghi chú (tuỳ chọn)" value={note} onChange={(e) => setNote(e.target.value)} />

        <div className="font-semibold text-gray-700 pt-2">Tài khoản quản trị</div>
        <div className="grid grid-cols-2 gap-2">
          <input className="border p-2 rounded" placeholder="Họ tên admin" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <input className="border p-2 rounded" placeholder="Số điện thoại" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <input type="email" className="border p-2 rounded w-full" placeholder="Email admin" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
        <div className="flex gap-2">
          <input className="border p-2 rounded flex-1 font-mono" placeholder="Mật khẩu tạm thời" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button onClick={() => setPassword(randomPassword())} className="border rounded px-3 text-sm">Tạo ngẫu nhiên</button>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={mustChange} onChange={(e) => setMustChange(e.target.checked)} />
          Yêu cầu đổi mật khẩu ở lần đăng nhập đầu
        </label>
        {err && <div className="text-red-600 text-sm">{err}</div>}
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-3 py-2 border rounded-lg text-sm">Hủy</button>
        <button onClick={submit} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Thêm vào danh sách chờ lưu</button>
      </div>
    </Modal>
  );
}

function ExtendModal({ onClose, onDays, onDate, onUnlimited }: { onClose: () => void; onDays: (d: number) => void; onDate: (iso: string) => void; onUnlimited: () => void }) {
  const [date, setDate] = useState('');
  return (
    <Modal onClose={onClose} title="Gia hạn / đặt hạn dùng">
      <div className="flex gap-2 mb-3">
        {[30, 90, 365].map((d) => <button key={d} onClick={() => onDays(d)} className="flex-1 border rounded-lg py-2 text-sm hover:bg-gray-50">+{d} ngày</button>)}
      </div>
      <div className="flex gap-2 items-center mb-3">
        <input type="date" className="border p-2 rounded flex-1" value={date} onChange={(e) => setDate(e.target.value)} />
        <button disabled={!date} onClick={() => onDate(new Date(date).toISOString())} className="bg-blue-600 text-white rounded px-3 py-2 text-sm disabled:opacity-40">Đặt ngày</button>
      </div>
      <button onClick={onUnlimited} className="text-sm text-gray-600 hover:underline">Đặt không giới hạn</button>
    </Modal>
  );
}

function EditInfoModal({ tenant, edit, onClose, onSave }: { tenant: ServerTenant; edit?: DraftEdit; onClose: () => void; onSave: (name: string, note: string) => void }) {
  const [name, setName] = useState(edit?.name ?? tenant.name);
  const [note, setNote] = useState(edit?.note ?? tenant.note ?? '');
  return (
    <Modal onClose={onClose} title="Chỉnh sửa thông tin">
      <div className="space-y-3 text-sm">
        <input className="border p-2 rounded w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên nhà trọ" disabled={tenant.isSystem} />
        {tenant.isSystem && <div className="text-xs text-gray-400">Nhà trọ hệ thống — không đổi slug.</div>}
        <textarea className="border p-2 rounded w-full" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú" />
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-3 py-2 border rounded-lg text-sm">Hủy</button>
        <button onClick={() => onSave(name, note)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Thêm vào nháp</button>
      </div>
    </Modal>
  );
}

function SaveModal(props: {
  changes: ReturnType<typeof buildChanges>;
  note: string;
  setNote: (v: string) => void;
  notify: boolean;
  setNotify: (v: boolean) => void;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const tenants = new Set(props.changes.map((c) => c.tenantName)).size;
  const danger = props.changes.some((c) => c.danger);
  return (
    <Modal onClose={props.saving ? () => {} : props.onClose} title={`Xác nhận lưu ${props.changes.length} thay đổi`} wide>
      <p className="text-sm text-gray-500 mb-2">{tenants} nhà trọ bị ảnh hưởng · {props.changes.length} thay đổi. Áp dụng trong một giao dịch — lỗi ở bất kỳ mục nào thì không mục nào được lưu.</p>
      {danger && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2 mb-3 flex items-center gap-2"><AlertTriangle size={15} /> Có thao tác nhạy cảm (khoá / lưu trữ / giảm gói).</div>}
      <ul className="text-sm space-y-1 mb-4 max-h-52 overflow-y-auto">
        {props.changes.map((c, i) => (
          <li key={i} className={c.danger ? 'text-red-600' : 'text-gray-700'}>
            {c.danger ? '⚠️' : '•'} <b>{c.tenantName}</b>: {c.label}
            {c.oldValue && c.newValue ? ` (${c.oldValue} → ${c.newValue})` : c.newValue ? ` (${c.newValue})` : ''}
          </li>
        ))}
      </ul>
      <textarea className="border p-2 rounded w-full text-sm mb-2" rows={2} placeholder="Ghi chú quản trị (lưu vào audit log)" value={props.note} onChange={(e) => props.setNote(e.target.value)} />
      <label className="flex items-center gap-2 text-sm text-gray-600 mb-4">
        <input type="checkbox" checked={props.notify} onChange={(e) => props.setNotify(e.target.checked)} />
        Thông báo cho admin của các nhà trọ bị ảnh hưởng
      </label>
      <div className="flex justify-end gap-2">
        <button onClick={props.onClose} disabled={props.saving} className="px-3 py-2 border rounded-lg text-sm">Quay lại</button>
        <button onClick={props.onConfirm} disabled={props.saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-60 flex items-center gap-2">
          {props.saving && <RefreshCw size={15} className="animate-spin" />} Xác nhận và lưu
        </button>
      </div>
    </Modal>
  );
}

function PurgeModal({ info, days, purging, onClose, onConfirm }: {
  info: { count: number; candidates: { id: string; name: string; slug: string }[] } | null;
  days: number;
  purging: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal onClose={onClose} title="Dọn hệ thống">
      <p className="text-sm text-gray-500 mb-3">
        Xoá <b>vĩnh viễn</b> các nhà trọ đã lưu trữ hoặc hết hạn quá <b>{days} ngày</b> (kèm toàn bộ dữ liệu con) để làm nhẹ hệ thống. Không đụng nhà trọ hệ thống. <b className="text-red-600">Không thể hoàn tác.</b>
      </p>
      {!info ? (
        <p className="text-gray-400 text-sm">Đang tải...</p>
      ) : info.count === 0 ? (
        <p className="text-green-600 text-sm">Không có nhà trọ nào cần dọn.</p>
      ) : (
        <ul className="text-sm space-y-1 mb-4 max-h-52 overflow-y-auto">
          {info.candidates.map((c) => (
            <li key={c.id} className="text-gray-700"><Trash2 size={12} className="inline mr-1 text-red-500" /> <b>{c.name}</b> <span className="text-gray-400">/{c.slug}</span></li>
          ))}
        </ul>
      )}
      <div className="flex justify-end gap-2 mt-2">
        <button onClick={onClose} disabled={purging} className="px-3 py-2 border rounded-lg text-sm">Quay lại</button>
        <button
          onClick={onConfirm}
          disabled={purging || !info || info.count === 0}
          className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium disabled:opacity-40 flex items-center gap-2"
        >
          {purging && <RefreshCw size={15} className="animate-spin" />} Xoá {info?.count ?? 0} nhà trọ
        </button>
      </div>
    </Modal>
  );
}

function Modal({ children, onClose, title, wide }: { children: React.ReactNode; onClose: () => void; title: string; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className={`bg-white rounded-xl w-full ${wide ? 'max-w-lg' : 'max-w-md'} p-5 max-h-[85vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-3">{title}</h3>
        {children}
      </div>
    </div>
  );
}
