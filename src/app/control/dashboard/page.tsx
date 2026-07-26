'use client';

/** Control dashboard — the DRAIS platform at a glance. */
import React, { useState } from 'react';
import useSWR from 'swr';
import { School, Users, Briefcase, HardDrive, MessageSquare, Activity, AlertTriangle, CheckCircle, UserCog, Ban } from 'lucide-react';

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then(r => r.json());

export default function ControlDashboard() {
  const { data } = useSWR<any>('/api/control-center/overview', fetcher, { refreshInterval: 60_000 });

  const tiles = [
    { label: 'Schools', value: data?.schools?.total, sub: `${data?.schools?.active ?? 0} active · ${data?.schools?.suspended ?? 0} suspended`, icon: School },
    { label: 'Active Learners', value: data?.learners, sub: 'across all schools', icon: Users },
    { label: 'Active Staff', value: data?.staff, sub: 'across all schools', icon: Briefcase },
    { label: 'Devices Online', value: data ? `${data.devices?.online ?? 0}/${data.devices?.total ?? 0}` : undefined, sub: 'biometric devices', icon: HardDrive },
    { label: 'SMS (24h)', value: data?.sms_24h?.sent, sub: `${data?.sms_24h?.failed ?? 0} failed`, icon: MessageSquare },
    { label: 'Clock Anomalies Today', value: data?.clock_anomalies_today, sub: 'device time drift', icon: Activity },
  ];

  const healthy = data && data.problems?.length === 0;
  return (
    <div className="space-y-5">
      <ImpersonationsPanel />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {tiles.map(({ label, value, sub, icon: Icon }) => (
          <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-400">{label}</span>
              <Icon className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-bold text-slate-100 tabular-nums">{value == null ? '—' : typeof value === 'number' ? value.toLocaleString() : value}</div>
            <div className="text-[11px] text-slate-500">{sub}</div>
          </div>
        ))}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <p className="text-sm font-semibold text-slate-200 mb-2 flex items-center gap-1.5">
          {healthy ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-amber-400" />}
          {healthy ? 'System healthy — no problems detected' : `Recent problems (${data?.problems?.length ?? '…'})`}
        </p>
        {!healthy && (
          <ul className="space-y-1.5">
            {(data?.problems || []).map((p: any, i: number) => (
              <li key={i} className={`text-xs flex items-start gap-1.5 ${p.severity === 'critical' ? 'text-rose-300' : 'text-amber-200/90'}`}>
                <AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0" /> {p.text}
              </li>
            ))}
          </ul>
        )}
        {data?.app_version && <p className="text-[11px] text-slate-500 mt-3">Platform version: v{data.app_version}</p>}
      </div>
    </div>
  );
}

/** Live impersonations across the platform, with a per-session + all revoke. */
function ImpersonationsPanel() {
  const { data, mutate } = useSWR<any>('/api/control-center/impersonations', fetcher, { refreshInterval: 30_000 });
  const [busy, setBusy] = useState(false);
  const active = data?.active || [];
  if (active.length === 0) return null;

  const revoke = async (body: any) => {
    setBusy(true);
    try {
      const r = await fetch('/api/control-center/impersonations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j.success) alert(j.error || 'Revoke failed');
      await mutate();
    } finally { setBusy(false); }
  };
  const mins = (v: string) => Math.max(0, Math.round((new Date(v).getTime() - Date.now()) / 60000));

  return (
    <div className="rounded-xl border border-amber-700 bg-amber-500/10 p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-amber-200 flex items-center gap-1.5">
          <UserCog className="w-4 h-4" /> {active.length} active impersonation{active.length === 1 ? '' : 's'}
        </p>
        <button onClick={() => confirm('End ALL active impersonations now?') && revoke({ all: true })} disabled={busy}
          className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-white font-semibold disabled:opacity-50">
          <Ban className="w-3.5 h-3.5" /> Revoke all
        </button>
      </div>
      <div className="space-y-1.5">
        {active.map((s: any) => (
          <div key={s.id} className="flex items-center justify-between text-xs bg-slate-950/30 rounded-lg px-3 py-2">
            <span className="text-slate-200">
              <span className="font-medium">{s.operator || `#${s.operator_id}`}</span> → <span className="font-medium">{s.school || `school ${s.school_id}`}</span>
              <span className="text-slate-500"> as {s.operating_as} · {mins(s.expires_at)}m left{s.ip_address ? ` · ${s.ip_address}` : ''}</span>
            </span>
            <button onClick={() => revoke({ session_id: s.id })} disabled={busy}
              className="text-[11px] px-2 py-1 rounded bg-slate-800 hover:bg-rose-600/50 text-rose-300 disabled:opacity-50">Revoke</button>
          </div>
        ))}
      </div>
    </div>
  );
}
