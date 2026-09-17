'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { CheckCircle2, Loader2, Monitor, Shield, Smartphone, XCircle } from 'lucide-react';

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((r) => r.json());

function describe(userAgent: string | null) {
  const ua = String(userAgent || '');
  const browser = /Edg\//i.test(ua) ? 'Edge' : /OPR\//i.test(ua) ? 'Opera' : /Chrome\//i.test(ua) ? 'Chrome' : /Firefox\//i.test(ua) ? 'Firefox' : /Safari\//i.test(ua) ? 'Safari' : 'Unknown browser';
  const os = /Windows/i.test(ua) ? 'Windows' : /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iOS/i.test(ua) ? 'iOS' : /Mac OS X|Macintosh/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'Unknown OS';
  return { browser, os, mobile: /Android|iPhone|iPad|Mobile/i.test(ua) };
}

export default function ControlSessionsPage() {
  const { data, isLoading, mutate } = useSWR<any>('/api/control-center/sessions', fetcher, { refreshInterval: 30_000 });
  const [busy, setBusy] = useState<number | string | null>(null);
  const rows = data?.data || [];

  const revoke = async (id: number) => {
    if (!window.confirm('Revoke this Control Center session immediately?')) return;
    setBusy(id);
    try { await fetch(`/api/control-center/sessions/${id}`, { method: 'DELETE' }); await mutate(); } finally { setBusy(null); }
  };
  const revokeAction = async (action: 'revoke_others' | 'revoke_all') => {
    const prompt = action === 'revoke_all' ? 'Revoke every Control Center session, including this one?' : 'Revoke all other Control Center sessions?';
    if (!window.confirm(prompt)) return;
    setBusy(action);
    try {
      const r = await fetch('/api/control-center/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
      if (r.ok && action === 'revoke_all') window.location.assign('/control');
      else await mutate();
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-xl font-bold text-slate-100">Active sessions</h1><p className="text-sm text-slate-400 mt-1">Review and revoke sessions for your Control Center account.</p></div>
        <div className="flex gap-2 text-xs">
          <button onClick={() => revokeAction('revoke_others')} disabled={busy !== null} className="px-3 py-2 rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-50">Sign out other sessions</button>
          <button onClick={() => revokeAction('revoke_all')} disabled={busy !== null} className="px-3 py-2 rounded-lg bg-rose-700 text-white hover:bg-rose-600 disabled:opacity-50">Sign out all</button>
        </div>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl divide-y divide-slate-800">
        {isLoading && <div className="p-8 text-center"><Loader2 className="inline w-5 h-5 animate-spin text-indigo-400" /></div>}
        {!isLoading && rows.length === 0 && <div className="p-8 text-center text-sm text-slate-500">No active sessions.</div>}
        {rows.map((session: any) => {
          const device = describe(session.user_agent);
          return <div key={session.id} className="p-4 flex items-start gap-3">
            {device.mobile ? <Smartphone className="w-5 h-5 text-slate-400 mt-1" /> : <Monitor className="w-5 h-5 text-slate-400 mt-1" />}
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-100">{device.browser} · {device.os}{session.is_current && <span className="inline-flex items-center gap-1 text-emerald-300 text-xs"><CheckCircle2 className="w-3.5 h-3.5" /> This computer</span>}</div><div className="text-xs text-slate-400 mt-1">Logged in: {new Date(session.created_at).toLocaleString()} · Last active: {session.last_activity_at ? new Date(session.last_activity_at).toLocaleString() : 'Unknown'}</div><div className="text-[11px] text-slate-500 mt-1">IP: {session.ip || 'Unknown'} · Session ref: {session.session_ref}</div></div>
            {!session.is_current && <button onClick={() => revoke(session.id)} disabled={busy !== null} className="px-3 py-1.5 rounded-lg border border-rose-800 text-rose-300 text-xs hover:bg-rose-950 disabled:opacity-50">{busy === session.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Revoke'}</button>}
          </div>;
        })}
      </div>
      <p className="text-xs text-slate-500 flex items-center gap-2"><Shield className="w-4 h-4" /> Session references are non-secret identifiers. Raw session tokens are never displayed or stored.</p>
    </div>
  );
}