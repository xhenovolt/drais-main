'use client';
/**
 * /admin/users
 * User management table — Admin only.
 */
import React, { useEffect, useState } from 'react';
import { Users, CheckCircle, XCircle, RefreshCw, Search } from 'lucide-react';

interface User {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  is_active: number | boolean;
  is_verified: number | boolean;
  roles: string[];
  last_login_at: string | null;
  created_at: string;
}

export default function AdminUsersPage() {
  const [users,   setUsers]   = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [query,   setQuery]   = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch('/api/admin/users');
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message ?? data.error ?? 'Failed to load users');
      setUsers(data.data?.users ?? data.users ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const filtered = users.filter(u => {
    const q = query.toLowerCase();
    return (
      !q ||
      `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.roles.some(r => r.toLowerCase().includes(q))
    );
  });

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-GB', { dateStyle: 'short' }) : '—';

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">User Management</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {filtered.length} of {users.length} user{users.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button
          onClick={fetchUsers}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search users…"
          className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-400"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                {['Name', 'Email', 'Roles', 'Active', 'Verified', 'Last Login', 'Joined'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400 dark:text-slate-500">
                    {query ? 'No users match your search' : 'No users found'}
                  </td>
                </tr>
              ) : (
                filtered.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap">
                      {u.first_name} {u.last_name}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{u.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.length > 0 ? u.roles.map(r => (
                          <span key={r} className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                            {r}
                          </span>
                        )) : (
                          <span className="text-slate-400 text-xs italic">No role</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {u.is_active
                        ? <CheckCircle className="w-4 h-4 text-emerald-500" />
                        : <XCircle    className="w-4 h-4 text-slate-300 dark:text-slate-600" />}
                    </td>
                    <td className="px-4 py-3">
                      {u.is_verified
                        ? <CheckCircle className="w-4 h-4 text-emerald-500" />
                        : <XCircle    className="w-4 h-4 text-amber-400" />}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">
                      {fmt(u.last_login_at)}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">
                      {fmt(u.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
