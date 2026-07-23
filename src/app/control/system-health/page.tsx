'use client';

/** Platform system health — DB, SMS, biometric flow, versions. */
import React from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Activity, Database, MessageSquare, HardDrive, GitCommit, CheckCircle, AlertTriangle } from 'lucide-react';

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then(r => r.json());

export default function ControlSystemHealth() {
  const { data } = useSWR<any>('/api/control-center/overview', fetcher, { refreshInterval: 60_000 });
  const ok = data && data.problems?.length === 0;

  const rows = [
    { icon: Database, label: 'Database', value: data ? 'Reachable (all stats live)' : 'checking…', good: !!data },
    { icon: MessageSquare, label: 'SMS service', value: data ? `${data.sms_24h.sent} sent / ${data.sms_24h.failed} failed (24h)` : '…', good: data ? data.sms_24h.failed === 0 : undefined },
    { icon: HardDrive, label: 'Biometric communication', value: data ? `${data.devices.online}/${data.devices.total} devices online` : '…', good: data ? data.devices.online === data.devices.total : undefined },
    { icon: Activity, label: 'Clock integrity', value: data ? `${data.clock_anomalies_today} anomaly(ies) today` : '…', good: data ? data.clock_anomalies_today === 0 : undefined },
    { icon: GitCommit, label: 'Platform version', value: data?.app_version ? `v${data.app_version}` : '…', good: true },
  ];

  return (
    <div className="space-y-4">
      <div className={`rounded-xl p-4 border ${ok ? 'bg-emerald-500/10 border-emerald-700' : 'bg-amber-500/10 border-amber-700'}`}>
        <p className="text-sm font-semibold flex items-center gap-1.5">
          {ok ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-amber-400" />}
          <span className={ok ? 'text-emerald-300' : 'text-amber-200'}>{ok ? 'All systems operational' : `${data?.problems?.length ?? '…'} active problem(s)`}</span>
        </p>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl divide-y divide-slate-800">
        {rows.map(({ icon: Icon, label, value, good }) => (
          <div key={label} className="flex items-center justify-between px-4 py-3">
            <span className="flex items-center gap-2 text-sm text-slate-200"><Icon className="w-4 h-4 text-indigo-400" /> {label}</span>
            <span className={`text-xs ${good === false ? 'text-amber-300' : 'text-slate-400'}`}>{value}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">
        Per-school pipeline detail lives in each school's operations view. Release history: <Link href="/about" className="text-indigo-400 hover:underline">/about</Link> (school app).
      </p>
    </div>
  );
}
