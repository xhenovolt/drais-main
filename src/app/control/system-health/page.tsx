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
import { ExportButtons } from '@/app/control/_components/ExportButtons';

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
      {/* Founder alerts — schools that newly turned critical (pushed, deduped) */}
      <AlertsFeed />

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
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-400 uppercase">Schools needing attention</p>
            <ExportButtons filename="drais-health" rows={attention} columns={[
              { key: 'name', label: 'School' }, { key: 'status', label: 'Status' },
              { key: 'worst', label: 'Severity' },
              { key: 'issues', label: 'Issues', value: (r) => (r.issues || []).map((i: any) => i.detail).join('; ') },
            ]} />
          </div>
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

      {/* Maintenance mode (Phase 23) */}
      <MaintenancePanel />

      {/* Background jobs (Phase 18) */}
      <JobsPanel />

      <p className="text-[11px] text-slate-500">
        Monitors: licence, attendance flow, device offline, clock drift, failed SMS, sync. Click a school for its full operations view.
        Release history: <Link href="/about" className="text-indigo-400 hover:underline">/about</Link>.
      </p>
    </div>
  );
}

/** Founder alert feed — schools that newly turned critical, with acknowledge. */
function AlertsFeed() {
  const { data, mutate } = useSWR<any>('/api/control-center/alerts', fetcher, { refreshInterval: 60_000 });
  const alerts = (data?.alerts || []).filter((a: any) => !a.acknowledged_at);
  if (alerts.length === 0) return null;
  const ack = async (id: number) => {
    await fetch('/api/control-center/alerts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
    await mutate();
  };
  return (
    <div className="rounded-xl border border-rose-800 bg-rose-500/10 p-4">
      <p className="text-sm font-semibold text-rose-200 flex items-center gap-1.5 mb-2">
        <AlertCircle className="w-4 h-4" /> {alerts.length} platform alert{alerts.length === 1 ? '' : 's'}
      </p>
      <div className="space-y-1.5">
        {alerts.map((a: any) => (
          <div key={a.id} className="flex items-center justify-between gap-2 text-xs bg-slate-950/30 rounded-lg px-3 py-2">
            <span className="text-slate-200">
              {a.school_id
                ? <Link href={`/control/schools/${a.school_id}`} className="hover:underline">{a.message}</Link>
                : a.message}
              <span className="text-slate-500"> · {new Date(a.created_at).toLocaleString()}</span>
            </span>
            <button onClick={() => ack(a.id)} className="text-[11px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 whitespace-nowrap">Acknowledge</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Platform maintenance mode — off / banner / read-only, for safe deploys. */
function MaintenancePanel() {
  const { data, mutate } = useSWR<any>('/api/control-center/maintenance', fetcher, { refreshInterval: 30_000 });
  const [message, setMessage] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const mode = data?.mode || 'off';
  React.useEffect(() => { if (data?.message != null) setMessage(data.message); }, [data?.message]);
  const set = async (m: string) => {
    setBusy(true);
    try { await fetch('/api/control-center/maintenance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: m, message }) }); await mutate(); }
    finally { setBusy(false); }
  };
  const chip = (m: string, label: string, cls: string) => (
    <button onClick={() => set(m)} disabled={busy}
      className={`text-[11px] px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 ${mode === m ? cls : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>{label}</button>
  );
  return (
    <div className={`rounded-xl border p-4 ${mode === 'off' ? 'border-slate-800 bg-slate-900' : 'border-amber-700 bg-amber-500/10'}`}>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <p className="text-xs font-semibold text-slate-300 uppercase">Maintenance mode {mode !== 'off' && <span className="text-amber-300">· {mode.replace('_', '-')} ACTIVE</span>}</p>
        <div className="flex items-center gap-1.5">
          {chip('off', 'Off', 'bg-emerald-600 text-white')}
          {chip('banner', 'Banner', 'bg-sky-600 text-white')}
          {chip('read_only', 'Read-only', 'bg-rose-600 text-white')}
        </div>
      </div>
      <input value={message} onChange={e => setMessage(e.target.value)} placeholder="Message shown to schools (e.g. Scheduled maintenance 9–10pm)"
        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100" />
      <p className="text-[10px] text-slate-500 mt-2">Banner shows a notice to all schools; Read-only also blocks tenant writes (Control Center stays fully operational). Use around risky deploys/migrations.</p>
    </div>
  );
}

/** Background job queue — status + a manual drain (runs on the single cron too). */
function JobsPanel() {
  const { data, mutate } = useSWR<any>('/api/control-center/jobs', fetcher, { refreshInterval: 60_000 });
  const [busy, setBusy] = React.useState(false);
  const jobs = data?.jobs || [];
  const STATUS: Record<string, string> = {
    done: 'bg-emerald-500/20 text-emerald-300', pending: 'bg-sky-500/20 text-sky-300',
    running: 'bg-amber-500/20 text-amber-200', failed: 'bg-rose-500/20 text-rose-300',
  };
  const runNow = async () => {
    setBusy(true);
    try { await fetch('/api/control-center/jobs', { method: 'POST' }); await mutate(); }
    finally { setBusy(false); }
  };
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-400 uppercase">Background jobs</p>
        <button onClick={runNow} disabled={busy} className="text-[11px] px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-50">{busy ? 'Running…' : 'Run due now'}</button>
      </div>
      {jobs.length === 0 ? <p className="text-xs text-slate-500">No jobs yet — periodic work is enqueued and drained on the daily cron.</p> : (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {jobs.map((j: any) => (
            <div key={j.id} className="flex items-center justify-between text-xs">
              <span className="text-slate-300"><span className="font-mono text-slate-500">#{j.id}</span> {j.type}
                {j.attempts > 1 && <span className="text-slate-500"> · try {j.attempts}/{j.max_attempts}</span>}
                {j.last_error && <span className="text-rose-400/80"> · {String(j.last_error).slice(0, 60)}</span>}
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold ${STATUS[j.status] || 'bg-slate-700 text-slate-300'}`}>{j.status}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-slate-500 mt-2">The single Vercel cron dispatches all due jobs (dunning + future work) with retry/backoff — no extra cron is ever added.</p>
    </div>
  );
}
