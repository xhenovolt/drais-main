"use client";
import React, { useState } from 'react';
import useSWR from 'swr';
import { Plus, Loader2, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { TermWizard } from './TermWizard';
import { t } from '@/lib/i18n';

const fetcher = (u: string) => fetch(u).then(r => r.json());

const STATUS_STYLE: Record<string, string> = {
  current:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  upcoming:  'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  completed: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  unknown:   'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

const WARN_LABEL: Record<string, string> = {
  NO_CURRENT_TERM: 'No current term — today is outside every term. Set the current term below.',
  STALE_ACTIVE: 'A past term is still marked active. Deactivate it or activate the right term.',
  MULTIPLE_ACTIVE: 'Multiple terms are marked active. Only one should be active.',
  MANUAL_OVERRIDE_MISMATCH: 'The manually-active term differs from the date-current term.',
  NO_TERMS: 'No terms exist yet. Add one to begin.',
};

export default function TermTable() {
  const { data, isLoading, mutate } = useSWR('/api/terms/current', fetcher);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const router = useRouter();

  const ctx = data?.data?.context;
  const rows: any[] = ctx?.allTerms ?? data?.data?.all ?? [];
  const effective = ctx?.effective ?? null;
  const progress = ctx?.progress ?? null;
  const warnings: string[] = ctx?.warnings ?? [];

  const setActive = async (id: number, makeActive: boolean) => {
    setBusyId(id);
    try {
      await fetch(`/api/terms/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: makeActive }),
      });
      await mutate();
    } finally { setBusyId(null); }
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('terms.title', 'Terms')}</h1>
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm">
          <Plus className="w-4 h-4" /> {t('terms.add', 'Add Term')}
        </button>
      </div>

      {/* Current term / warnings banner */}
      {effective ? (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Current term: {effective.name}
                {effective.academic_year_name ? ` · ${effective.academic_year_name}` : ''}
              </p>
              {progress && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                  Day {progress.daysElapsed} of {progress.totalDays} · {progress.daysRemaining} day(s) remaining
                </p>
              )}
            </div>
            {progress && (
              <div className="w-32 h-2 rounded-full bg-emerald-200 dark:bg-emerald-800 overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, progress.percent)}%` }} />
              </div>
            )}
          </div>
        </div>
      ) : (
        warnings.includes('NO_CURRENT_TERM') && (
          <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-800 dark:text-amber-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> No current term — today is outside every term. Set one active below or add the current term.
          </div>
        )
      )}
      {warnings.filter(w => w !== 'NO_CURRENT_TERM').map(w => (
        <div key={w} className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" /> {WARN_LABEL[w] || w}
        </div>
      ))}

      <div className="rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 shadow">
        <table className="w-full text-sm">
          <thead className="text-left bg-gray-50 dark:bg-slate-900/50 text-gray-500 dark:text-gray-400">
            <tr>
              <th className="px-4 py-2.5 font-semibold">{t('terms.name', 'Name')}</th>
              <th className="px-4 py-2.5 font-semibold">{t('terms.start', 'Start')}</th>
              <th className="px-4 py-2.5 font-semibold">{t('terms.end', 'End')}</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold text-right">Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {isLoading && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> {t('common.loading', 'Loading...')}</td></tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">{t('terms.none', 'No terms found.')}</td></tr>
            )}
            {rows.map((r: any) => {
              const ds = r.derived_status || 'unknown';
              const isActive = !!r.is_active;
              return (
                <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/40">
                  <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-gray-200 cursor-pointer" onClick={() => router.push(`/terms/${r.id}`)}>
                    {r.name}{r.academic_year_name ? <span className="text-xs text-gray-400"> · {r.academic_year_name}</span> : null}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{String(r.start_date || '').slice(0, 10)}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{String(r.end_date || '').slice(0, 10)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold inline-flex items-center gap-1 ${STATUS_STYLE[ds]}`}>
                      {ds === 'current' && <Clock className="w-3 h-3" />}{ds}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {isActive ? (
                      <button disabled={busyId === r.id} onClick={() => setActive(r.id, false)}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1">
                        {busyId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Active — click to clear
                      </button>
                    ) : (
                      <button disabled={busyId === r.id} onClick={() => setActive(r.id, true)}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-indigo-400 disabled:opacity-50">
                        {busyId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Set active'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <TermWizard open={open} onClose={() => setOpen(false)} onCreated={() => { setOpen(false); mutate(); }} />
    </div>
  );
}
