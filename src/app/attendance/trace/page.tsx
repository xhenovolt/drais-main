'use client';

/**
 * Attendance Event Explorer + Trace Viewer (Phase 2 — Digital Twin).
 *
 * Search any punch, open its full lifecycle timeline:
 * capture → device → device time → server receive → correction → identity →
 * verdict → popup → SMS → audit. The first red stage answers
 * "where did it break?" at a glance.
 */
import React, { useCallback, useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  GitBranch, Search, Loader2, CheckCircle, AlertTriangle, XCircle, Info, MinusCircle, RefreshCw,
} from 'lucide-react';

const STAGE_ICON: Record<string, React.ReactNode> = {
  ok: <CheckCircle className="w-4 h-4 text-emerald-500" />,
  warn: <AlertTriangle className="w-4 h-4 text-amber-500" />,
  fail: <XCircle className="w-4 h-4 text-rose-500" />,
  skip: <MinusCircle className="w-4 h-4 text-gray-400" />,
  info: <Info className="w-4 h-4 text-sky-400" />,
};
const STAGE_LINE: Record<string, string> = {
  ok: 'border-emerald-300 dark:border-emerald-800',
  warn: 'border-amber-300 dark:border-amber-800',
  fail: 'border-rose-400 dark:border-rose-700',
  skip: 'border-gray-200 dark:border-gray-700',
  info: 'border-sky-200 dark:border-sky-800',
};
const DOT: Record<string, string> = {
  ok: 'bg-emerald-500', warn: 'bg-amber-500', fail: 'bg-rose-500', info: 'bg-sky-400', skip: 'bg-gray-300',
};

function TracePageInner() {
  const params = useSearchParams();
  const [q, setQ] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [trace, setTrace] = useState<any>(null);
  const [traceLoading, setTraceLoading] = useState(false);

  const search = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (q) p.set('q', q);
      if (date) p.set('date', date);
      const r = await fetch(`/api/attendance/trace?${p}`, { cache: 'no-store' });
      setRows((await r.json()).rows || []);
    } finally { setLoading(false); }
  }, [q, date]);

  const openTrace = useCallback(async (id: number) => {
    setTraceLoading(true);
    try {
      const r = await fetch(`/api/attendance/trace?event_id=${id}`, { cache: 'no-store' });
      const j = await r.json();
      if (j.success) setTrace(j);
    } finally { setTraceLoading(false); }
  }, []);

  useEffect(() => {
    const ev = params.get('event');
    if (ev) openTrace(Number(ev));
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><GitBranch className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Event Explorer</h1>
          <p className="text-sm text-gray-500">Every punch is a traceable event — open one to see exactly where it succeeded or failed.</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="Name or PIN…" className="flex-1 bg-transparent text-sm outline-none" />
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm" />
        <button onClick={search} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Search
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Event list */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="max-h-[560px] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700/50">
            {!loading && rows.length === 0 && <p className="py-10 text-center text-gray-400 text-sm">No events found.</p>}
            {rows.map((r) => (
              <button key={r.id} onClick={() => openTrace(r.id)}
                className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center justify-between gap-2 ${trace?.event?.id === r.id ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}`}>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                    {r.display_name || `PIN ${r.device_user_id}`}
                    <span className="text-xs text-gray-400 ml-1.5">{new Date(r.punch_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                  </div>
                  <div className="text-[11px] text-gray-400 truncate">#{r.id} · {r.device_sn} · {r.source}{r.derived_event ? ` · ${r.derived_event}` : ''}</div>
                </div>
                <div className="flex gap-1 flex-shrink-0" title="identity / verdict / popup">
                  {(['identity', 'verdict', 'popup'] as const).map(k => (
                    <span key={k} className={`w-2 h-2 rounded-full ${DOT[r.flags[k]] || 'bg-gray-300'}`} />
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Trace viewer */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          {traceLoading && <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-600 inline" /></div>}
          {!traceLoading && !trace && <p className="py-16 text-center text-gray-400 text-sm">Select an event to see its full lifecycle.</p>}
          {!traceLoading && trace && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    {trace.event.name || `PIN ${trace.event.device_user_id}`}
                    <span className="text-xs text-gray-400 ml-2">#{trace.event.id}</span>
                  </p>
                  <p className="text-[11px] text-gray-400">{new Date(trace.event.punch_at).toLocaleString()} · {trace.event.device_sn}</p>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold uppercase ${
                  trace.summary.status === 'ok' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : trace.summary.status === 'warn' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                      : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'}`}>
                  {trace.summary.status === 'ok' ? 'Complete' : trace.summary.failedStage}
                </span>
              </div>

              <ol className="space-y-0">
                {trace.stages.map((s: any, i: number) => (
                  <li key={s.key} className={`relative pl-6 pb-4 ${i < trace.stages.length - 1 ? `border-l-2 ml-2 ${STAGE_LINE[s.status]}` : 'ml-2'}`}>
                    <span className="absolute -left-[9px] top-0 bg-white dark:bg-gray-800 rounded-full">{STAGE_ICON[s.status]}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${s.status === 'fail' ? 'text-rose-700 dark:text-rose-300' : 'text-gray-800 dark:text-gray-100'}`}>{s.label}</span>
                      {s.at && <span className="text-[10px] text-gray-400">{new Date(s.at).toLocaleTimeString()}</span>}
                    </div>
                    <p className={`text-xs mt-0.5 ${s.status === 'fail' ? 'text-rose-600 dark:text-rose-400' : 'text-gray-500 dark:text-gray-400'}`}>{s.detail}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TracePage() {
  return (
    <Suspense fallback={<div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-600 inline" /></div>}>
      <TracePageInner />
    </Suspense>
  );
}
