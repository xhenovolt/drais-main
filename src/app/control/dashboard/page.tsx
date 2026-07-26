'use client';

/** Control dashboard — the DRAIS platform at a glance. */
import React from 'react';
import useSWR from 'swr';
import { School, Users, Briefcase, HardDrive, MessageSquare, Activity, AlertTriangle, CheckCircle } from 'lucide-react';

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
