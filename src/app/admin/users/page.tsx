'use client';
/**
 * /admin/users — Enterprise User Management
 * 13-column table: Name, Email, Roles, Department, Manager,
 *   Active, Verified, Online, Device, Session Duration, IP, Last Login, Joined
 * Real-time online status polling every 30 s.
 * Toast notifications for every action.
 * Device info tooltip, permissions panel on role badge click.
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Users, RefreshCw, Search, ChevronDown, Shield, X,
  MoreVertical, Power, Trash2, Lock, UserCheck, UserX,
  Monitor, Smartphone, Wifi, WifiOff, Copy, Check, UserPlus, Loader2,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { apiFetch } from '@/lib/apiClient';

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────
interface UserRow {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  is_active: boolean;
  is_verified: boolean;
  is_online: boolean;
  must_change_password: boolean;
  roles: string[];
  department_name: string | null;
  department_id: number | null;
  manager_name: string | null;
  ip_address: string | null;
  device_info: string | null;
  session_started_at: string | null;
  last_activity_at: string | null;
  last_login_at: string | null;
  created_at: string;
}

interface Permission { id: number; name: string; description?: string; }
interface RoleDetail  { id: number; name: string; permissions: Permission[]; }

interface DeviceTooltipState {
  open: boolean;
  x: number;
  y: number;
  user: UserRow | null;
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null;

function sessionDuration(startedAt: string | null): string {
  if (!startedAt) return '—';
  const ms  = Date.now() - new Date(startedAt).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60)   return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60)   return `${min}m`;
  const hr  = Math.floor(min / 60);
  const rem = min % 60;
  return rem ? `${hr}h ${rem}m` : `${hr}h`;
}

function parseDevice(deviceInfo: string | null): { browser: string; os: string; type: 'mobile' | 'desktop' } {
  if (!deviceInfo) return { browser: 'Unknown', os: 'Unknown', type: 'desktop' };
  const isMobile = /mobile|android|iphone|ipad/i.test(deviceInfo);
  const browser  =
    /chrome/i.test(deviceInfo)  ? 'Chrome'  :
    /firefox/i.test(deviceInfo) ? 'Firefox' :
    /safari/i.test(deviceInfo)  ? 'Safari'  :
    /edge/i.test(deviceInfo)    ? 'Edge'    : 'Browser';
  const os =
    /windows/i.test(deviceInfo) ? 'Windows' :
    /mac/i.test(deviceInfo)     ? 'macOS'   :
    /linux/i.test(deviceInfo)   ? 'Linux'   :
    /android/i.test(deviceInfo) ? 'Android' :
    /ios|iphone|ipad/i.test(deviceInfo) ? 'iOS' : 'Unknown';
  return { browser, os, type: isMobile ? 'mobile' : 'desktop' };
}

// ────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────
function OnlineBadge({ online }: { online: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
      online
        ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
    }`}>
      {online
        ? <><Wifi className="w-3 h-3" />Online</>
        : <><WifiOff className="w-3 h-3" />Offline</>
      }
    </span>
  );
}

function RoleBadge({ role, onClick }: { role: string; onClick: (role: string) => void }) {
  const colors: Record<string, string> = {
    super_admin: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
    admin:       'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    teacher:     'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
    finance:     'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  };
  const cls = colors[role.toLowerCase()] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
  return (
    <button
      onClick={() => onClick(role)}
      title="Click to view permissions"
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full cursor-pointer hover:opacity-80 transition-opacity ${cls}`}
    >
      <Shield className="w-3 h-3" />
      {role}
    </button>
  );
}

function ActionMenu({
  user,
  onAction,
}: {
  user: UserRow;
  onAction: (userId: number, action: string, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const name = `${user.first_name} ${user.last_name}`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 transition-colors"
        aria-label="Actions"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 py-1">
          {user.is_active ? (
            <button onClick={() => { setOpen(false); onAction(user.id, 'suspend', name); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20">
              <UserX className="w-4 h-4" />Suspend
            </button>
          ) : (
            <button onClick={() => { setOpen(false); onAction(user.id, 'activate', name); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
              <UserCheck className="w-4 h-4" />Activate
            </button>
          )}
          <button onClick={() => { setOpen(false); onAction(user.id, 'deactivate', name); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
            <Power className="w-4 h-4" />Deactivate + Kick
          </button>
          <button onClick={() => { setOpen(false); onAction(user.id, 'reset_password', name); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
            <Lock className="w-4 h-4" />Reset Password
          </button>
          <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
          <button onClick={() => { setOpen(false); onAction(user.id, 'remove', name); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
            <Trash2 className="w-4 h-4" />Remove User
          </button>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Permissions Modal
// ────────────────────────────────────────────────────────────────
function PermissionsModal({ roleName, onClose }: { roleName: string; onClose: () => void }) {
  const [role, setRole]   = useState<RoleDetail | null>(null);
  const [busy, setBusy]   = useState(true);
  const [err,  setErr]    = useState<string | null>(null);

  useEffect(() => {
    setBusy(true);
    setErr(null);
    apiFetch<{ data: any[] }>('/api/admin/roles', { silent: true })
      .then(resp => {
        const found = resp.data?.find((r: any) => r.name === roleName);
        if (!found) throw new Error('Role not found');
        return apiFetch<{ data: any }>(`/api/admin/roles/${found.id}`, { silent: true });
      })
      .then(d => setRole(d.data ?? null))
      .catch(() => setErr('Failed to load permissions'))
      .finally(() => setBusy(false));
  }, [roleName]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-500" />
            <h2 className="font-semibold text-gray-900 dark:text-white">{roleName} — Permissions</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">
          {busy && <div className="text-sm text-gray-500 text-center py-8">Loading…</div>}
          {err  && <div className="text-sm text-red-500 text-center py-8">{err}</div>}
          {!busy && !err && !role && <div className="text-sm text-gray-500 text-center py-8">Role not found.</div>}
          {role && (
            <div className="grid grid-cols-1 gap-2">
              {role.permissions.length === 0
                ? <p className="text-sm text-gray-400">No permissions assigned.</p>
                : role.permissions.map(p => (
                  <div key={p.id} className="flex items-start gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                    <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{p.name}</p>
                      {p.description && <p className="text-xs text-gray-500">{p.description}</p>}
                    </div>
                  </div>
                ))
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Confirm Dialog
// ────────────────────────────────────────────────────────────────
function ConfirmDialog({
  message, onConfirm, onCancel, dangerous,
}: { message: string; onConfirm: () => void; onCancel: () => void; dangerous?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-5">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">
            Cancel
          </button>
          <button onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded-lg font-medium text-white ${dangerous ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Temp Password Dialog
// ────────────────────────────────────────────────────────────────
function TempPasswordDialog({ password, onClose }: { password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Temporary Password</h3>
        <p className="text-xs text-gray-500 mb-4">Share this securely — user must change it on next login.</p>
        <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2 font-mono text-sm">
          <span className="flex-1 select-all">{password}</span>
          <button onClick={handleCopy} className="shrink-0 text-gray-400 hover:text-gray-600">
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        <button onClick={onClose}
          className="mt-4 w-full px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium">
          Done
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Main Page
// ────────────────────────────────────────────────────────────────
export default function AdminUsersPage() {
  const { showToast } = useToast();

  const [users,     setUsers]     = useState<UserRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [search,    setSearch]    = useState('');
  const [roleF,     setRoleF]     = useState('');
  const [deptF,     setDeptF]     = useState('');
  const [statusF,   setStatusF]   = useState('');

  // Online-status incremental update map
  const [onlineMap,  setOnlineMap]  = useState<Map<number, boolean>>(new Map());

  // Modals / overlays
  const [permRole,   setPermRole]   = useState<string | null>(null);
  const [deviceTip,  setDeviceTip]  = useState<DeviceTooltipState>({ open: false, x: 0, y: 0, user: null });
  const [confirm,    setConfirm]    = useState<{
    message: string; dangerous?: boolean; onConfirm: () => void;
  } | null>(null);
  const [tempPwd,    setTempPwd]    = useState<string | null>(null);

  // ── Fetch ─────────────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (roleF)  params.set('role', roleF);
      if (deptF)  params.set('department', deptF);
      if (statusF) params.set('status', statusF);
      const res  = await fetch(`/api/admin/users?${params}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Failed to load users');
      const rows: UserRow[] = data.data ?? [];
      setUsers(rows);
      // Seed online map
      const map = new Map<number, boolean>();
      rows.forEach(u => map.set(u.id, u.is_online));
      setOnlineMap(map);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [search, roleF, deptF, statusF]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // ── Real-time online polling every 30 s ───────────────────────
  useEffect(() => {
    const poll = async () => {
      try {
        const res  = await fetch('/api/admin/users?status=online');
        const data = await res.json();
        if (!data.success) return;
        const onlineIds = new Set<number>((data.data ?? []).map((u: UserRow) => u.id));
        setOnlineMap(prev => {
          const next = new Map(prev);
          // Mark all previously known IDs
          prev.forEach((_, id) => next.set(id, onlineIds.has(id)));
          // Add any newly online IDs
          onlineIds.forEach(id => next.set(id, true));
          return next;
        });
      } catch { /* silent */ }
    };
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, []);

  // ── Actions ──────────────────────────────────────────────────
  const handleAction = useCallback(async (userId: number, action: string, name: string) => {
    if (action === 'remove') {
      setConfirm({
        message: `Permanently remove "${name}"? This cannot be undone.`,
        dangerous: true,
        onConfirm: async () => {
          setConfirm(null);
          const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
          const d   = await res.json();
          if (res.ok && d.success) {
            showToast({ type: 'success', title: 'User removed', description: name });
            fetchUsers();
          } else {
            showToast({ type: 'error', title: 'Failed to remove', description: d.error ?? 'Unknown error' });
          }
        },
      });
      return;
    }

    const res  = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      showToast({ type: 'error', title: `Action failed`, description: data.error ?? 'Unknown error' });
      return;
    }

    const labels: Record<string, string> = {
      suspend:        'User suspended',
      activate:       'User activated',
      deactivate:     'User deactivated',
      reset_password: 'Password reset',
    };
    showToast({ type: 'success', title: labels[action] ?? 'Done', description: name });

    if (action === 'reset_password' && data.temp_password) {
      setTempPwd(data.temp_password);
    }
    fetchUsers();
  }, [fetchUsers, showToast]);

  // ── Derived filter lists ───────────────────────────────────────
  const allRoles  = Array.from(new Set(users.flatMap(u => u.roles))).sort();
  const allDepts  = Array.from(
    new Map(users.filter(u => u.department_id).map(u => [u.department_id, u.department_name])).entries()
  ).sort((a, b) => (a[1] ?? '').localeCompare(b[1] ?? ''));

  // Client-side filters for immediate response (server also filters on submit)
  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    if (q && !`${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(q)) return false;
    if (roleF   && !u.roles.some(r => r.toLowerCase() === roleF.toLowerCase())) return false;
    if (deptF   && String(u.department_id) !== deptF) return false;
    if (statusF === 'active'   && !u.is_active) return false;
    if (statusF === 'inactive' && u.is_active)  return false;
    if (statusF === 'online'   && !onlineMap.get(u.id)) return false;
    return true;
  });

  const onlineCount = filtered.filter(u => onlineMap.get(u.id)).length;

  const [showAddUser, setShowAddUser] = useState(false);

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="space-y-5 p-4 md:p-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-500" />
            User Management
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length} users · <span className="text-emerald-600 dark:text-emerald-400 font-medium">{onlineCount} online</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAddUser(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors">
            <UserPlus className="w-4 h-4" />
            Add User
          </button>
          <button onClick={fetchUsers} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name or email…"
            className="pl-8 pr-3 py-2 text-sm w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="relative">
          <select value={roleF} onChange={e => setRoleF(e.target.value)}
            className="appearance-none pl-3 pr-7 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Roles</option>
            {allRoles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <ChevronDown className="absolute right-1.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>

        <div className="relative">
          <select value={deptF} onChange={e => setDeptF(e.target.value)}
            className="appearance-none pl-3 pr-7 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Departments</option>
            {allDepts.map(([id, name]) => <option key={id} value={String(id)}>{name}</option>)}
          </select>
          <ChevronDown className="absolute right-1.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>

        <div className="relative">
          <select value={statusF} onChange={e => setStatusF(e.target.value)}
            className="appearance-none pl-3 pr-7 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="online">Online now</option>
          </select>
          <ChevronDown className="absolute right-1.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm px-4 py-3 rounded-lg border border-red-200 dark:border-red-800">
          {error}
        </div>
      )}

      {/* ── Table ── */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
        <table className="min-w-full text-sm divide-y divide-gray-100 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-800/60">
            <tr>
              {['Name', 'Email', 'Roles', 'Department', 'Manager',
                'Active', 'Verified', 'Online', 'Device', 'Duration',
                'IP', 'Last Login', 'Joined', ''].map(h => (
                <th key={h}
                  className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-50 dark:divide-gray-800">
            {loading && (
              <tr><td colSpan={14} className="text-center py-12 text-gray-400 text-sm">Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={14} className="text-center py-12 text-gray-400 text-sm">No users found.</td></tr>
            )}
            {!loading && filtered.map(user => {
              const isOnline  = onlineMap.get(user.id) ?? user.is_online;
              const device    = parseDevice(user.device_info);
              const duration  = sessionDuration(user.session_started_at);
              const lastLogin = fmtDate(user.last_login_at);
              const loginTime = fmtTime(user.last_login_at);

              return (
                <tr key={user.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">

                  {/* Name */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {user.first_name} {user.last_name}
                    </div>
                    {user.must_change_password && (
                      <span className="text-xs text-amber-500">Must change pw</span>
                    )}
                  </td>

                  {/* Email */}
                  <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300 whitespace-nowrap max-w-[180px] truncate">
                    {user.email}
                  </td>

                  {/* Roles */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="flex flex-wrap gap-1">
                      {user.roles.length === 0
                        ? <span className="text-xs text-gray-400">—</span>
                        : user.roles.map(r => (
                          <RoleBadge key={r} role={r} onClick={setPermRole} />
                        ))
                      }
                    </div>
                  </td>

                  {/* Department */}
                  <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                    {user.department_name ?? <span className="text-gray-400">—</span>}
                  </td>

                  {/* Manager */}
                  <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                    {user.manager_name || <span className="text-gray-400">—</span>}
                  </td>

                  {/* Active */}
                  <td className="px-3 py-2.5 text-center">
                    {user.is_active
                      ? <span className="w-2 h-2 bg-emerald-500 rounded-full inline-block" title="Active" />
                      : <span className="w-2 h-2 bg-red-400 rounded-full inline-block" title="Inactive" />
                    }
                  </td>

                  {/* Verified */}
                  <td className="px-3 py-2.5 text-center">
                    {user.is_verified
                      ? <span className="w-2 h-2 bg-blue-500 rounded-full inline-block" title="Verified" />
                      : <span className="w-2 h-2 bg-gray-300 dark:bg-gray-600 rounded-full inline-block" title="Unverified" />
                    }
                  </td>

                  {/* Online */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <OnlineBadge online={isOnline} />
                  </td>

                  {/* Device */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {user.device_info ? (
                      <button
                        onMouseEnter={e => {
                          const rect = (e.target as HTMLElement).getBoundingClientRect();
                          setDeviceTip({ open: true, x: rect.left, y: rect.bottom + 8, user });
                        }}
                        onMouseLeave={() => setDeviceTip(d => ({ ...d, open: false }))}
                        className="flex items-center gap-1 text-gray-600 dark:text-gray-300 hover:text-blue-600 transition-colors"
                      >
                        {device.type === 'mobile'
                          ? <Smartphone className="w-4 h-4" />
                          : <Monitor className="w-4 h-4" />
                        }
                        <span className="text-xs">{device.browser}</span>
                      </button>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>

                  {/* Session Duration */}
                  <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300 whitespace-nowrap text-xs font-mono">
                    {isOnline ? duration : <span className="text-gray-400">—</span>}
                  </td>

                  {/* IP */}
                  <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap text-xs font-mono">
                    {user.ip_address ?? <span className="text-gray-400">—</span>}
                  </td>

                  {/* Last Login */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="text-xs text-gray-700 dark:text-gray-300">{lastLogin}</div>
                    {loginTime && <div className="text-xs text-gray-400">{loginTime}</div>}
                  </td>

                  {/* Joined */}
                  <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                    {fmtDate(user.created_at)}
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-2.5 text-right">
                    <ActionMenu user={user} onAction={handleAction} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Device Tooltip ── */}
      {deviceTip.open && deviceTip.user && (() => {
        const d = parseDevice(deviceTip.user.device_info);
        return (
          <div
            style={{ position: 'fixed', left: deviceTip.x, top: deviceTip.y, zIndex: 9999 }}
            className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2.5 shadow-xl pointer-events-none min-w-40"
          >
            <div className="font-medium mb-1 text-gray-300">{d.type === 'mobile' ? '📱' : '🖥️'} Device Info</div>
            <div>Browser: <span className="text-white">{d.browser}</span></div>
            <div>OS: <span className="text-white">{d.os}</span></div>
            <div>IP: <span className="text-white font-mono">{deviceTip.user.ip_address ?? '—'}</span></div>
            {deviceTip.user.session_started_at && (
              <div>Session: <span className="text-white">{sessionDuration(deviceTip.user.session_started_at)}</span></div>
            )}
          </div>
        );
      })()}

      {/* ── Permissions Modal ── */}
      {permRole && <PermissionsModal roleName={permRole} onClose={() => setPermRole(null)} />}

      {/* ── Confirm Dialog ── */}
      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          dangerous={confirm.dangerous}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* ── Temp Password ── */}
      {tempPwd && <TempPasswordDialog password={tempPwd} onClose={() => setTempPwd(null)} />}

      {/* ── Add User Modal ── */}
      {showAddUser && (
        <AddUserModal
          onClose={() => setShowAddUser(false)}
          onCreated={() => { setShowAddUser(false); fetchUsers(); }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Add User Modal
// ────────────────────────────────────────────────────────────────
function AddUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', password: '', role_id: '' });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState<string | null>(null);
  const [roles,  setRoles]  = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    apiFetch<{ data: { id: number; name: string }[] }>('/api/admin/roles', { silent: true })
      .then(r => setRoles(r.data ?? []))
      .catch(() => {});
  }, []);

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function submit() {
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim() || !form.password || !form.role_id) {
      setErr('All fields are required.'); return;
    }
    setSaving(true);
    setErr(null);
    try {
      await apiFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, role_id: Number(form.role_id) }),
        successMessage: 'User created',
      });
      onCreated();
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-blue-500" />
            <h2 className="font-semibold text-gray-900 dark:text-white">Add User</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-4 h-4" />
          </button>
        </div>
        {err && <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">{err}</div>}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">First Name <span className="text-red-500">*</span></label>
            <input value={form.first_name} onChange={e => set('first_name', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name <span className="text-red-500">*</span></label>
            <input value={form.last_name} onChange={e => set('last_name', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Email <span className="text-red-500">*</span></label>
          <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Password <span className="text-red-500">*</span></label>
          <input type="password" value={form.password} onChange={e => set('password', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Role <span className="text-red-500">*</span></label>
          <select value={form.role_id} onChange={e => set('role_id', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Select a role…</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            {saving ? 'Creating…' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  );
}
