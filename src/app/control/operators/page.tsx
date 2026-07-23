'use client';

/** Control Center operators — list + create (super admin only, audited). */
import React, { useCallback, useState } from 'react';
import useSWR from 'swr';
import { UserPlus, Loader2 } from 'lucide-react';

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then(r => r.json());

export default function ControlOperators() {
  const { data, mutate } = useSWR<any>('/api/control-center/users', fetcher);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'XHENVOLT_OPERATOR' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const create = useCallback(async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/control-center/users', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form),
      });
      const j = await r.json();
      setMsg(r.ok ? 'Operator created' : j.error || 'Failed');
      if (r.ok) { setForm({ name: '', email: '', password: '', role: 'XHENVOLT_OPERATOR' }); mutate(); }
    } finally { setBusy(false); }
  }, [form, mutate]);

  const input = 'px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-indigo-500';
  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <p className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-1.5"><UserPlus className="w-4 h-4 text-indigo-400" /> Create operator (super admin only)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className={input} />
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className={input} />
          <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Password (min 10)" type="password" className={input} />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={input}>
            <option value="XHENVOLT_OPERATOR">Operator</option>
            <option value="XHENVOLT_VIEWER">Viewer</option>
            <option value="XHENVOLT_SUPER_ADMIN">Super Admin</option>
          </select>
          <button onClick={create} disabled={busy} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Create
          </button>
        </div>
        {msg && <p className="text-xs text-slate-400 mt-2">{msg}</p>}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-slate-500 border-b border-slate-800">
            <tr><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-left">Email</th><th className="px-3 py-2 text-left">Role</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Last login</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {(data?.rows || []).map((u: any) => (
              <tr key={u.id}>
                <td className="px-3 py-2 text-slate-200">{u.name}</td>
                <td className="px-3 py-2 text-slate-400">{u.email}</td>
                <td className="px-3 py-2 text-indigo-300">{String(u.role).replace('XHENVOLT_', '')}</td>
                <td className="px-3 py-2 text-slate-400">{u.status}</td>
                <td className="px-3 py-2 text-slate-500">{u.last_login ? new Date(u.last_login).toLocaleString() : 'never'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
