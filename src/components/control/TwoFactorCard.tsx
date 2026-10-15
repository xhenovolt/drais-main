'use client';

/** Self-service optional 2FA for the signed-in operator (opt-in). Shown on Sessions (open to every operator) and Operators. */
import React, { useState } from 'react';
import useSWR from 'swr';
import { ShieldCheck, KeyRound } from 'lucide-react';

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then(r => r.json());

export default function TwoFactorCard() {
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
