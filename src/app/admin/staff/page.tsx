'use client';
/**
 * /admin/staff — Enterprise staff management
 * Shows all staff with: name, department, status, account (✅/❌), last login.
 * Actions: create account, disable/enable, reset password, edit, suspend.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  Users, Plus, RefreshCw, Search, UserCheck, UserX, KeyRound,
  Building2, ChevronDown, CheckCircle2, XCircle, Shield,
  MoreVertical, Eye, Pencil, Trash2, UserPlus,
} from 'lucide-react';

import Link from 'next/link';
import { showToast, confirmAction } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';

interface StaffMember {
  id: number;
  staff_no: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  status: string;
  department_id: number | null;
  department_name: string | null;
  hire_date: string | null;
  roles: string | null;
  user_id: number | null;
  account_active: number | boolean | null;
  last_login_at: string | null;
  must_change_password: boolean | null;
}

const STATUS_BADGE: Record<string, string> = {
  active:     'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  suspended:  'bg-amber-100   text-amber-700   dark:bg-amber-900/30   dark:text-amber-300',
  terminated: 'bg-red-100     text-red-700     dark:bg-red-900/30     dark:text-red-300',
  inactive:   'bg-slate-100   text-slate-500   dark:bg-slate-700      dark:text-slate-400',
};

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { dateStyle: 'medium' });
}

export default function AdminStaffPage() {
  const [staff,       setStaff]     = useState<StaffMember[]>([]);
  const [loading,     setLoading]   = useState(true);
  const [error,       setError]     = useState<string | null>(null);
  const [search,      setSearch]    = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [actionMenu,  setActionMenu] = useState<number | null>(null);
  const [modal,       setModal]     = useState<{ type: string; staff: StaffMember } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError,   setActionError]   = useState<string | null>(null);

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (search)      params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      const data = await apiFetch<{ staff: StaffMember[] }>(`/api/admin/staff?${params}`, { silent: true });
      setStaff(data.staff ?? []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [search, statusFilter]);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  async function accountAction(s: StaffMember, action: string) {
    setActionLoading(true);
    setActionError(null);
    try {
      const data = await apiFetch<{ temp_password?: string }>(`/api/admin/staff/${s.id}/account`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
        successMessage: `Account action '${action}' completed`,
      });
      if (data.temp_password) {
        showToast('info', `Temporary password: ${data.temp_password}`);
      }
      setModal(null);
      fetchStaff();
    } catch (e: any) { setActionError(e.message); }
    finally { setActionLoading(false); }
  }

  async function createAccount(s: StaffMember, username: string) {
    setActionLoading(true);
    setActionError(null);
    try {
      const data = await apiFetch<{ temp_password: string }>(`/api/admin/staff/${s.id}/account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
        successMessage: `Account created for ${username}`,
      });
      showToast('info', `Temporary password: ${data.temp_password}`);
      setModal(null);
      fetchStaff();
    } catch (e: any) { setActionError(e.message); }
    finally { setActionLoading(false); }
  }

  async function suspendStaff(s: StaffMember) {
    const label = s.status === 'suspended' ? 'Reactivate' : 'Suspend';
    if (!await confirmAction(`${label} ${s.first_name} ${s.last_name}?`, '', label)) return;
    const newStatus = s.status === 'suspended' ? 'active' : 'suspended';
    try {
      await apiFetch(`/api/admin/staff/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
        successMessage: `Staff ${newStatus === 'active' ? 'reactivated' : 'suspended'}`,
      });
      fetchStaff();
    } catch (e) { /* apiFetch showed error toast */ }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">Staff Management</h1>
            <p className="text-sm text-slate-500">{staff.length} staff members</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchStaff}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link href="/staff/add"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors">
            <Plus className="w-4 h-4" /> Add Staff
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, position…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="terminated">Terminated</option>
        </select>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">{error}</div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Department</th>
              <th className="px-4 py-3 text-left">Position</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-center">Account</th>
              <th className="px-4 py-3 text-left">Last Login</th>
              <th className="px-4 py-3 text-left">Roles</th>
              <th className="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : staff.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-400">No staff found</td>
              </tr>
            ) : staff.map(s => (
              <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800 dark:text-white">{s.first_name} {s.last_name}</div>
                  <div className="text-xs text-slate-400">{s.staff_no}</div>
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {s.department_name ? (
                    <span className="flex items-center gap-1">
                      <Building2 className="w-3 h-3" /> {s.department_name}
                    </span>
                  ) : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{s.position ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[s.status] ?? STATUS_BADGE.inactive}`}>
                    {s.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  {s.user_id ? (
                    s.account_active
                      ? <span title="Account active"><CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto" /></span>
                      : <span title="Account disabled"><XCircle className="w-5 h-5 text-red-400 mx-auto" /></span>
                  ) : (
                    <button
                      onClick={() => { setActionError(null); setModal({ type: 'create_account', staff: s }); }}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 transition-colors"
                    >
                      <UserPlus className="w-3 h-3" /> Create
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{fmt(s.last_login_at)}</td>
                <td className="px-4 py-3">
                  {s.roles
                    ? s.roles.split(', ').map(r => (
                        <span key={r} className="inline-block mr-1 mb-1 px-1.5 py-0.5 rounded text-xs bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                          {r}
                        </span>
                      ))
                    : <span className="text-slate-400 text-xs">No roles</span>
                  }
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="relative inline-block">
                    <button
                      onClick={() => setActionMenu(actionMenu === s.id ? null : s.id)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-colors"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {actionMenu === s.id && (
                      <div className="absolute right-0 top-8 z-20 w-48 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1">
                        <Link href={`/staff/${s.id}`} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">
                          <Eye className="w-4 h-4" /> View Profile
                        </Link>
                        <Link href={`/staff/${s.id}/edit`} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">
                          <Pencil className="w-4 h-4" /> Edit
                        </Link>
                        {s.user_id && (
                          <>
                            <button onClick={() => { setActionMenu(null); accountAction(s, s.account_active ? 'disable' : 'enable'); }}
                              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">
                              {s.account_active ? <UserX className="w-4 h-4 text-amber-500" /> : <UserCheck className="w-4 h-4 text-emerald-500" />}
                              {s.account_active ? 'Disable Account' : 'Enable Account'}
                            </button>
                            <button onClick={() => { setActionMenu(null); accountAction(s, 'reset_password'); }}
                              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">
                              <KeyRound className="w-4 h-4 text-purple-500" /> Reset Password
                            </button>
                          </>
                        )}
                        <hr className="my-1 border-slate-100 dark:border-slate-700" />
                        <button onClick={() => { setActionMenu(null); suspendStaff(s); }}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700">
                          {s.status === 'suspended'
                            ? <><CheckCircle2 className="w-4 h-4 text-emerald-500" /><span className="text-emerald-600">Reactivate</span></>
                            : <><XCircle className="w-4 h-4 text-red-500" /><span className="text-red-600">Suspend</span></>
                          }
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Account Modal */}
      {modal?.type === 'create_account' && (
        <CreateAccountModal
          staff={modal.staff}
          loading={actionLoading}
          error={actionError}
          onSubmit={(username) => createAccount(modal.staff, username)}
          onClose={() => setModal(null)}
        />
      )}

      {/* Close action menu on outside click */}
      {actionMenu !== null && (
        <div className="fixed inset-0 z-10" onClick={() => setActionMenu(null)} />
      )}
    </div>
  );
}

// ─── Create Account Modal ────────────────────────────────────────────────────
function CreateAccountModal({
  staff, loading, error, onSubmit, onClose,
}: {
  staff: StaffMember;
  loading: boolean;
  error: string | null;
  onSubmit: (username: string) => void;
  onClose: () => void;
}) {
  const [username, setUsername] = useState(
    staff.email?.split('@')[0] ?? `${staff.first_name.toLowerCase()}.${staff.last_name.toLowerCase()}`
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-100 text-blue-600">
            <UserPlus className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-slate-800 dark:text-white">Create Login Account</h2>
            <p className="text-sm text-slate-500">{staff.first_name} {staff.last_name}</p>
          </div>
        </div>

        {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 text-sm">{error}</div>}

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Username</label>
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1.5 text-xs text-slate-400">A temporary password will be generated. User must change it on first login.</p>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onSubmit(username)}
            disabled={loading || !username.trim()}
            className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating…' : 'Create Account'}
          </button>
        </div>
      </div>
    </div>
  );
}
