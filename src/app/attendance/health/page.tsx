'use client';

/**
 * Attendance Health Center (Phase 1) — one page that answers "is attendance
 * OK right now?" without SQL. Overall score, ten pipeline check cards, and
 * ordered recommendations. Live refresh every 30s (toggleable).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity, RefreshCw, CheckCircle, AlertTriangle, XCircle, HelpCircle,
  HardDrive, Radio, Waves, Clock, MessageSquare, Users, ListOrdered, Cog, Database, Cpu,
} from 'lucide-react';

const CHECK_ICON: Record<string, React.ReactNode> = {
  devices: <HardDrive className="w-4 h-4" />, heartbeat: <Radio className="w-4 h-4" />,
  flow: <Waves className="w-4 h-4" />, time: <Clock className="w-4 h-4" />,
  sms: <MessageSquare className="w-4 h-4" />, identity: <Users className="w-4 h-4" />,
  queue: <ListOrdered className="w-4 h-4" />, jobs: <Cog className="w-4 h-4" />,
  db: <Database className="w-4 h-4" />, device_rep: <Cpu className="w-4 h-4" />,
};
const STATUS_STYLE: Record<string, { badge: string; icon: React.ReactNode }> = {
  healthy: { badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: <CheckCircle className="w-4 h-4 text-emerald-500" /> },
  degraded: { badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', icon: <AlertTriangle className="w-4 h-4 text-amber-500" /> },
  critical: { badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300', icon: <XCircle className="w-4 h-4 text-rose-500" /> },
  unknown: { badge: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300', icon: <HelpCircle className="w-4 h-4 text-gray-400" /> },
};

export default function AttendanceHealthPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/attendance/health', { cache: 'no-store' });
      setData(await r.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (live) timer.current = setInterval(load, 30_000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [live, load]);

  const score = data?.score ?? null;
  const overall = data?.status;
  const scoreColor = score == null ? 'text-gray-400'
    : score >= 90 ? 'text-emerald-600 dark:text-emerald-400'
    : score >= 70 ? 'text-amber-600 dark:text-amber-400'
    : 'text-rose-600 dark:text-rose-400';

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><Activity className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Attendance Health Center</h1>
            <p className="text-sm text-gray-500">Every stage of the attendance pipeline, checked live — no SQL required.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> Live refresh (30s)
          </label>
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Re-check
          </button>
        </div>
      </div>

      {/* Overall score */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 flex items-center gap-6 flex-wrap">
        <div className="text-center">
          <div className={`text-6xl font-extrabold tabular-nums ${scoreColor}`}>{score ?? '—'}<span className="text-2xl font-bold">%</span></div>
          <div className={`mt-1 inline-block text-xs px-2.5 py-1 rounded-full font-semibold uppercase ${STATUS_STYLE[overall || 'unknown']?.badge}`}>
            {overall === 'healthy' ? 'Healthy' : overall === 'degraded' ? 'Degraded' : overall === 'critical' ? 'Needs attention' : '…'}
          </div>
        </div>
        <div className="flex-1 min-w-[220px]">
          {data?.recommendations?.length ? (
            <>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Recommendations (worst first)</p>
              <ul className="space-y-1">
                {data.recommendations.map((r: string, i: number) => (
                  <li key={i} className="text-sm text-gray-700 dark:text-gray-200 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" /> {r}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-gray-500 flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-emerald-500" /> Everything is operating normally — no action needed.
            </p>
          )}
          {data?.generated_at && (
            <p className="text-[11px] text-gray-400 mt-2">Checked {new Date(data.generated_at).toLocaleTimeString()}</p>
          )}
        </div>
      </div>

      {/* Check cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {(data?.checks || []).map((c: any) => {
          const st = STATUS_STYLE[c.status] || STATUS_STYLE.unknown;
          return (
            <div key={c.key} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-gray-100">
                  <span className="text-indigo-500">{CHECK_ICON[c.key] || <Activity className="w-4 h-4" />}</span>
                  {c.label}
                </span>
                {st.icon}
              </div>
              <div className="flex items-end gap-2 mb-1">
                <span className={`text-2xl font-bold tabular-nums ${c.score >= 90 ? 'text-emerald-600 dark:text-emerald-400' : c.score >= 70 ? 'text-amber-600 dark:text-amber-400' : c.status === 'unknown' ? 'text-gray-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {c.status === 'unknown' ? '—' : `${c.score}%`}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold uppercase mb-1 ${st.badge}`}>{c.status}</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{c.detail}</p>
              {c.recommendation && c.status !== 'healthy' && (
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1.5">→ {c.recommendation}</p>
              )}
            </div>
          );
        })}
        {loading && !data && Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
