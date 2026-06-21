'use client';
/**
 * /parent/compare — side-by-side comparison of the parent's own learners.
 * Only the parent's linked children; no school-wide data, no ranking of schools.
 */
import React from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

const fetcher = (u: string) => fetch(u).then(r => r.json());
const money = (n: number | null) => n == null ? '—' : `UGX ${Number(n).toLocaleString()}`;
const pct = (n: number | null) => n == null ? '—' : `${n}%`;

export default function ComparePage() {
  const { data } = useSWR('/api/parent/compare', fetcher);
  const learners: any[] = data?.learners ?? [];

  const rows: { label: string; get: (l: any) => string }[] = [
    { label: 'School', get: l => l.school_name },
    { label: 'Class', get: l => l.class_name || '—' },
    { label: 'Attendance', get: l => pct(l.attendance_rate) },
    { label: 'Late days', get: l => String(l.late_days ?? 0) },
    { label: 'Average', get: l => pct(l.academic_average) },
    { label: 'Balance', get: l => l.fees_visible ? money(l.fee_balance) : 'Hidden' },
  ];

  return (
    <div className="px-4 py-4 pb-16">
      <header className="flex items-center gap-2 mb-4">
        <Link href="/parent" className="p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><ArrowLeft className="w-5 h-5" /></Link>
        <div>
          <h1 className="text-base font-bold text-slate-800 dark:text-white leading-tight">Compare</h1>
          <p className="text-[11px] text-slate-400">Your children, side by side{data?.window_days ? ` · last ${data.window_days} days` : ''}</p>
        </div>
      </header>

      {!data ? <div className="py-16 text-center text-slate-400 text-sm">Loading…</div> : learners.length < 2 ? (
        <div className="py-12 text-center text-slate-400 text-sm">Add more than one learner to compare.</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="text-left p-2.5 font-medium text-slate-400 sticky left-0 bg-white dark:bg-slate-900">Metric</th>
                {learners.map(l => (
                  <th key={l.learner_access_id} className="text-left p-2.5 font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">{l.learner_name.split(' ')[0]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.label} className="border-b border-slate-50 dark:border-slate-800/50">
                  <td className="p-2.5 text-slate-400 sticky left-0 bg-white dark:bg-slate-900">{r.label}</td>
                  {learners.map(l => <td key={l.learner_access_id} className="p-2.5 text-slate-700 dark:text-slate-200 whitespace-nowrap">{r.get(l)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
