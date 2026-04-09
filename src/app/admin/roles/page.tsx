'use client';
/**
 * /admin/roles — Roles list + Permission matrix + Staff assignment
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  Shield, Plus, RefreshCw, ChevronRight, Users as UsersIcon,
  Key, X, CheckSquare, Square, Loader2, Pencil, Trash2,
  ArrowLeft,
} from 'lucide-react';

import { showToast, confirmAction } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';

interface Role {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  is_system_role: boolean | number;
  user_count: number;
  permission_count: number;
}

interface Permission {
  id: number;
  code: string;
  name: string;
  module: string;
  action: string;
}

interface RoleDetail extends Role {
  permissions: Permission[];
  staff: { user_id: number; staff_name: string }[];
}

const MODULE_COLORS: Record<string, string> = {
  staff:       'bg-blue-50   text-blue-700   dark:bg-blue-900/30   dark:text-blue-300',
  departments: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  roles:       'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  audit:       'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  sessions:    'bg-teal-50   text-teal-700   dark:bg-teal-900/30   dark:text-teal-300',
  students:    'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  academics:   'bg-amber-50  text-amber-700  dark:bg-amber-900/30  dark:text-amber-300',
  finance:     'bg-pink-50   text-pink-700   dark:bg-pink-900/30   dark:text-pink-300',
};

export default function AdminRolesPage() {
  const [roles,    setRoles]    = useState<Role[]>([]);
  const [allPerms, setAllPerms] = useState<Record<string, Permission[]>>({});
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [selected, setSelected] = useState<RoleDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [savingPerms, setSavingPerms] = useState(false);
  const [pendingPerms, setPendingPerms] = useState<Set<number>>(new Set());
  const [permsDirty, setPermsDirty] = useState(false);

  const loadRoles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rData, pData] = await Promise.all([
        apiFetch<{ data: Role[] }>('/api/admin/roles', { silent: true }),
        apiFetch<{ data: Record<string, Permission[]> }>('/api/admin/permissions', { silent: true }),
      ]);
      setRoles(rData.data ?? []);
      setAllPerms(pData.data ?? {});
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadRoles(); }, [loadRoles]);

  async function selectRole(role: Role) {
    setLoadingDetail(true);
    setPermsDirty(false);
    try {
      const data = await apiFetch<{ data: RoleDetail }>(`/api/admin/roles/${role.id}`, { silent: true });
      setSelected(data.data);
      setPendingPerms(new Set((data.data.permissions ?? []).map((p: Permission) => p.id)));
    } catch (e: any) { setError(e instanceof Error ? e.message : 'Error loading role'); }
    finally { setLoadingDetail(false); }
  }

  function togglePerm(permId: number) {
    if (selected?.is_system_role) return;
    setPendingPerms(prev => {
      const next = new Set(prev);
      if (next.has(permId)) { next.delete(permId); } else { next.add(permId); }
      return next;
    });
    setPermsDirty(true);
  }

  async function savePermissions() {
    if (!selected) return;
    setSavingPerms(true);
    try {
      await apiFetch(`/api/admin/roles/${selected.id}?action=set_permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission_ids: Array.from(pendingPerms) }),
        successMessage: 'Permissions saved',
      });
      setPermsDirty(false);
      loadRoles();
    } catch (e: any) { setError(e.message); }
    finally { setSavingPerms(false); }
  }

  async function deleteRole(role: Role) {
    if (!await confirmAction(`Delete role "${role.name}"?`, 'This cannot be undone.', 'Delete')) return;
    try {
      await apiFetch(`/api/admin/roles/${role.id}`, {
        method: 'DELETE',
        successMessage: 'Role deleted',
      });
      if (selected?.id === role.id) setSelected(null);
      loadRoles();
    } catch (e: any) { showToast('error', e.message ?? 'Delete failed'); }
  }

  const modules = Object.keys(allPerms);

  return (
    <div className="flex h-full min-h-screen gap-0">
      {/* Left: Role list — full-width on mobile, sidebar on md+ */}
      <div className={`w-full md:w-72 flex-shrink-0 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex flex-col ${selected ? 'hidden md:flex' : 'flex'}`}>
        <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-500" />
            <span className="font-semibold text-sm text-slate-800 dark:text-white">Roles</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={loadRoles}
              className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => setShowCreate(true)}
              className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="mx-3 my-1 h-12 rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse" />
            ))
          ) : roles.map(role => (
            <button key={role.id}
              onClick={() => selectRole(role)}
              className={`w-full text-left px-4 py-3 hover:bg-white dark:hover:bg-slate-800 transition-colors group ${selected?.id === role.id ? 'bg-white dark:bg-slate-800 border-r-2 border-indigo-500' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-800 dark:text-white">{role.name}</span>
                {role.is_system_role ? (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">system</span>
                ) : (
                  <button onClick={e => { e.stopPropagation(); deleteRole(role); }}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 transition-all">
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                <span className="flex items-center gap-1"><Key className="w-3 h-3" />{role.permission_count}</span>
                <span className="flex items-center gap-1"><UsersIcon className="w-3 h-3" />{role.user_count}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: Permission matrix — full-width on mobile, flex-1 on md+ */}
      <div className={`flex-1 overflow-y-auto p-4 md:p-6 ${selected ? 'block' : 'hidden md:block'}`}>
        {!selected ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <div className="text-center">
              <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Select a role to manage permissions</p>
            </div>
          </div>
        ) : loadingDetail ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Role header */}
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelected(null)}
                    className="md:hidden p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <h2 className="text-xl font-bold text-slate-800 dark:text-white">{selected.name}</h2>
                  {selected.is_system_role && (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">System Role</span>
                  )}
                </div>
                {selected.description && <p className="text-sm text-slate-500 mt-0.5">{selected.description}</p>}
              </div>
              {!selected.is_system_role && permsDirty && (
                <button onClick={savePermissions} disabled={savingPerms}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50">
                  {savingPerms ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                  Save Permissions
                </button>
              )}
            </div>

            {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 text-sm">{error}</div>}

            {/* Permission grid by module */}
            {modules.length === 0 ? (
              <p className="text-slate-400">No permissions defined.</p>
            ) : modules.map(mod => {
              const perms = allPerms[mod] ?? [];
              const allChecked = perms.every(p => pendingPerms.has(p.id));
              const someChecked = perms.some(p => pendingPerms.has(p.id));
              return (
                <div key={mod} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className={`px-4 py-3 flex items-center justify-between ${MODULE_COLORS[mod] ?? 'bg-slate-50 dark:bg-slate-800'}`}>
                    <span className="font-medium text-sm capitalize">{mod}</span>
                    {!selected.is_system_role && (
                      <button
                        onClick={() => {
                          setPendingPerms(prev => {
                            const next = new Set(prev);
                            if (allChecked) perms.forEach(p => next.delete(p.id));
                            else perms.forEach(p => next.add(p.id));
                            return next;
                          });
                          setPermsDirty(true);
                        }}
                        className="text-xs underline-offset-1 hover:underline opacity-70"
                      >
                        {allChecked ? 'Deselect all' : 'Select all'}
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-slate-100 dark:bg-slate-700/30">
                    {perms.map(p => {
                      const checked = pendingPerms.has(p.id);
                      return (
                        <button
                          key={p.id}
                          onClick={() => togglePerm(p.id)}
                          disabled={!!selected.is_system_role}
                          className={`flex items-center gap-2 px-3 py-2.5 bg-white dark:bg-slate-800 text-left transition-colors
                            ${checked ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'}
                            ${!selected.is_system_role ? 'hover:bg-indigo-50 dark:hover:bg-indigo-900/20 cursor-pointer' : 'cursor-default'}
                          `}
                        >
                          {checked
                            ? <CheckSquare className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                            : <Square className="w-4 h-4 flex-shrink-0" />
                          }
                          <div>
                            <div className="text-xs font-medium">{p.action}</div>
                            <div className="text-xs opacity-60 truncate max-w-[12rem]">{p.name}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Assigned staff */}
            {selected.staff && selected.staff.length > 0 && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/60 flex items-center gap-2">
                  <UsersIcon className="w-4 h-4 text-slate-500" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Assigned users ({selected.staff.length})</span>
                </div>
                <div className="p-3 flex flex-wrap gap-2">
                  {selected.staff.map(su => (
                    <span key={su.user_id} className="px-2.5 py-1 rounded-full text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                      {su.staff_name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Role Modal */}
      {showCreate && (
        <CreateRoleModal
          onClose={() => setShowCreate(false)}
          onCreate={() => { setShowCreate(false); loadRoles(); }}
        />
      )}
    </div>
  );
}

function CreateRoleModal({ onClose, onCreate }: { onClose: () => void; onCreate: () => void }) {
  const [name,  setName]  = useState('');
  const [desc,  setDesc]  = useState('');
  const [saving, setSaving] = useState(false);
  const [err,   setErr]   = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setErr(null);
    try {
      await apiFetch('/api/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: desc || null }),
        successMessage: 'Role created',
      });
      onCreate();
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-slate-800 dark:text-white">Create Role</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"><X className="w-4 h-4" /></button>
        </div>
        {err && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 text-sm">{err}</div>}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Role Name <span className="text-red-500">*</span></label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
            <textarea rows={2} value={desc} onChange={e => setDesc(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
          <button onClick={submit} disabled={saving || !name.trim()}
            className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50">
            {saving ? 'Creating…' : 'Create Role'}
          </button>
        </div>
      </div>
    </div>
  );
}
