'use client';
/**
 * /parent — the parent's home. Every linked learner across all schools, grouped by school; each
 * card opens that learner. Client fetch; redirects to /parent/login when there is no session.
 */
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CalendarCheck, Wallet, TrendingUp, ChevronRight, School, Scale, CheckCircle2, Clock, XCircle, HelpCircle, UserRound, EyeOff } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { PortalPage, PortalHeader, Card, Avatar, SectionTitle, StatusPill, ProgressBar, EmptyState, LoadingBlock, attendanceTone } from '@/components/parent/PortalUI';

interface LearnerCard {
  learner_access_id: string;
  learner_name: string;
  school_name: string;
  class_name: string | null;
  stream_name: string | null;
  relationship: string | null;
  summary: {
    attendance_today: string | null;
    fees: { visible: boolean; balance: number | null };
    academic_average: number | null;
  };
}
interface Group { school: string; learners: LearnerCard[] }

const STATUS_ICON: Record<string, React.ElementType> = { present: CheckCircle2, late: Clock, absent: XCircle };

export default function ParentDashboard() {
  const router = useRouter();
  const { t, formatMoney, formatNumber } = useI18n();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [count, setCount] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch('/api/parent/learners')
      .then(async (r) => {
        if (r.status === 401) { router.replace('/parent/login'); return null; }
        return r.json();
      })
      .then((d) => { if (!d) return; setGroups(d.grouped_by_school ?? []); setCount(d.learner_count ?? 0); })
      .catch(() => setFailed(true));
  }, [router]);

  async function logout() {
    await fetch('/api/portal/auth/logout', { method: 'POST' }).catch(() => {});
    router.replace('/parent/login');
  }

  const schools = groups?.length ?? 0;
  // One colour per child, stable across the page and matching the compare page's order.
  let childIndex = 0;

  return (
    <PortalPage>
      <PortalHeader
        title={t('parent.home.title')}
        subtitle={groups ? (schools > 1
          ? t('parent.home.subtitleSchools', { learners: t('parent.home.learnerCount', { count }), schools: t('parent.home.schoolCount', { count: schools }) })
          : t('parent.home.learnerCount', { count })) : undefined}
        onSignOut={logout}
      />

      {failed && <Card><EmptyState icon={HelpCircle} title={t('parent.home.loadFailed')} hint={t('parent.home.loadFailedHint')} /></Card>}
      {!groups && !failed && <LoadingBlock />}

      {groups && groups.length === 0 && (
        <Card><EmptyState icon={UserRound} title={t('parent.home.noneLinked')} hint={t('parent.home.noneLinkedHint')} /></Card>
      )}

      {count > 1 && (
        <Link href="/parent/compare"
          className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm transition hover:border-indigo-400 hover:shadow dark:border-indigo-800 dark:bg-slate-900">
          <span className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200"><Scale className="h-5 w-5" /></span>
            <span className="min-w-0">
              <span className="block break-normal font-bold text-slate-800 dark:text-white">{t('parent.home.compareTitle')}</span>
              <span className="block break-normal text-sm text-slate-500 dark:text-slate-400">{t('parent.home.compareHint')}</span>
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-indigo-500 rtl-flip" />
        </Link>
      )}

      <div className="space-y-6">
        {groups?.map((g) => (
          <section key={g.school}>
            <SectionTitle icon={School}>{g.school}</SectionTitle>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {g.learners.map((c) => {
                const idx = childIndex++;
                const status = c.summary.attendance_today;
                const statusKey = status ? `parent.attendance.status.${String(status).toLowerCase()}` : 'parent.attendance.status.none';
                const StatusIcon = STATUS_ICON[String(status ?? '').toLowerCase()] ?? HelpCircle;
                const avg = c.summary.academic_average;
                const bal = c.summary.fees.balance;
                return (
                  <Link key={c.learner_access_id} href={`/parent/learners/${c.learner_access_id}`}
                    className="group block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 hover:shadow-md active:scale-[.99] dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-700">
                    <div className="flex items-start gap-3">
                      <Avatar name={c.learner_name} index={idx} />
                      <div className="min-w-0 flex-1">
                        <p className="break-normal text-base font-bold leading-tight text-slate-800 dark:text-white">{c.learner_name}</p>
                        <p className="mt-0.5 break-normal text-sm text-slate-500 dark:text-slate-400">
                          {[c.class_name, c.stream_name].filter(Boolean).join(' · ') || t('parent.common.classNotSet')}
                        </p>
                      </div>
                      <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-300 transition group-hover:text-indigo-500 rtl-flip" />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <StatusPill tone={attendanceTone(status)} icon={StatusIcon}>
                        {t('parent.home.todayStatus', { status: t(statusKey, status ? String(status) : undefined) })}
                      </StatusPill>
                      {c.relationship && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{c.relationship}</span>}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div>
                        <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400"><TrendingUp className="h-3.5 w-3.5" />{t('parent.home.average')}</p>
                        <p className="mt-0.5 text-lg font-bold text-slate-800 dark:text-white"><bdi>{avg == null ? t('parent.common.noData') : `${formatNumber(avg, { maximumFractionDigits: 1 })}%`}</bdi></p>
                        <div className="mt-1.5"><ProgressBar percent={avg} tone={avg == null ? 'neutral' : avg >= 60 ? 'good' : avg >= 40 ? 'warn' : 'bad'} label={t('parent.home.average')} /></div>
                      </div>
                      <div>
                        <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400"><Wallet className="h-3.5 w-3.5" />{t('parent.home.balance')}</p>
                        {c.summary.fees.visible ? (
                          <p className={`mt-0.5 break-normal text-lg font-bold ${bal != null && bal > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            <bdi>{bal == null ? t('parent.common.noData') : bal <= 0 ? t('parent.compare.nothingOwed') : formatMoney(bal)}</bdi>
                          </p>
                        ) : (
                          <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-400"><EyeOff className="h-3.5 w-3.5" />{t('parent.common.hidden')}</p>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {groups && groups.length > 0 && (
        <p className="mt-8 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
          <CalendarCheck className="h-3.5 w-3.5" />{t('parent.home.footer')}
        </p>
      )}
    </PortalPage>
  );
}
