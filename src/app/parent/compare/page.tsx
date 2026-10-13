'use client';
/**
 * /parent/compare — the parent's own children, side by side.
 * Only the parent's linked learners; no school-wide data, no ranking of schools.
 *
 * Layout: one card per MEASURE with a row per child, instead of a table with a column per child.
 * The table could not survive a phone: long school names took the width and the label column was
 * crushed to one letter per line. Here each child's school gets its own full-width card at the
 * top, and every measure compares the children with bars that read the same at any width and
 * for any number of children.
 */
import React from 'react';
import useSWR from 'swr';
import { CalendarCheck, Clock, TrendingUp, Wallet, Users, School, Award, EyeOff } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { PortalPage, PortalHeader, Card, Avatar, ProgressBar, EmptyState, LoadingBlock, SERIES_COLORS } from '@/components/parent/PortalUI';

const fetcher = (u: string) => fetch(u).then((r) => r.json());

interface Learner {
  learner_access_id: string;
  learner_name: string;
  school_name: string;
  class_name: string | null;
  attendance_rate: number | null;
  late_days: number | null;
  academic_average: number | null;
  fee_balance: number | null;
  fees_visible: boolean;
}

export default function ComparePage() {
  const { t, formatMoney, formatNumber } = useI18n();
  const { data } = useSWR('/api/parent/compare', fetcher);
  const learners: Learner[] = data?.learners ?? [];

  const subtitle = data?.window_days
    ? t('parent.compare.subtitleWindow', { days: data.window_days })
    : t('parent.compare.subtitle');

  return (
    <PortalPage width="max-w-4xl">
      <PortalHeader title={t('parent.compare.title')} subtitle={subtitle} backHref="/parent" />

      {!data ? <LoadingBlock /> : learners.length < 2 ? (
        <Card><EmptyState icon={Users} title={t('parent.compare.needTwo')} hint={t('parent.compare.needTwoHint')} /></Card>
      ) : (
        <div className="space-y-4">
          {/* Who is being compared. Each child keeps one colour through the whole page. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {learners.map((l, i) => (
              <Card key={l.learner_access_id} className="p-3">
                <div className="flex items-start gap-3">
                  <Avatar name={l.learner_name} index={i} />
                  <div className="min-w-0 flex-1">
                    <p className="break-normal font-bold leading-tight text-slate-800 dark:text-white">{l.learner_name}</p>
                    <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                      <School className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 break-normal leading-snug">{l.school_name}</span>
                    </p>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{l.class_name || t('parent.common.classNotSet')}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Measure
              icon={CalendarCheck} title={t('parent.compare.attendance')} hint={t('parent.compare.higherBetter')}
              learners={learners} value={(l) => l.attendance_rate} better="high"
              show={(v) => `${formatNumber(v, { maximumFractionDigits: 1 })}%`} bar={(v) => v}
            />
            <Measure
              icon={TrendingUp} title={t('parent.compare.average')} hint={t('parent.compare.higherBetter')}
              learners={learners} value={(l) => l.academic_average} better="high"
              show={(v) => `${formatNumber(v, { maximumFractionDigits: 1 })}%`} bar={(v) => v}
            />
            <Measure
              icon={Clock} title={t('parent.compare.lateDays')} hint={t('parent.compare.lowerBetter')}
              learners={learners} value={(l) => l.late_days ?? 0} better="low"
              show={(v) => formatNumber(v)}
              bar={(v, max) => (max > 0 ? (v / max) * 100 : 0)}
            />
            <Measure
              icon={Wallet} title={t('parent.compare.balance')} hint={t('parent.compare.balanceHint')}
              learners={learners} value={(l) => (l.fees_visible ? l.fee_balance : null)} better="none"
              hidden={(l) => !l.fees_visible}
              show={(v) => (v <= 0 ? t('parent.compare.nothingOwed') : formatMoney(v))}
              bar={(v, max) => (max > 0 ? (Math.max(v, 0) / max) * 100 : 0)}
            />
          </div>
        </div>
      )}
    </PortalPage>
  );
}

/** One measure: a row per child with the value and a bar in that child's colour. */
function Measure({
  icon: Icon, title, hint, learners, value, show, bar, better, hidden,
}: {
  icon: React.ElementType; title: string; hint: string; learners: Learner[];
  value: (l: Learner) => number | null;
  show: (v: number) => string;
  bar: (v: number, max: number) => number;
  better: 'high' | 'low' | 'none';
  hidden?: (l: Learner) => boolean;
}) {
  const { t } = useI18n();
  const values = learners.map(value);
  const known = values.filter((v): v is number => v != null);
  const max = known.length ? Math.max(...known) : 0;
  // A "best" badge only when it means something: at least two known values that differ.
  const distinct = new Set(known).size > 1;
  const best = !distinct || better === 'none' ? null : better === 'high' ? Math.max(...known) : Math.min(...known);

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-800 dark:text-white">
          <Icon className="h-4 w-4 shrink-0 text-indigo-500" />
          <span className="break-normal">{title}</span>
        </h2>
        <span className="shrink-0 pt-0.5 text-xs text-slate-400">{hint}</span>
      </div>
      <ul className="space-y-3">
        {learners.map((l, i) => {
          const v = values[i];
          const isHidden = hidden?.(l) ?? false;
          return (
            <li key={l.learner_access_id}>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${SERIES_COLORS[i % SERIES_COLORS.length]}`} />
                  <span className="min-w-0 break-normal text-sm font-medium text-slate-700 dark:text-slate-200">{l.learner_name}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {best != null && v === best && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                      <Award className="h-3 w-3" />{t('parent.compare.best')}
                    </span>
                  )}
                  {isHidden ? (
                    <span className="inline-flex items-center gap-1 text-sm text-slate-400"><EyeOff className="h-3.5 w-3.5" />{t('parent.common.hidden')}</span>
                  ) : (
                    <span className="text-sm font-bold text-slate-800 dark:text-white"><bdi>{v == null ? t('parent.common.noData') : show(v)}</bdi></span>
                  )}
                </span>
              </div>
              <ProgressBar percent={v == null || isHidden ? 0 : bar(v, max)} colorClass={SERIES_COLORS[i % SERIES_COLORS.length]} label={`${title} — ${l.learner_name}`} />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
