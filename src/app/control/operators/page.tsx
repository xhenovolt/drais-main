'use client';

/** Control Center operators — list + create (super admin only, audited). */
import React, { useCallback, useState } from 'react';
import useSWR from 'swr';
import { UserPlus, Loader2, ShieldCheck, KeyRound } from 'lucide-react';

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
      <TwoFactorCard />

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

/** Self-service optional 2FA for the signed-in operator (opt-in). */
function TwoFactorCard() {
  const { data, mutate } = useSWR<any>('/api/control-center/2fa', fetcher);
  const enabled = !!data?.enabled;
  const [enroll, setEnroll] = useState<{ secret: string; otpauth: string } | null>(null);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const begin = async () => { setBusy(true); setErr(null); try { const j = await (await fetch('/api/control-center/2fa', { method: 'POST' })).json(); setEnroll({ secret: j.secret, otpauth: j.otpauth }); } finally { setBusy(false); } };
  const confirm = async () => {
    setBusy(true); setErr(null);
    try {
      const j = await (await fetch('/api/control-center/2fa', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) })).json();
      if (j.success) { setRecovery(j.recovery); setEnroll(null); setCode(''); mutate(); } else setErr(j.error || 'Failed');
    } finally { setBusy(false); }
  };
  const disable = async () => {
    const c = prompt('Enter a current authenticator (or recovery) code to disable 2FA:'); if (!c) return;
    setBusy(true);
    try { const j = await (await fetch('/api/control-center/2fa', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: c }) })).json(); if (!j.success) alert(j.error || 'Failed'); mutate(); } finally { setBusy(false); }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-100 flex items-center gap-1.5"><ShieldCheck className={`w-4 h-4 ${enabled ? 'text-emerald-400' : 'text-slate-500'}`} /> Two-factor authentication (your account)</p>
        <span className={`text-[11px] px-2 py-0.5 rounded ${enabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-400'}`}>{enabled ? 'Enabled' : 'Optional — off'}</span>
      </div>

      {recovery && (
        <div className="mt-3 rounded-lg border border-amber-700 bg-amber-500/10 p-3">
          <p className="text-xs text-amber-200 font-medium flex items-center gap-1.5"><KeyRound className="w-3.5 h-3.5" /> Save these recovery codes now — shown only once:</p>
          <div className="grid grid-cols-2 gap-1 mt-2 font-mono text-xs text-slate-200">{recovery.map((r) => <span key={r}>{r}</span>)}</div>
          <button onClick={() => setRecovery(null)} className="mt-2 text-[11px] text-amber-300 hover:underline">I've saved them</button>
        </div>
      )}

      {!enabled && !enroll && !recovery && (
        <div className="mt-2">
          <p className="text-xs text-slate-400">Add an authenticator app as a second factor. Optional — nothing forces it.</p>
          <button onClick={begin} disabled={busy} className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium disabled:opacity-50">Enable 2FA</button>
        </div>
      )}

      {enroll && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-slate-300">1. Add this key to your authenticator app (or paste the URI):</p>
          <div className="font-mono text-sm text-indigo-300 break-all bg-slate-950/50 rounded px-2 py-1.5">{enroll.secret}</div>
          <div className="font-mono text-[10px] text-slate-500 break-all">{enroll.otpauth}</div>
          <p className="text-xs text-slate-300">2. Enter the 6-digit code it shows:</p>
          <div className="flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" inputMode="numeric" className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-sm w-32" />
            <button onClick={confirm} disabled={busy} className="text-xs px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50">Confirm</button>
            <button onClick={() => { setEnroll(null); setCode(''); }} className="text-xs px-3 py-2 text-slate-400">Cancel</button>
          </div>
          {err && <p className="text-xs text-rose-400">{err}</p>}
        </div>
      )}

      {enabled && !recovery && (
        <button onClick={disable} disabled={busy} className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-600/40 text-rose-300 disabled:opacity-50">Disable 2FA</button>
      )}
    </div>
  );
}
