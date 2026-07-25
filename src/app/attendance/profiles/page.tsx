'use client';

/**
 * Attendance Profiles — DRAIS's understanding of the INDIVIDUAL. A watch-list
 * of people whose attendance needs attention (frequently absent, declining,
 * chronically late), plus every person's behavioural label. This is what lets
 * DRAIS say "this teacher is often absent" unprompted.
 */
import React, { useState, useCallback } from 'react';
import useSWR from 'swr';
import { Users, AlertTriangle, TrendingDown, Clock, UserCheck, Loader2, Eye, UserX, Wrench } from 'lucide-react';

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
  const { data, isLoading, mutate } = useSWR<any>(`/api/attendance/person-profiles?role=${role}&days=${days}`, fetcher);

  const watchlist = data?.watchlist || [];
  const rosterReview = data?.roster_review || [];
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

      {/* Roster review — never-present people, kept OUT of behaviour on purpose */}
      {rosterReview.length > 0 && (
        <RosterReview list={rosterReview} role={role} onChanged={() => mutate()} />
      )}

      {/* Enrollment mismatch fixer (students actively enrolled but not active) */}
      <EnrollmentMismatchFixer />

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

/** Roster review with reversible bulk deactivate (Phase C). */
function RosterReview({ list, role, onChanged }: { list: any[]; role: 'staff' | 'student'; onChanged: () => void }) {
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const toggle = (id: number) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = list.length > 0 && sel.size === list.length;
  const act = useCallback(async (action: 'deactivate' | 'reactivate') => {
    if (sel.size === 0) return;
    if (action === 'deactivate' && !confirm(`Mark ${sel.size} ${role === 'staff' ? 'staff' : 'learner'}(s) inactive? This is reversible.`)) return;
    setBusy(true);
    try {
      const r = await fetch('/api/attendance/roster-hygiene', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, role, person_ids: [...sel] }) });
      const j = await r.json();
      if (j.success) { setSel(new Set()); onChanged(); }
      else alert(j.error || 'Failed');
    } finally { setBusy(false); }
  }, [sel, role, onChanged]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
          <UserX className="w-4 h-4 text-slate-500" /> Roster review
          <span className="text-[11px] font-normal text-gray-400">({list.length} never checked in — likely former or not enrolled)</span>
        </p>
        {sel.size > 0 && (
          <div className="flex items-center gap-2">
            <button onClick={() => act('deactivate')} disabled={busy} className="text-[11px] px-2.5 py-1 rounded-lg bg-rose-600 text-white font-medium disabled:opacity-50">Mark {sel.size} inactive</button>
            <button onClick={() => act('reactivate')} disabled={busy} className="text-[11px] px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium disabled:opacity-50">Reactivate</button>
          </div>
        )}
      </div>
      <p className="text-[11px] text-gray-400 mb-2">Kept OUT of the behaviour watch-list. Select and mark inactive so attendance reflects real people — fully reversible and audited.</p>
      <label className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-1 cursor-pointer">
        <input type="checkbox" checked={allSelected} onChange={() => setSel(allSelected ? new Set() : new Set(list.map((p: any) => p.person_id)))} /> Select all
      </label>
      <div className="max-h-56 overflow-y-auto">
        {list.map((p: any) => (
          <label key={p.person_id} className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-700/50 last:border-0 cursor-pointer">
            <span className="flex items-center gap-2 min-w-0">
              <input type="checkbox" checked={sel.has(p.person_id)} onChange={() => toggle(p.person_id)} />
              <span className="text-sm text-gray-700 dark:text-gray-200 truncate">{p.name || `#${p.person_id}`}</span>
            </span>
            <span className="text-[11px] text-gray-400 flex-shrink-0">{p.trackedDays}d tracked · never present</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** One-click fix for students actively enrolled but marked non-active (Phase C). */
function EnrollmentMismatchFixer() {
  const { data, mutate } = useSWR<any>('/api/attendance/roster-hygiene', fetcher);
  const [busy, setBusy] = useState(false);
  const n = data?.enrollment_mismatch ?? 0;
  if (!n) return null;
  const fix = async () => {
    if (!confirm(`${n} learner(s) have an active enrollment but are marked inactive. Activate them so their attendance is tracked?`)) return;
    setBusy(true);
    try {
      const r = await fetch('/api/attendance/roster-hygiene', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'fix_enrollment_mismatch' }) });
      const j = await r.json();
      if (j.success) { alert(`Activated ${j.activated} learner(s).`); mutate(); }
      else alert(j.error || 'Failed');
    } finally { setBusy(false); }
  };
  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 p-4 flex items-center justify-between flex-wrap gap-2">
      <p className="text-sm text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
        <Wrench className="w-4 h-4" /> {n} learner(s) are actively enrolled but marked inactive — their attendance isn't tracked.
      </p>
      <button onClick={fix} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg bg-amber-600 text-white font-medium disabled:opacity-50">
        {busy ? 'Fixing…' : `Activate ${n} learner(s)`}
      </button>
    </div>
  );
}
