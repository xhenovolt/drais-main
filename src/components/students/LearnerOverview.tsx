"use client";
/**
 * Learner Command Center strip — operational snapshot shown at the top of the
 * student profile. One fetch to /api/students/[id]/overview. Metrics that the
 * backend couldn't compute (schema variation, no data) render as "—" rather
 * than fabricating numbers.
 */
import React from 'react';
import useSWR from 'swr';
import { TrendingUp, CalendarCheck, Wallet, BookOpen, Activity, Loader } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';

const fetcher = (url: string) => fetch(url).then(r => r.json());

function StatCard({ icon: Icon, label, value, sub, tone }: {
  icon: React.ElementType; label: string; value: string; sub?: string; tone: string;
}) {
  return (
    <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
      <div className="flex items-center gap-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${tone}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</p>
      </div>
      <p className="text-lg font-bold text-slate-800 dark:text-white mt-1.5">{value}</p>
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

function Sparkline({ points }: { points: { label: string; score: number }[] }) {
  if (!points.length) return null;
  const w = 120, h = 28, pad = 2;
  const scores = points.map(p => p.score);
  const min = Math.min(...scores), max = Math.max(...scores);
  const range = max - min || 1;
  const step = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const d = points.map((p, i) => {
    const x = pad + i * step;
    const y = h - pad - ((p.score - min) / range) * (h - pad * 2);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-indigo-500" />
    </svg>
  );
}

export default function LearnerOverview({ studentId }: { studentId: string | number }) {
  const { t, lang, digits, formatNumber, formatDate } = useI18n();
  const { data, isLoading } = useSWR(
    studentId ? `/api/students/${studentId}/overview` : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-slate-400">
        <Loader className="w-4 h-4 animate-spin" /> {t('students.list.overview.loading')}
      </div>
    );
  }
  if (!data?.success) return null;
  const o = data.overview;

  const fmt = (n: number | null, suffix = '') => (n == null ? '—' : `${digits(n)}${suffix === '%' && lang === 'ar' ? '٪' : suffix}`);
  const money = (n: number | null) => (n == null ? '—' : (lang === 'ar' ? formatNumber(n) : Number(n).toLocaleString()));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={TrendingUp} label={t('students.list.overview.performance')}
          value={fmt(o.performance.average, '%')}
          sub={o.performance.graded_count ? t('students.list.overview.graded', { count: o.performance.graded_count }) : t('students.list.overview.noMarks')}
          tone="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40"
        />
        <StatCard
          icon={CalendarCheck} label={t('students.list.overview.attendance')}
          value={fmt(o.attendance.rate, '%')}
          sub={o.attendance.total_days ? t('students.list.overview.attendanceSub', { present: o.attendance.present, total: o.attendance.total_days, window: o.attendance.window_days }) : t('students.list.overview.noRecords')}
          tone="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40"
        />
        <StatCard
          icon={Wallet} label={t('students.list.overview.feeBalance')}
          value={money(o.fees.balance)}
          sub={o.fees.paid != null ? t('students.list.overview.paid', { amount: money(o.fees.paid) }) : t('students.list.overview.notAvailable')}
          tone={o.fees.balance && o.fees.balance > 0
            ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/40'
            : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40'}
        />
        <StatCard
          icon={BookOpen} label={t('students.list.overview.activeSubjects')}
          value={fmt(o.subjects.active)}
          tone="bg-amber-100 text-amber-600 dark:bg-amber-900/40"
        />
      </div>

      {(o.performance.trend?.length > 0 || o.timeline?.length > 0) && (
        <div className="grid md:grid-cols-2 gap-3">
          {o.performance.trend?.length > 0 && (
            <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
                <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{t('students.list.overview.trend')}</p>
              </div>
              <Sparkline points={o.performance.trend} />
              <p className="text-[10px] text-slate-400 mt-1">{t('students.list.overview.lastExams', { count: o.performance.trend.length })}</p>
            </div>
          )}
          {o.timeline?.length > 0 && (
            <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-3.5 h-3.5 text-indigo-500" />
                <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{t('students.list.overview.recentActivity')}</p>
              </div>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {o.timeline.map((e: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-300 truncate">{e.label}</span>
                    <span className="text-[10px] text-slate-400 flex-shrink-0 ms-2">
                      {e.at ? formatDate(e.at) : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
