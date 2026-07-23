'use client';

/**
 * Attendance Trends (Phase 6 — Pattern Analytics). The evolution of
 * attendance over time with deterministic anomaly alerts and per-group
 * drift. Charts use the status palette (present/late/absent) consistently
 * with the rest of DRAIS; every colour is paired with a labeled axis/legend.
 */
import React, { useState } from 'react';
import useSWR from 'swr';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Info, Loader2, LineChart as LineIcon } from 'lucide-react';

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then(r => r.json());
const HEX = { present: '#10b981', late: '#f59e0b', absent: '#ef4444' };

const LEVEL_STYLE: Record<string, { chip: string; icon: React.ReactNode }> = {
  alert: { chip: 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20', icon: <AlertTriangle className="w-4 h-4 text-rose-500" /> },
  watch: { chip: 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20', icon: <AlertTriangle className="w-4 h-4 text-amber-500" /> },
  info: { chip: 'border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20', icon: <Info className="w-4 h-4 text-sky-500" /> },
};

export default function AttendanceTrends() {
  const [role, setRole] = useState<'student' | 'staff'>('student');
  const [days, setDays] = useState(30);
  const { data, isLoading } = useSWR<any>(`/api/attendance/patterns?role=${role}&days=${days}`, fetcher);

  const series = (data?.series || []).map((d: any) => ({
    date: d.date.slice(5),
    Present: d.present, Late: d.late, Absent: d.absent,
  }));
  const tr = data?.trend || { direction: 'stable', deltaPct: 0 };
  const TrendIcon = tr.direction === 'improving' ? TrendingUp : tr.direction === 'declining' ? TrendingDown : Minus;
  const trendColor = tr.direction === 'improving' ? 'text-emerald-600 dark:text-emerald-400' : tr.direction === 'declining' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500';

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><LineIcon className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Attendance Trends</h1>
            <p className="text-sm text-gray-500">How attendance is evolving — with automatic alerts when something changes.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-sm">
            {(['student', 'staff'] as const).map(r => (
              <button key={r} onClick={() => setRole(r)} className={`px-3 py-1.5 ${role === r ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
                {r === 'student' ? 'Learners' : 'Staff'}
              </button>
            ))}
          </div>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="text-sm px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200">
            <option value={14}>14 days</option><option value={30}>30 days</option><option value={60}>60 days</option><option value={90}>90 days</option>
          </select>
        </div>
      </div>

      {isLoading && !data && <div className="py-16 text-center"><Loader2 className="w-7 h-7 animate-spin text-indigo-600 inline" /></div>}

      {/* Trend headline */}
      {data && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
          <TrendIcon className={`w-6 h-6 ${trendColor}`} />
          <div>
            <p className={`text-sm font-semibold ${trendColor}`}>
              Attendance is {tr.direction}{tr.deltaPct ? ` (${tr.deltaPct > 0 ? '+' : ''}${tr.deltaPct}%)` : ''}
            </p>
            <p className="text-xs text-gray-500">Present rate, first half vs second half of the last {data.days} days.</p>
          </div>
        </div>
      )}

      {/* Stacked area chart */}
      {series.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Daily verdicts</p>
          <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-100 dark:stroke-gray-700" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="Present" stackId="1" stroke={HEX.present} fill={HEX.present} fillOpacity={0.7} />
                <Area type="monotone" dataKey="Late" stackId="1" stroke={HEX.late} fill={HEX.late} fillOpacity={0.7} />
                <Area type="monotone" dataKey="Absent" stackId="1" stroke={HEX.absent} fill={HEX.absent} fillOpacity={0.7} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Alerts */}
      {data && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Intelligent alerts</p>
          {(!data.alerts || data.alerts.length === 0) ? (
            <p className="text-sm text-gray-400">No unusual patterns detected in this window.</p>
          ) : (
            data.alerts.map((a: any, i: number) => {
              const st = LEVEL_STYLE[a.level] || LEVEL_STYLE.info;
              return (
                <div key={i} className={`rounded-xl border p-3 ${st.chip}`}>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100 flex items-center gap-1.5">{st.icon} {a.title}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">{a.detail}</p>
                  {a.recommendation && <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-1">→ {a.recommendation}</p>}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
