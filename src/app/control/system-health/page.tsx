'use client';

/**
 * Platform Health Center (P4) — the platform tells you which schools need
 * attention, instead of the founder discovering problems by accident.
 * Aggregate system rows (DB / SMS / biometric / clock / version) sit on top of
 * a per-school issue register scanned across every tenant.
 */
import React from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import {
  Activity, Database, MessageSquare, HardDrive, GitCommit, CheckCircle, AlertTriangle, AlertCircle, Info, ChevronRight,
} from 'lucide-react';

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then(r => r.json());

const SEV_STYLE: Record<string, { chip: string; icon: React.ReactNode }> = {
  critical: { chip: 'bg-rose-500/15 border-rose-800 text-rose-300', icon: <AlertCircle className="w-4 h-4 text-rose-400" /> },
  warning: { chip: 'bg-amber-500/15 border-amber-800 text-amber-200', icon: <AlertTriangle className="w-4 h-4 text-amber-400" /> },
  info: { chip: 'bg-sky-500/15 border-sky-800 text-sky-200', icon: <Info className="w-4 h-4 text-sky-400" /> },
};

export default function ControlSystemHealth() {
  const { data: ov } = useSWR<any>('/api/control-center/overview', fetcher, { refreshInterval: 60_000 });
  const { data: hp } = useSWR<any>('/api/control-center/health', fetcher, { refreshInterval: 60_000 });

  const rows = [
    { icon: Database, label: 'Database', value: ov ? 'Reachable (all stats live)' : 'checking…', good: !!ov },
    { icon: MessageSquare, label: 'SMS service', value: ov ? `${ov.sms_24h.sent} sent / ${ov.sms_24h.failed} failed (24h)` : '…', good: ov ? ov.sms_24h.failed === 0 : undefined },
    { icon: HardDrive, label: 'Biometric communication', value: ov ? `${ov.devices.online}/${ov.devices.total} devices online` : '…', good: ov ? ov.devices.online === ov.devices.total : undefined },
    { icon: Activity, label: 'Clock integrity', value: ov ? `${ov.clock_anomalies_today} anomaly(ies) today` : '…', good: ov ? ov.clock_anomalies_today === 0 : undefined },
    { icon: GitCommit, label: 'Platform version', value: ov?.app_version ? `v${ov.app_version}` : '…', good: true },
  ];

  const summary = hp?.summary;
  const attention = (hp?.schools || []).filter((s: any) => s.issues.length > 0);
  const allClear = hp && attention.length === 0;

  return (
    <div className="space-y-4">
      {/* Platform banner */}
      <div className={`rounded-xl p-4 border ${allClear ? 'bg-emerald-500/10 border-emerald-700' : 'bg-amber-500/10 border-amber-700'}`}>
        <p className="text-sm font-semibold flex items-center gap-1.5">
          {allClear ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-amber-400" />}
          <span className={allClear ? 'text-emerald-300' : 'text-amber-200'}>
            {!hp ? 'Scanning every school…'
              : allClear ? 'All schools operating normally'
                : `${attention.length} school(s) need attention`}
          </span>
        </p>
        {summary && !allClear && (
          <div className="flex gap-2 mt-2 text-[11px]">
            {summary.bySeverity.critical > 0 && <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300">{summary.bySeverity.critical} critical</span>}
            {summary.bySeverity.warning > 0 && <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-200">{summary.bySeverity.warning} warning</span>}
            {summary.bySeverity.info > 0 && <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-200">{summary.bySeverity.info} info</span>}
          </div>
        )}
      </div>

      {/* Aggregate system rows */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl divide-y divide-slate-800">
        {rows.map(({ icon: Icon, label, value, good }) => (
          <div key={label} className="flex items-center justify-between px-4 py-3">
            <span className="flex items-center gap-2 text-sm text-slate-200"><Icon className="w-4 h-4 text-indigo-400" /> {label}</span>
            <span className={`text-xs ${good === false ? 'text-amber-300' : 'text-slate-400'}`}>{value}</span>
          </div>
        ))}
      </div>

      {/* Per-school issue register */}
      {attention.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase">Schools needing attention</p>
          {attention.map((s: any) => (
            <Link key={s.id} href={`/control/schools/${s.id}`}
              className={`block rounded-xl border p-3 hover:border-indigo-600 transition-colors ${SEV_STYLE[s.worst]?.chip || 'bg-slate-900 border-slate-800'}`}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                  {SEV_STYLE[s.worst]?.icon} {s.name}
                  {s.status !== 'active' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 uppercase">{s.status}</span>}
                </span>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {s.issues.map((i: any, idx: number) => (
                  <span key={idx} className="text-[11px] px-1.5 py-0.5 rounded bg-slate-950/40 text-slate-300">{i.detail}</span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}

      <p className="text-[11px] text-slate-500">
        Monitors: licence, attendance flow, device offline, clock drift, failed SMS, sync. Click a school for its full operations view.
        Release history: <Link href="/about" className="text-indigo-400 hover:underline">/about</Link>.
      </p>
    </div>
  );
}
