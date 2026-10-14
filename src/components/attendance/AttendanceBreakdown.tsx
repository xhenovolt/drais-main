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
import { useI18n } from '@/components/i18n/I18nProvider';

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

/** A count in the interface language: the browser's grouping in English, Arabic-Indic digits in Arabic. */
function useCount() {
  const { lang, formatNumber } = useI18n();
  return (n: number) => (lang === 'ar' ? formatNumber(n) : n.toLocaleString());
}

function Line({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'bad' | 'muted' | 'warn' }) {
  const count = useCount();
  const c = tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'bad' ? 'text-red-600 dark:text-red-400'
    : tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400';
  return (
    <div className="flex items-center justify-between text-sm py-0.5">
      <span className="text-gray-600 dark:text-gray-300">{label}</span>
      <span className={`font-semibold tabular-nums ${c}`}>{count(value)}</span>
    </div>
  );
}

function Group({ title, s, boardingReported }: { title: string; s: Stats; boardingReported?: boolean }) {
  const { t } = useI18n();
  const count = useCount();
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
      <div className="flex items-baseline justify-between mb-1">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h4>
        <span className="text-xs text-gray-500 dark:text-gray-400">{t('attendancePages.breakdown.learners', { count: count(s.total) })}</span>
      </div>
      {boardingReported ? (
        <>
          <Line label={t('attendancePages.breakdown.reportedToSchool')} value={s.reported} tone="good" />
          <Line label={t('attendancePages.breakdown.notReportedYet')} value={Math.max(0, s.total - s.reported)} tone="warn" />
          <Line label={t('attendancePages.breakdown.punchedToday')} value={s.presentToday} tone="muted" />
        </>
      ) : (
        <>
          <Line label={t('attendancePages.breakdown.present')} value={s.presentToday} tone="good" />
          {s.late > 0 && <Line label={t('attendancePages.breakdown.ofWhomLate')} value={s.late} tone="warn" />}
          <Line label={t('attendancePages.breakdown.absent')} value={s.absent} tone="bad" />
          <Line label={t('attendancePages.breakdown.notYetRecorded')} value={s.awaiting} tone="muted" />
          {(s.policyPresent + s.policyOther + s.other) > 0 && <Line label={t('attendancePages.breakdown.other')} value={s.policyPresent + s.policyOther + s.other} tone="muted" />}
        </>
      )}
    </div>
  );
}

export default function AttendanceBreakdown({ date }: { date: string }) {
  const { t, lang, formatPercent } = useI18n();
  const count = useCount();
  const percent = (n: number, d: number) => (lang === 'ar' ? (d > 0 ? formatPercent(Math.round((n / d) * 100)) : '—') : pct(n, d));
  const { data, isLoading, error } = useSWR<Data>(`/api/attendance/breakdown?date=${date}`, fetcher, { refreshInterval: 30000, revalidateOnFocus: true });

  if (isLoading) return <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 animate-pulse h-40" />;
  if (error || !data?.success) return null;

  const reportedOnce = data.boardingMode === 'REPORTED_ONCE';
  const boardingCount = data.residence.boarding.total;
  const gender: Array<['female' | 'male' | 'unknown', string]> = [['female', t('attendancePages.breakdown.girls')], ['male', t('attendancePages.breakdown.boys')], ['unknown', t('attendancePages.breakdown.notRecorded')]];

  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4" aria-label={t('attendancePages.breakdown.aria')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 uppercase tracking-wider">{t('attendancePages.breakdown.title')}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('attendancePages.breakdown.summary', { count: count(data.overall.total), pct: percent(data.overall.presentToday, data.overall.total) })}
            {reportedOnce && data.reportingPeriod ? t('attendancePages.breakdown.policyReportedOnce', { period: data.reportingPeriod }) : boardingCount > 0 ? t('attendancePages.breakdown.policyDaily') : ''}
          </p>
        </div>
        {data.reconciliation.ok ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="w-4 h-4" /> {t('attendancePages.breakdown.reconcile')}</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400"><AlertTriangle className="w-4 h-4" /> {t('attendancePages.breakdown.mismatch', { count: data.reconciliation.issues.length })}</span>
        )}
      </div>

      {!data.reconciliation.ok && (
        <ul className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 rounded-lg p-3 list-disc ps-5 space-y-1">
          {data.reconciliation.issues.map((i, k) => <li key={k}>{i}</li>)}
        </ul>
      )}

      {boardingCount === 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
          {t('attendancePages.breakdown.noBoarders')}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Group title={t('attendancePages.breakdown.dayScholars')} s={data.residence.day} />
        <Group title={t('attendancePages.breakdown.boarding')} s={data.residence.boarding} boardingReported={reportedOnce} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {gender.map(([key, label]) => {
          const g = data.gender[key];
          if (key === 'unknown' && g.total === 0) return null;
          return (
            <div key={key} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
              <div className="flex items-baseline justify-between">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{label}</h4>
                <span className="text-xs text-gray-500 dark:text-gray-400">{t('attendancePages.breakdown.learners', { count: count(g.total) })}</span>
              </div>
              {(['boarding', 'day'] as const).map((r) => {
                const c = data.cells[key][r];
                const reportedMode = reportedOnce && r === 'boarding';
                return (
                  <div key={r} className="rounded-md bg-gray-50 dark:bg-gray-900/40 px-3 py-2">
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{r === 'boarding' ? t('attendancePages.breakdown.boarding') : t('attendancePages.breakdown.dayScholars')} · {count(c.total)}</div>
                    {reportedMode ? (
                      <>
                        <Line label={t('attendancePages.breakdown.reported')} value={c.reported} tone="good" />
                        <Line label={t('attendancePages.breakdown.notReported')} value={Math.max(0, c.total - c.reported)} tone="warn" />
                      </>
                    ) : (
                      <>
                        <Line label={t('attendancePages.breakdown.present')} value={c.presentToday} tone="good" />
                        <Line label={t('attendancePages.breakdown.absent')} value={c.absent} tone="bad" />
                        {c.awaiting > 0 && <Line label={t('attendancePages.breakdown.notYetRecorded')} value={c.awaiting} tone="muted" />}
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
