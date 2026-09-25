'use client';
/**
 * School-wide attendance by residence and gender. Every number comes from /api/attendance/breakdown
 * (one aggregated query); the card also shows the server's reconciliation verdict, so a mismatch is
 * visible instead of silently producing misleading totals.
 *
 * Labels are deliberately consistent everywhere in DRAIS: "Day scholars", "Boarding", "Girls",
 * "Boys", "Not recorded" (learners with no gender on file are counted, never dropped).
 */
import React from 'react';
import useSWR from 'swr';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

const fetcher = (u: string) => fetch(u).then((r) => r.json());

interface Stats {
  total: number; present: number; late: number; absent: number; awaiting: number;
  reportedNotRequired: number; notReported: number; policyPresent: number; policyOther: number; other: number;
  reported: number; presentToday: number;
}
interface Data {
  success: boolean; date: string; boardingMode: 'DAILY_PUNCH' | 'REPORTED_ONCE'; reportingPeriod: string | null;
  overall: Stats; residence: { day: Stats; boarding: Stats };
  gender: Record<'female' | 'male' | 'unknown', Stats>;
  cells: Record<'female' | 'male' | 'unknown', { day: Stats; boarding: Stats }>;
  reconciliation: { ok: boolean; issues: string[] };
}

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');

function Line({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'bad' | 'muted' | 'warn' }) {
  const c = tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'bad' ? 'text-red-600 dark:text-red-400'
    : tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400';
  return (
    <div className="flex items-center justify-between text-sm py-0.5">
      <span className="text-gray-600 dark:text-gray-300">{label}</span>
      <span className={`font-semibold tabular-nums ${c}`}>{value.toLocaleString()}</span>
    </div>
  );
}

function Group({ title, s, boardingReported }: { title: string; s: Stats; boardingReported?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
      <div className="flex items-baseline justify-between mb-1">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h4>
        <span className="text-xs text-gray-500 dark:text-gray-400">{s.total.toLocaleString()} learners</span>
      </div>
      {boardingReported ? (
        <>
          <Line label="Reported to school" value={s.reported} tone="good" />
          <Line label="Not reported yet" value={Math.max(0, s.total - s.reported)} tone="warn" />
          <Line label="Punched today" value={s.presentToday} tone="muted" />
        </>
      ) : (
        <>
          <Line label="Present" value={s.presentToday} tone="good" />
          {s.late > 0 && <Line label="  of whom late" value={s.late} tone="warn" />}
          <Line label="Absent" value={s.absent} tone="bad" />
          <Line label="Not yet recorded" value={s.awaiting} tone="muted" />
          {(s.policyPresent + s.policyOther + s.other) > 0 && <Line label="Other (leave, holiday…)" value={s.policyPresent + s.policyOther + s.other} tone="muted" />}
        </>
      )}
    </div>
  );
}

export default function AttendanceBreakdown({ date }: { date: string }) {
  const { data, isLoading, error } = useSWR<Data>(`/api/attendance/breakdown?date=${date}`, fetcher, { refreshInterval: 30000, revalidateOnFocus: true });

  if (isLoading) return <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 animate-pulse h-40" />;
  if (error || !data?.success) return null;

  const reportedOnce = data.boardingMode === 'REPORTED_ONCE';
  const boardingCount = data.residence.boarding.total;
  const gender: Array<['female' | 'male' | 'unknown', string]> = [['female', 'Girls'], ['male', 'Boys'], ['unknown', 'Not recorded']];

  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4" aria-label="Attendance by residence and gender">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 uppercase tracking-wider">Who is at school — Day scholars and Boarding</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {data.overall.total.toLocaleString()} learners · {pct(data.overall.presentToday, data.overall.total)} present
            {reportedOnce && data.reportingPeriod ? ` · Boarding policy: Reported once (${data.reportingPeriod})` : boardingCount > 0 ? ' · Boarding policy: Daily punch' : ''}
          </p>
        </div>
        {data.reconciliation.ok ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="w-4 h-4" /> Numbers reconcile</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400"><AlertTriangle className="w-4 h-4" /> {data.reconciliation.issues.length} mismatch{data.reconciliation.issues.length === 1 ? '' : 'es'}</span>
        )}
      </div>

      {!data.reconciliation.ok && (
        <ul className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 rounded-lg p-3 list-disc pl-5 space-y-1">
          {data.reconciliation.issues.map((i, k) => <li key={k}>{i}</li>)}
        </ul>
      )}

      {boardingCount === 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
          No learner is marked as Boarding yet, so everyone is counted as a day scholar. Mark boarders in Learners → set “Residence” to Boarding.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Group title="Day scholars" s={data.residence.day} />
        <Group title="Boarding" s={data.residence.boarding} boardingReported={reportedOnce} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {gender.map(([key, label]) => {
          const g = data.gender[key];
          if (key === 'unknown' && g.total === 0) return null;
          return (
            <div key={key} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
              <div className="flex items-baseline justify-between">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{label}</h4>
                <span className="text-xs text-gray-500 dark:text-gray-400">{g.total.toLocaleString()} learners</span>
              </div>
              {(['boarding', 'day'] as const).map((r) => {
                const c = data.cells[key][r];
                const reportedMode = reportedOnce && r === 'boarding';
                return (
                  <div key={r} className="rounded-md bg-gray-50 dark:bg-gray-900/40 px-3 py-2">
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{r === 'boarding' ? 'Boarding' : 'Day scholars'} · {c.total.toLocaleString()}</div>
                    {reportedMode ? (
                      <>
                        <Line label="Reported" value={c.reported} tone="good" />
                        <Line label="Not reported" value={Math.max(0, c.total - c.reported)} tone="warn" />
                      </>
                    ) : (
                      <>
                        <Line label="Present" value={c.presentToday} tone="good" />
                        <Line label="Absent" value={c.absent} tone="bad" />
                        {c.awaiting > 0 && <Line label="Not yet recorded" value={c.awaiting} tone="muted" />}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
