'use client';

/**
 * DRAIS Sentinel — Control Centre.
 *
 * Serious infrastructure software, not a dashboard to admire: clarity over
 * decoration, matching the existing Platform Health Center's visual
 * language exactly (same slate palette, same density) so this reads as
 * part of Control Centre, not a bolted-on product.
 */
import React from 'react';
import useSWR from 'swr';
import {
  ShieldCheck, AlertTriangle, AlertCircle, Info, CheckCircle, Radio, Phone,
  FileSearch, Clock, ChevronDown, ChevronUp, Loader2,
} from 'lucide-react';

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then((r) => r.json());

const SEV_STYLE: Record<string, { chip: string; icon: React.ReactNode; label: string }> = {
  critical: { chip: 'bg-rose-500/15 border-rose-800 text-rose-300', icon: <AlertCircle className="w-3.5 h-3.5" />, label: 'CRITICAL' },
  high: { chip: 'bg-orange-500/15 border-orange-800 text-orange-300', icon: <AlertTriangle className="w-3.5 h-3.5" />, label: 'HIGH' },
  medium: { chip: 'bg-amber-500/15 border-amber-800 text-amber-200', icon: <AlertTriangle className="w-3.5 h-3.5" />, label: 'MEDIUM' },
  low: { chip: 'bg-sky-500/15 border-sky-800 text-sky-200', icon: <Info className="w-3.5 h-3.5" />, label: 'LOW' },
  info: { chip: 'bg-slate-500/15 border-slate-700 text-slate-300', icon: <Info className="w-3.5 h-3.5" />, label: 'INFO' },
};

const VERDICT_STYLE: Record<string, string> = {
  healthy: 'text-emerald-400', degraded: 'text-rose-400', unmonitored: 'text-slate-500',
};

export default function SentinelPage() {
  const { data: status, mutate: mutateStatus } = useSWR<any>('/api/control-center/sentinel/status', fetcher, { refreshInterval: 30_000 });
  const { data: incData, mutate: mutateIncidents } = useSWR<any>('/api/control-center/sentinel/incidents?status=active', fetcher, { refreshInterval: 30_000 });
  const incidents = incData?.incidents || [];

  return (
    <div className="space-y-4 max-w-5xl">
      <header>
        <h1 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-indigo-400" /> DRAIS Sentinel
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Reliability, anomaly-detection, and diagnostic layer. Sentinel v{status?.version?.sentinel ?? '…'} · Engine v{status?.version?.engine ?? '…'}
        </p>
      </header>

      <SelfStatusBanner status={status} />
      <AlertConfigPanel status={status} onSaved={mutateStatus} />
      <IncidentSummary status={status} />
      <IncidentsList incidents={incidents} onChanged={() => { mutateIncidents(); mutateStatus(); }} />
      <HeartbeatsPanel heartbeats={status?.heartbeats || []} />
      <DiagnosisPanel />
    </div>
  );
}

/** "DRAIS is healthy" vs "Sentinel is healthy enough to know" — kept visually distinct on purpose. */
function SelfStatusBanner({ status }: { status: any }) {
  const self = status?.self;
  if (!self) return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-xs text-slate-500 flex items-center gap-2">
      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking Sentinel's own status…
    </div>
  );
  const verdict = self.overall as string;
  const cls = verdict === 'healthy' ? 'border-emerald-800 bg-emerald-500/10' : verdict === 'degraded' ? 'border-rose-800 bg-rose-500/10' : 'border-slate-700 bg-slate-900';
  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Sentinel self-status — not DRAIS's status</p>
      <p className={`text-sm font-semibold ${VERDICT_STYLE[verdict] ?? 'text-slate-300'}`}>
        {verdict === 'healthy' && 'Sentinel can currently vouch for its own findings.'}
        {verdict === 'degraded' && 'Sentinel is DEGRADED — treat incidents/scores below with caution.'}
        {verdict === 'unmonitored' && 'Sentinel has not yet proven its own sweep is running — UNMONITORED, not healthy.'}
      </p>
      <ul className="mt-2 space-y-0.5 text-[11px] text-slate-400">
        {(self.reasons || []).map((r: string, i: number) => <li key={i}>· {r}</li>)}
      </ul>
    </div>
  );
}

function IncidentSummary({ status }: { status: any }) {
  const i = status?.incidents;
  if (!i) return null;
  const cells: Array<[string, number, string]> = [
    ['critical', i.critical, SEV_STYLE.critical.chip], ['high', i.high, SEV_STYLE.high.chip],
    ['medium', i.medium, SEV_STYLE.medium.chip], ['low', i.low, SEV_STYLE.low.chip], ['info', i.info, SEV_STYLE.info.chip],
  ];
  return (
    <div className="grid grid-cols-5 gap-2">
      {cells.map(([label, n, cls]) => (
        <div key={label} className={`rounded-lg border px-3 py-2.5 text-center ${cls}`}>
          <div className="text-lg font-bold tabular-nums">{n}</div>
          <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
        </div>
      ))}
    </div>
  );
}

function IncidentsList({ incidents, onChanged }: { incidents: any[]; onChanged: () => void }) {
  const [expanded, setExpanded] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState<number | null>(null);

  const act = async (id: number, action: string, reason?: string) => {
    setBusy(id);
    try {
      await fetch('/api/control-center/sentinel/incidents', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, action, reason }),
      });
      onChanged();
    } finally { setBusy(null); }
  };

  if (incidents.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-800 bg-emerald-500/10 p-4 text-sm text-emerald-300 flex items-center gap-2">
        <CheckCircle className="w-4 h-4" /> No active incidents.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 divide-y divide-slate-800">
      <p className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">Active incidents ({incidents.length})</p>
      {incidents.map((inc: any) => {
        const sev = SEV_STYLE[inc.severity] ?? SEV_STYLE.info;
        const isOpen = expanded === inc.id;
        return (
          <div key={inc.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3 cursor-pointer" onClick={() => setExpanded(isOpen ? null : inc.id)}>
              <div className="flex items-start gap-2 min-w-0">
                <span className={`shrink-0 mt-0.5 flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${sev.chip}`}>{sev.icon} {sev.label}</span>
                <div className="min-w-0">
                  <p className="text-sm text-slate-200 truncate">
                    {inc.schoolName ? <span className="text-slate-400">{inc.schoolName} · </span> : <span className="text-slate-500">Platform-wide · </span>}
                    {inc.module}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{inc.probableCause}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {inc.occurrenceCount > 1 && <span className="text-[10px] text-slate-500 tabular-nums">×{inc.occurrenceCount}</span>}
                {isOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
              </div>
            </div>
            {isOpen && (
              <div className="mt-3 pl-1 space-y-2 text-xs text-slate-400">
                <Row label="User impact" value={inc.userImpact} />
                <Row label="Technical impact" value={inc.technicalImpact} />
                <Row label="Recommended action" value={inc.recommendedAction} />
                <Row label="Confidence" value={`${inc.confidence}%`} />
                <Row label="First detected" value={new Date(inc.firstDetectedAt).toLocaleString()} />
                <Row label="Last detected" value={new Date(inc.lastDetectedAt).toLocaleString()} />
                {inc.evidence?.length > 0 && (
                  <div>
                    <p className="text-slate-500 mb-1">Evidence</p>
                    <ul className="space-y-0.5">
                      {inc.evidence.map((e: any, i: number) => <li key={i}>· {e.label}: <span className="text-slate-300">{String(e.value)}</span></li>)}
                    </ul>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-2">
                  <button disabled={busy === inc.id} onClick={() => act(inc.id, 'acknowledge')} className="text-[11px] px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-50">Acknowledge</button>
                  <button disabled={busy === inc.id} onClick={() => act(inc.id, 'resolve')} className="text-[11px] px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-50">Resolve</button>
                  <button disabled={busy === inc.id} onClick={() => act(inc.id, 'suppress', prompt('Reason for suppressing?') || 'No reason given')} className="text-[11px] px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 disabled:opacity-50">Suppress…</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return <p><span className="text-slate-500">{label}:</span> <span className="text-slate-300">{value}</span></p>;
}

function HeartbeatsPanel({ heartbeats }: { heartbeats: any[] }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900">
      <p className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Background job liveness</p>
      <div className="divide-y divide-slate-800">
        {heartbeats.length === 0 && <p className="px-4 py-3 text-xs text-slate-500">No heartbeats recorded yet — jobs are UNMONITORED until they run at least once.</p>}
        {heartbeats.map((h: any) => (
          <div key={h.name} className="px-4 py-2.5 flex items-center justify-between text-xs">
            <span className="text-slate-300 font-mono">{h.name}</span>
            <span className={`font-semibold uppercase ${VERDICT_STYLE[h.verdict] ?? 'text-slate-500'}`}>
              {h.verdict}{h.staleBy ? ` · ${Math.round(h.staleBy / 60)}m overdue` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AlertConfigPanel({ status, onSaved }: { status: any; onSaved: () => void }) {
  const [phone, setPhone] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const configured = status?.alerting?.configured;

  const save = async () => {
    setBusy(true);
    try {
      await fetch('/api/control-center/sentinel/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone, enabled: true }) });
      setPhone('');
      onSaved();
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Critical SMS alert path</p>
      <p className="text-xs text-slate-500 mb-3">
        Independent of Control Centre, cron, or the school notification queue. Fires directly when Sentinel records a HIGH/CRITICAL incident.
        Currently: {configured ? <span className="text-emerald-400">configured ({status.alerting.phoneMasked})</span> : <span className="text-amber-400">not configured — critical incidents will not page anyone</span>}.
      </p>
      <div className="flex gap-2">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+2567xxxxxxxx"
          className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100" />
        <button disabled={busy || !phone} onClick={save} className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50">Save</button>
      </div>
      <p className="text-[10px] text-slate-600 mt-2">Super Admin only. Use the test-alert action to verify delivery before relying on it.</p>
    </div>
  );
}

function DiagnosisPanel() {
  const { data: history, mutate } = useSWR<any>('/api/control-center/sentinel/diagnose', fetcher, { refreshInterval: 120_000 });
  const [running, setRunning] = React.useState(false);
  const [report, setReport] = React.useState<any>(null);

  const run = async () => {
    setRunning(true);
    try {
      const r = await fetch('/api/control-center/sentinel/diagnose', { method: 'POST' }).then((x) => x.json());
      setReport(r.report);
      mutate();
    } finally { setRunning(false); }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5"><FileSearch className="w-3.5 h-3.5" /> Full System Diagnosis</p>
        <button onClick={run} disabled={running} className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 flex items-center gap-1.5">
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Radio className="w-3.5 h-3.5" />} {running ? 'Running…' : 'Run Full System Diagnosis'}
        </button>
      </div>

      {report && <ReportView report={report} />}

      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-4 mb-1">History</p>
      <div className="divide-y divide-slate-800 text-xs">
        {(history?.reports || []).map((r: any) => (
          <div key={r.id} className="py-2 flex items-center justify-between">
            <span className="text-slate-400">{new Date(r.created_at).toLocaleString()} · {r.commit_sha?.slice(0, 8) ?? 'unknown'}</span>
            <span className="text-slate-300 font-semibold">{r.overall_score}/100 · {r.readiness}</span>
          </div>
        ))}
        {(!history?.reports || history.reports.length === 0) && <p className="text-slate-600 py-2">No diagnosis has been run yet.</p>}
      </div>
    </div>
  );
}

function ReportView({ report }: { report: any }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 mb-3 text-xs space-y-2">
      <p className="text-slate-200 font-semibold">{report.executiveVerdict}</p>
      <p className="text-slate-400">Score: <span className="text-slate-100 font-bold">{report.overallScore}/100</span> · Readiness: <span className="text-slate-100">{report.readiness}</span></p>
      {report.limitations?.length > 0 && (
        <div className="text-amber-300/80">
          {report.limitations.map((l: string, i: number) => <p key={i}>⚠ {l}</p>)}
        </div>
      )}
      <details>
        <summary className="cursor-pointer text-slate-400">Dimensions ({report.dimensions?.length ?? 0})</summary>
        <ul className="mt-1 space-y-1">
          {report.dimensions?.map((d: any, i: number) => (
            <li key={i}>
              <span className="text-slate-300">{d.dimension}:</span> {d.score ?? 'UNKNOWN'} <span className="text-slate-600">[{d.confidence}]</span> — {d.reason}
            </li>
          ))}
        </ul>
      </details>
      <details>
        <summary className="cursor-pointer text-slate-400">Top failure modes</summary>
        <ul className="mt-1 space-y-1">
          {report.topFailureModes?.map((m: any, i: number) => <li key={i}>{m.severity} — {m.mode} (prob: {m.probability}, impact: {m.impact})</li>)}
        </ul>
      </details>
    </div>
  );
}
