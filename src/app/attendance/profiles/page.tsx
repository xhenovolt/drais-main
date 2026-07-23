'use client';

/**
 * Attendance Profiles — DRAIS's understanding of the INDIVIDUAL. A watch-list
 * of people whose attendance needs attention (frequently absent, declining,
 * chronically late), plus every person's behavioural label. This is what lets
 * DRAIS say "this teacher is often absent" unprompted.
 */
import React, { useState } from 'react';
import useSWR from 'swr';
import { Users, AlertTriangle, TrendingDown, Clock, UserCheck, Loader2, Eye } from 'lucide-react';

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then(r => r.json());

const BEHAVIOUR_STYLE: Record<string, { chip: string; icon: React.ReactNode }> = {
  frequently_absent: { chip: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  declining: { chip: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300', icon: <TrendingDown className="w-3.5 h-3.5" /> },
  chronically_late: { chip: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', icon: <Clock className="w-3.5 h-3.5" /> },
  occasionally_late: { chip: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300', icon: <Clock className="w-3.5 h-3.5" /> },
  improving: { chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: <UserCheck className="w-3.5 h-3.5" /> },
  reliable: { chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: <UserCheck className="w-3.5 h-3.5" /> },
  insufficient_data: { chip: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300', icon: <Eye className="w-3.5 h-3.5" /> },
};
const pct = (r: number) => `${Math.round((r || 0) * 100)}%`;

function Row({ p }: { p: any }) {
  const st = BEHAVIOUR_STYLE[p.behaviour] || BEHAVIOUR_STYLE.reliable;
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{p.name || `#${p.person_id}`}</span>
          <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold ${st.chip}`}>{st.icon} {p.label}</span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{p.note}</p>
      </div>
      <div className="text-right flex-shrink-0 text-[11px] text-gray-400">
        <div><span className="text-rose-500 font-semibold">{pct(p.absentRate)}</span> absent</div>
        <div><span className="text-amber-500 font-semibold">{pct(p.lateRate)}</span> late · {p.trackedDays}d</div>
      </div>
    </div>
  );
}

export default function AttendanceProfiles() {
  const [role, setRole] = useState<'staff' | 'student'>('staff');
  const [days, setDays] = useState(30);
  const [showAll, setShowAll] = useState(false);
  const { data, isLoading } = useSWR<any>(`/api/attendance/person-profiles?role=${role}&days=${days}`, fetcher);

  const watchlist = data?.watchlist || [];
  const all = data?.all || [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><Users className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Attendance Profiles</h1>
            <p className="text-sm text-gray-500">Who needs attention — DRAIS reads each person's own pattern, not just the totals.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-sm">
            {(['staff', 'student'] as const).map(r => (
              <button key={r} onClick={() => setRole(r)} className={`px-3 py-1.5 ${role === r ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>{r === 'staff' ? 'Staff' : 'Learners'}</button>
            ))}
          </div>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="text-sm px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200">
            <option value={30}>30 days</option><option value={60}>60 days</option><option value={90}>90 days</option>
          </select>
        </div>
      </div>

      {isLoading && !data && <div className="py-16 text-center"><Loader2 className="w-7 h-7 animate-spin text-indigo-600 inline" /></div>}

      {data?.summary && (
        <div className="grid grid-cols-3 gap-3">
          {[
            ['Frequently absent', data.summary.frequently_absent, 'text-rose-600 dark:text-rose-400'],
            ['Declining', data.summary.declining, 'text-orange-600 dark:text-orange-400'],
            ['Chronically late', data.summary.chronically_late, 'text-amber-600 dark:text-amber-400'],
          ].map(([label, n, c]) => (
            <div key={label as string} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-center">
              <div className={`text-2xl font-bold ${c}`}>{n ?? 0}</div>
              <div className="text-[11px] text-gray-500">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Watch-list */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1 flex items-center gap-1.5"><Eye className="w-4 h-4 text-rose-500" /> Watch-list</p>
        {watchlist.length === 0
          ? <p className="text-sm text-gray-400 py-3">No one needs attention in this window — attendance behaviour is healthy.</p>
          : watchlist.map((p: any) => <Row key={p.person_id} p={p} />)}
      </div>

      {/* Everyone */}
      {all.length > watchlist.length && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <button onClick={() => setShowAll(v => !v)} className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
            {showAll ? 'Hide' : 'Show'} all {all.length} profiles
          </button>
          {showAll && <div className="mt-2">{all.map((p: any) => <Row key={p.person_id} p={p} />)}</div>}
        </div>
      )}
    </div>
  );
}
