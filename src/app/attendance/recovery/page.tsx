'use client';

/**
 * Recovery Center (Phase 6) — when attendance stops, DRAIS notices and offers
 * the fix. Per-device gap detection with a recommended recovery action; the
 * heavy actions route to Device Control, the safe one (queue retry) runs here.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  LifeBuoy, RefreshCw, AlertTriangle, CheckCircle, Clock, ArrowRight, Loader2, ListRestart,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const STATUS_STYLE: Record<string, { chip: string; icon: React.ReactNode }> = {
  ok: { chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: <CheckCircle className="w-4 h-4 text-emerald-500" /> },
  watch: { chip: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', icon: <Clock className="w-4 h-4 text-amber-500" /> },
  gap: { chip: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300', icon: <AlertTriangle className="w-4 h-4 text-rose-500" /> },
};

export default function RecoveryCenter() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/attendance/recovery', { cache: 'no-store' });
      setData(await r.json());
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const retryQueue = useCallback(async () => {
    setRetrying(true);
    try {
      const r = await fetch('/api/attendance/recovery', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'retry_queue' }) });
      const j = await r.json();
      if (j.success) { toast.success(`Queue drained — ${j.result?.delivered ?? 0} sent, ${j.result?.failed ?? 0} failed`); load(); }
      else toast.error(j.error || 'Failed');
    } finally { setRetrying(false); }
  }, [load]);

  const devices = data?.devices || [];
  const healthy = data && data.summary?.gaps === 0 && data.summary?.watch === 0 && !data.queue?.stuck && !data.staging?.uncommitted;

  const actionFor = (v: any) => {
    switch (v.method) {
      case 'lan_pull': return <a href="/attendance/device-control" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">{v.actionLabel} <ArrowRight className="w-3 h-3" /></a>;
      case 'resume_acquisition': return <a href="/attendance/device-control" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">{v.actionLabel} <ArrowRight className="w-3 h-3" /></a>;
      case 'retry_queue': return <button onClick={retryQueue} disabled={retrying} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">{retrying ? <Loader2 className="w-3 h-3 animate-spin" /> : <ListRestart className="w-3 h-3" />} {v.actionLabel}</button>;
      case 'check_device': return <span className="text-xs text-gray-400">{v.actionLabel}</span>;
      default: return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><LifeBuoy className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Recovery Center</h1>
            <p className="text-sm text-gray-500">When attendance stops flowing, DRAIS detects it and recommends the fix — no waiting for someone to notice.</p>
          </div>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Re-scan</button>
      </div>

      {loading && !data && <div className="py-16 text-center"><Loader2 className="w-7 h-7 animate-spin text-indigo-600 inline" /></div>}

      {data && healthy && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4 flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-emerald-500" />
          <span className="text-sm font-medium text-emerald-800 dark:text-emerald-200">Attendance is flowing normally across all devices — nothing to recover.</span>
        </div>
      )}

      {/* School-wide recoverables */}
      {(data?.queue?.stuck > 0 || data?.staging?.uncommitted > 0) && (
        <div className="space-y-2">
          {data.staging.uncommitted > 0 && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 flex items-center justify-between gap-2">
              <span className="text-sm text-amber-800 dark:text-amber-200">{data.staging.uncommitted} device pull(s) staged but never committed.</span>
              <a href="/attendance/device-control" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">Review &amp; commit <ArrowRight className="w-3 h-3" /></a>
            </div>
          )}
          {data.queue.stuck > 0 && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 flex items-center justify-between gap-2">
              <span className="text-sm text-amber-800 dark:text-amber-200">{data.queue.stuck} parent SMS stuck in the queue.</span>
              <button onClick={retryQueue} disabled={retrying} className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-medium flex items-center gap-1 disabled:opacity-50">{retrying ? <Loader2 className="w-3 h-3 animate-spin" /> : <ListRestart className="w-3 h-3" />} Retry queue</button>
            </div>
          )}
        </div>
      )}

      {/* Per-device */}
      <div className="space-y-3">
        {devices.map((d: any) => {
          const st = STATUS_STYLE[d.verdict.status] || STATUS_STYLE.ok;
          return (
            <div key={d.device_sn} className={`rounded-xl border p-4 ${d.verdict.status === 'gap' ? 'border-rose-300 dark:border-rose-800 bg-white dark:bg-gray-800' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  {st.icon}
                  <span className="font-mono text-sm font-semibold text-gray-800 dark:text-gray-100">{d.device_name || d.device_sn}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${st.chip}`}>{d.verdict.status}</span>
                  {!d.is_online && <span className="text-[10px] text-gray-400">offline</span>}
                </div>
                <span className="text-xs text-gray-400">{d.got_today} today{d.expected_by_now > 0 ? ` / ~${d.expected_by_now} expected` : ''}</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{d.verdict.reason}</p>
              {d.verdict.method !== 'none' && <div className="mt-2">{actionFor(d.verdict)}</div>}
            </div>
          );
        })}
        {data && devices.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No devices registered for this school.</p>}
      </div>
    </div>
  );
}
