'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, RefreshCw, Trash2, X, AlertTriangle, Loader2, Filter,
  CheckCircle2, XCircle, Clock, Ban, GhostIcon,
} from 'lucide-react';
import { showToast } from '@/lib/toast';
import type { SnapshotRow, SnapshotStatus, SnapshotType } from '@/lib/snapshots/types';

const TYPE_OPTIONS: Array<SnapshotType | 'all'> = ['all', 'secular', 'theology', 'mixed'];
const STATUS_OPTIONS: Array<SnapshotStatus | 'all'> = [
  'all', 'generating', 'ready', 'failed', 'cancelled', 'stale',
];

export default function SnapshotManagementPage() {
  const [type, setType]                 = useState<SnapshotType | 'all'>('all');
  const [status, setStatus]             = useState<SnapshotStatus | 'all'>('all');
  const [rows, setRows]                 = useState<SnapshotRow[]>([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [busyId, setBusyId]             = useState<string | null>(null);
  const [showFlush, setShowFlush]       = useState(false);
  const [autoRefresh, setAutoRefresh]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (type !== 'all')   params.set('type', type);
      if (status !== 'all') params.set('status', status);
      params.set('limit', '200');
      const res = await fetch(`/api/snapshots/list?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `Load failed (${res.status})`);
      setRows(Array.isArray(json?.data) ? json.data : []);
    } catch (e: any) {
      setError(e?.message || 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [type, status]);

  useEffect(() => { load(); }, [load]);

  // Refresh every 5s while any row is in-flight (so users see stale-sweep
  // and active completions roll in without manual reload).
  const hasInflight = useMemo(() => rows.some(r => r.status === 'generating'), [rows]);
  useEffect(() => {
    if (!autoRefresh || !hasInflight) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [autoRefresh, hasInflight, load]);

  const counts = useMemo(() => {
    const out: Record<SnapshotStatus, number> = {
      generating: 0, ready: 0, failed: 0, cancelled: 0, stale: 0,
    };
    for (const r of rows) out[r.status] = (out[r.status] ?? 0) + 1;
    return out;
  }, [rows]);

  async function cancelRow(snapshotId: string) {
    setBusyId(snapshotId);
    try {
      const res = await fetch(`/api/snapshots/${encodeURIComponent(snapshotId)}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'cancelled from management dashboard' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `Cancel failed (${res.status})`);
      showToast('success', 'Generation cancelled');
      load();
    } catch (e: any) {
      showToast('error', e?.message || 'Cancel failed');
    } finally {
      setBusyId(null);
    }
  }

  async function deleteRow(snapshotId: string) {
    if (!confirm('Permanently delete this snapshot? This cannot be undone.')) return;
    setBusyId(snapshotId);
    try {
      const res = await fetch(`/api/snapshots/${encodeURIComponent(snapshotId)}`, {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Delete failed (${res.status})`);
      showToast('success', 'Snapshot deleted');
      load();
    } catch (e: any) {
      showToast('error', e?.message || 'Delete failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header className="flex items-start justify-between gap-3">
        <div>
          <Link
            href="/academics/report-cards"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Report Cards
          </Link>
          <h1 className="text-2xl font-semibold">Snapshot Management</h1>
          <p className="text-sm text-slate-500 mt-1">
            Operational view across all snapshot states. Cancel stuck generations,
            delete superseded snapshots, or flush a whole term/type at once.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <StatCard label="Generating" value={counts.generating} tone="amber"  icon={<Loader2 className="w-4 h-4 animate-spin" />} />
        <StatCard label="Ready"      value={counts.ready}      tone="emerald" icon={<CheckCircle2 className="w-4 h-4" />} />
        <StatCard label="Failed"     value={counts.failed}     tone="rose"    icon={<XCircle className="w-4 h-4" />} />
        <StatCard label="Cancelled"  value={counts.cancelled}  tone="slate"   icon={<Ban className="w-4 h-4" />} />
        <StatCard label="Stale"      value={counts.stale}      tone="violet"  icon={<GhostIcon className="w-4 h-4" />} />
      </section>

      <section className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-3 p-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-1.5 text-sm">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-slate-500">Filter:</span>
          </div>
          <label className="inline-flex items-center gap-1.5 text-sm">
            <span className="text-slate-500">Type</span>
            <select
              value={type}
              onChange={e => setType(e.target.value as SnapshotType | 'all')}
              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm"
            >
              {TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label className="inline-flex items-center gap-1.5 text-sm">
            <span className="text-slate-500">Status</span>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as SnapshotStatus | 'all')}
              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm"
            >
              {STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label className="inline-flex items-center gap-1.5 text-sm ml-auto">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh while in-flight
          </label>
          <button
            onClick={() => setShowFlush(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border border-rose-300 text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
          >
            <Trash2 className="w-4 h-4" /> Flush by criteria…
          </button>
        </div>

        {error && (
          <div className="m-3 rounded border border-rose-300 bg-rose-50 dark:bg-rose-950/40 p-3 text-sm text-rose-800 dark:text-rose-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Snapshot</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Term / Year</th>
                <th className="px-3 py-2">Generated</th>
                <th className="px-3 py-2 text-right">Counts</th>
                <th className="px-3 py-2">Duration</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">No snapshots match these filters.</td></tr>
              )}
              {rows.map(r => (
                <tr key={r.snapshotId} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2">
                    {r.status === 'ready' ? (
                      <Link
                        href={`/academics/report-cards/${r.type}/${encodeURIComponent(r.snapshotId)}`}
                        className="font-mono text-xs text-blue-600 hover:underline"
                        title={r.snapshotId}
                      >
                        {r.snapshotId.slice(0, 8)}…
                      </Link>
                    ) : (
                      <span className="font-mono text-xs text-slate-500" title={r.snapshotId}>
                        {r.snapshotId.slice(0, 8)}…
                      </span>
                    )}
                    {r.errorMessage && (
                      <div className="text-[11px] text-rose-600 truncate max-w-[260px]" title={r.errorMessage}>
                        {r.errorMessage}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">{r.type}</td>
                  <td className="px-3 py-2">T{r.termId} / Y{r.yearId}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div>{new Date(r.generatedAt).toLocaleString()}</div>
                    <div className="text-[11px] text-slate-500">by user #{r.generatedBy}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <div>{r.classCount} cls / {r.studentCount} stu</div>
                    <div className="text-[11px] text-slate-500">{r.resultCount} rows</div>
                  </td>
                  <td className="px-3 py-2 text-slate-500">
                    {r.generationMs != null ? `${(r.generationMs / 1000).toFixed(1)}s` : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {r.status === 'generating' && (
                        <button
                          onClick={() => cancelRow(r.snapshotId)}
                          disabled={busyId === r.snapshotId}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                          title="Cancel this in-flight generation"
                        >
                          <X className="w-3 h-3" /> Cancel
                        </button>
                      )}
                      <button
                        onClick={() => deleteRow(r.snapshotId)}
                        disabled={busyId === r.snapshotId}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        title="Permanently delete this snapshot"
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showFlush && (
        <FlushModal
          onClose={() => setShowFlush(false)}
          onDone={() => { setShowFlush(false); load(); }}
          defaultType={type === 'all' ? undefined : type}
        />
      )}
    </div>
  );
}

function StatCard(props: {
  label: string; value: number; tone: 'amber'|'emerald'|'rose'|'slate'|'violet';
  icon: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    amber:   'border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
    emerald: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
    rose:    'border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200',
    slate:   'border-slate-300 bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-200',
    violet:  'border-violet-300 bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200',
  };
  return (
    <div className={`rounded border p-3 ${tones[props.tone]}`}>
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider opacity-80 flex items-center gap-1.5">
          {props.icon} {props.label}
        </div>
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{props.value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: SnapshotStatus }) {
  const map: Record<SnapshotStatus, { label: string; cls: string; icon: React.ReactNode }> = {
    generating: { label: 'Generating', cls: 'bg-amber-100  text-amber-800 dark:bg-amber-900/40 dark:text-amber-200', icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    ready:      { label: 'Ready',      cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200', icon: <CheckCircle2 className="w-3 h-3" /> },
    failed:     { label: 'Failed',     cls: 'bg-rose-100   text-rose-800 dark:bg-rose-900/40 dark:text-rose-200', icon: <XCircle className="w-3 h-3" /> },
    cancelled:  { label: 'Cancelled',  cls: 'bg-slate-100  text-slate-700 dark:bg-slate-800 dark:text-slate-200', icon: <Ban className="w-3 h-3" /> },
    stale:      { label: 'Stale',      cls: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200', icon: <Clock className="w-3 h-3" /> },
  };
  const v = map[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${v.cls}`}>
      {v.icon} {v.label}
    </span>
  );
}

function FlushModal(props: {
  onClose: () => void;
  onDone:  () => void;
  defaultType?: SnapshotType;
}) {
  const [type, setType]             = useState<SnapshotType | ''>(props.defaultType ?? '');
  const [termId, setTermId]         = useState<string>('');
  const [yearId, setYearId]         = useState<string>('');
  const [resultTypeId, setResultTypeId] = useState<string>('');
  const [includeStatuses, setIncludeStatuses] = useState<Record<Exclude<SnapshotStatus,'generating'>, boolean>>({
    ready: false, failed: true, cancelled: true, stale: true,
  });
  const [cancelInflight, setCancelInflight] = useState(false);
  const [busy, setBusy]             = useState(false);
  const [error, setError]           = useState('');

  const hasFilter =
    type !== '' || termId !== '' || yearId !== '' || resultTypeId !== '';

  async function submit() {
    if (!hasFilter) {
      setError('Select at least one filter (type / term / year).');
      return;
    }
    const statuses = (Object.keys(includeStatuses) as Array<keyof typeof includeStatuses>)
      .filter(k => includeStatuses[k]);
    if (statuses.length === 0 && !cancelInflight) {
      setError('Select at least one status to flush, or enable "Cancel in-flight".');
      return;
    }
    if (!confirm(`Permanently delete all matching snapshots? This cannot be undone.`)) return;

    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/snapshots/flush', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type:         type || undefined,
          termId:       termId ? Number(termId) : undefined,
          yearId:       yearId ? Number(yearId) : undefined,
          resultTypeId: resultTypeId === '' ? undefined : (resultTypeId === 'null' ? null : Number(resultTypeId)),
          status:       statuses,
          cancelInflight,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `Flush failed (${res.status})`);
      showToast('success', `Flushed ${json.removed} snapshot(s)${json.cancelledInflight ? `, cancelled ${json.cancelledInflight} in-flight` : ''}`);
      props.onDone();
    } catch (e: any) {
      setError(e?.message || 'Flush failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={props.onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 p-3">
          <div className="flex items-center gap-2 font-semibold">
            <Trash2 className="w-4 h-4 text-rose-600" /> Flush snapshots
          </div>
          <button onClick={props.onClose} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div className="rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>This permanently deletes snapshot rows from your school. Source marks/results are not affected.</span>
          </div>

          <FormRow label="Type">
            <select value={type} onChange={e => setType(e.target.value as any)} className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1">
              <option value="">— any —</option>
              <option value="secular">secular</option>
              <option value="theology">theology</option>
              <option value="mixed">mixed</option>
            </select>
          </FormRow>
          <div className="grid grid-cols-2 gap-2">
            <FormRow label="Term ID">
              <input type="number" value={termId} onChange={e => setTermId(e.target.value)} className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1" />
            </FormRow>
            <FormRow label="Year ID">
              <input type="number" value={yearId} onChange={e => setYearId(e.target.value)} className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1" />
            </FormRow>
          </div>
          <FormRow label="Result Type ID (or 'null')">
            <input value={resultTypeId} onChange={e => setResultTypeId(e.target.value)} placeholder="any" className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1" />
          </FormRow>

          <div>
            <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Statuses to flush</div>
            <div className="flex flex-wrap gap-2 text-xs">
              {(['ready','failed','cancelled','stale'] as const).map(s => (
                <label key={s} className="inline-flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeStatuses[s]}
                    onChange={e => setIncludeStatuses(prev => ({ ...prev, [s]: e.target.checked }))}
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>

          <label className="inline-flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={cancelInflight} onChange={e => setCancelInflight(e.target.checked)} />
            Also cancel any in-flight generation for the same key
          </label>

          {error && <div className="text-xs text-rose-600">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 p-3 border-t border-slate-200 dark:border-slate-700">
          <button onClick={props.onClose} className="px-3 py-1.5 text-sm rounded border">Cancel</button>
          <button
            onClick={submit}
            disabled={busy}
            className="px-3 py-1.5 text-sm rounded bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {busy ? 'Flushing…' : 'Flush'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormRow(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{props.label}</div>
      {props.children}
    </label>
  );
}
