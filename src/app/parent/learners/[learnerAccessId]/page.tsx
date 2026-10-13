'use client';
/**
 * /parent/learners/[learnerAccessId] — one learner. Tabs: attendance, academics, fees, receipts,
 * pocket money, reports. Data comes from /api/parent/learners/[id]/<tab>; only what the school
 * shares with parents is returned.
 */
import React, { use, useState } from 'react';
import useSWR from 'swr';
import { CalendarCheck, TrendingUp, Wallet, Receipt, FileText, PiggyBank, CheckCircle2, Clock, XCircle, HelpCircle, EyeOff, ArrowDownLeft, ArrowUpRight, School, Info } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { PortalPage, PortalHeader, Card, Avatar, StatTile, StatusPill, ProgressBar, EmptyState, LoadingBlock, attendanceTone } from '@/components/parent/PortalUI';

const fetcher = (u: string) => fetch(u).then((r) => r.json());
type Tab = 'attendance' | 'academics' | 'fees' | 'receipts' | 'pocket-money' | 'reports';
const TABS: { key: Tab; labelKey: string; icon: React.ElementType }[] = [
  { key: 'attendance',   labelKey: 'parent.learner.tabs.attendance',  icon: CalendarCheck },
  { key: 'academics',    labelKey: 'parent.learner.tabs.academics',   icon: TrendingUp },
  { key: 'fees',         labelKey: 'parent.learner.tabs.fees',        icon: Wallet },
  { key: 'receipts',     labelKey: 'parent.learner.tabs.receipts',    icon: Receipt },
  { key: 'pocket-money', labelKey: 'parent.learner.tabs.pocketMoney', icon: PiggyBank },
  { key: 'reports',      labelKey: 'parent.learner.tabs.reports',     icon: FileText },
];
const STATUS_ICON: Record<string, React.ElementType> = { present: CheckCircle2, late: Clock, absent: XCircle };

export default function LearnerDetail({ params }: { params: Promise<{ learnerAccessId: string }> }) {
  const { learnerAccessId: id } = use(params);
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('attendance');
  const base = `/api/parent/learners/${id}`;

  const { data: list } = useSWR('/api/parent/learners', fetcher);
  const card = list?.learners?.find((l: any) => l.learner_access_id === id)
    ?? list?.grouped_by_school?.flatMap((g: any) => g.learners ?? []).find((l: any) => l.learner_access_id === id);
  const { data } = useSWR(`${base}/${tab}`, fetcher);

  return (
    <PortalPage width="max-w-3xl">
      <PortalHeader title={card?.learner_name ?? t('parent.learner.fallbackName')} backHref="/parent"
        subtitle={card ? [card.class_name, card.stream_name].filter(Boolean).join(' · ') || t('parent.common.classNotSet') : undefined}>
        {card && (
          <div className="flex items-start gap-3 rounded-2xl bg-white/10 p-3">
            <Avatar name={card.learner_name} size="lg" />
            <p className="flex min-w-0 items-start gap-1.5 self-center text-sm text-indigo-50">
              <School className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0 break-normal leading-snug">{card.school_name}</span>
            </p>
          </div>
        )}
      </PortalHeader>

      {/* Tabs scroll sideways on a phone; the active one is always a filled pill. */}
      <div role="tablist" aria-label={t('parent.learner.sections')} className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {TABS.map((x) => (
          <button key={x.key} role="tab" aria-selected={tab === x.key} onClick={() => setTab(x.key)}
            className={`inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition ${
              tab === x.key
                ? 'bg-indigo-600 text-white shadow shadow-indigo-600/30'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700'
            }`}>
            <x.icon className="h-4 w-4" />{t(x.labelKey)}
          </button>
        ))}
      </div>

      {!data ? <LoadingBlock /> : (
        <>
          {tab === 'attendance'   && <Attendance data={data} />}
          {tab === 'academics'    && <Academics data={data} />}
          {tab === 'fees'         && <Fees data={data} />}
          {tab === 'receipts'     && <Receipts data={data} />}
          {tab === 'pocket-money' && <PocketMoney data={data} />}
          {tab === 'reports'      && <Reports data={data} />}
        </>
      )}
    </PortalPage>
  );
}

function NotShared() {
  const { t } = useI18n();
  return <Card><EmptyState icon={EyeOff} title={t('parent.learner.feesNotShared')} hint={t('parent.learner.feesNotSharedHint')} /></Card>;
}

/** A list row: main line + muted line on one side, a value on the other. */
function Row({ title, sub, end, endTone }: { title: React.ReactNode; sub?: React.ReactNode; end?: React.ReactNode; endTone?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="break-normal text-sm font-medium text-slate-800 dark:text-slate-100">{title}</p>
        {sub && <p className="mt-0.5 break-normal text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
      </div>
      {end != null && <div className={`shrink-0 text-end text-sm font-semibold ${endTone ?? 'text-slate-700 dark:text-slate-200'}`}>{end}</div>}
    </div>
  );
}
const LIST = 'divide-y divide-slate-100 dark:divide-slate-800';

/** Arrival comes as a full timestamp or a bare "08:12:00"; returns '' when there is nothing usable. */
function arrivalTime(value: unknown, formatDate: (v: any, style?: any) => string): string {
  if (!value) return '';
  const s = String(value);
  if (/^\d{1,2}:\d{2}/.test(s)) return s.slice(0, 5);
  const out = formatDate(s, 'time');
  return out === '—' ? '' : out;
}

function Attendance({ data }: { data: any }) {
  const { t, formatDate, formatNumber } = useI18n();
  const s = data.summary ?? {};
  const rate = s.rate == null ? null : Number(s.rate);
  const days: any[] = data.days ?? [];
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{t('parent.attendance.rate')}</p>
            <p className="text-3xl font-bold text-slate-800 dark:text-white"><bdi>{rate == null ? t('parent.common.noData') : `${formatNumber(rate, { maximumFractionDigits: 1 })}%`}</bdi></p>
          </div>
          {data.window_days ? <p className="text-xs text-slate-400">{t('parent.attendance.window', { days: data.window_days })}</p> : null}
        </div>
        <div className="mt-3"><ProgressBar percent={rate} tone={rate == null ? 'neutral' : rate >= 90 ? 'good' : rate >= 75 ? 'warn' : 'bad'} label={t('parent.attendance.rate')} /></div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <StatTile label={t('parent.attendance.status.present')} value={formatNumber(s.present ?? 0)} tone="good" icon={CheckCircle2} />
          <StatTile label={t('parent.attendance.status.late')} value={formatNumber(s.late ?? 0)} tone="warn" icon={Clock} />
          <StatTile label={t('parent.attendance.status.absent')} value={formatNumber(s.absent ?? 0)} tone="bad" icon={XCircle} />
        </div>
      </Card>

      <Card>
        <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300">{t('parent.attendance.recentDays')}</p>
        {days.length === 0 ? <EmptyState icon={CalendarCheck} title={t('parent.attendance.none')} /> : (
          <div className={LIST}>
            {days.map((d, i) => {
              const key = String(d.status ?? '').toLowerCase();
              const Icon = STATUS_ICON[key] ?? HelpCircle;
              return (
                <div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">{formatDate(d.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    {arrivalTime(d.arrival, formatDate) && <span className="block text-xs text-slate-500 dark:text-slate-400">{t('parent.attendance.arrivedAt', { time: arrivalTime(d.arrival, formatDate) })}</span>}
                  </span>
                  <StatusPill tone={attendanceTone(d.status)} icon={Icon}>{t(`parent.attendance.status.${key}`, d.status ? String(d.status) : t('parent.common.noData'))}</StatusPill>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function Academics({ data }: { data: any }) {
  const { t } = useI18n();
  const subjects: any[] = data.subjects ?? [];
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 px-1 text-xs text-slate-500 dark:text-slate-400"><Info className="h-3.5 w-3.5 shrink-0" />{t('parent.academics.releasedOnly')}</p>
      {subjects.length === 0 ? <Card><EmptyState icon={TrendingUp} title={t('parent.academics.none')} hint={t('parent.academics.noneHint')} /></Card> : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {subjects.map((s) => (
            <Card key={s.subject} className="p-4">
              <p className="mb-3 break-normal text-base font-bold text-slate-800 dark:text-white">{s.subject}</p>
              <ul className="space-y-3">
                {(s.results ?? []).map((r: any, i: number) => {
                  const score = r.score == null ? null : Number(r.score);
                  return (
                    <li key={i}>
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <span className="min-w-0 break-normal text-sm text-slate-600 dark:text-slate-300">{r.exam}</span>
                        <span className="shrink-0 text-sm font-bold text-slate-800 dark:text-white"><bdi>{r.score ?? '—'}{r.grade ? ` · ${r.grade}` : ''}</bdi></span>
                      </div>
                      <ProgressBar percent={score} tone={score == null ? 'neutral' : score >= 60 ? 'good' : score >= 40 ? 'warn' : 'bad'} label={`${s.subject} — ${r.exam}`} />
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Fees({ data }: { data: any }) {
  const { t, formatMoney, formatDate } = useI18n();
  if (data.visible === false) return <NotShared />;
  const expected = data.fees?.expected == null ? null : Number(data.fees.expected);
  const paid = data.fees?.paid == null ? null : Number(data.fees.paid);
  const balance = data.fees?.balance == null ? null : Number(data.fees.balance);
  const paidPct = expected && expected > 0 && paid != null ? (paid / expected) * 100 : null;
  const payments: any[] = data.payments ?? [];
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{t('parent.fees.balance')}</p>
        <p className={`text-3xl font-bold ${balance != null && balance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
          <bdi>{balance == null ? t('parent.common.noData') : balance <= 0 ? t('parent.compare.nothingOwed') : formatMoney(balance)}</bdi>
        </p>
        <div className="mt-3"><ProgressBar percent={paidPct} tone="good" label={t('parent.fees.paid')} /></div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <StatTile label={t('parent.fees.expected')} value={formatMoney(expected)} />
          <StatTile label={t('parent.fees.paid')} value={formatMoney(paid)} tone="good" />
        </div>
      </Card>
      <Card>
        <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300">{t('parent.fees.payments')}</p>
        {payments.length === 0 ? <EmptyState icon={Wallet} title={t('parent.fees.noPayments')} /> : (
          <div className={LIST}>
            {payments.map((p, i) => (
              <Row key={i} title={<bdi>{formatMoney(p.amount)}</bdi>} sub={p.receipt_no || p.method || undefined} end={formatDate(p.at, 'medium', '')} endTone="text-slate-500 dark:text-slate-400 font-normal" />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Receipts({ data }: { data: any }) {
  const { t, formatMoney, formatDate } = useI18n();
  if (data.visible === false) return <NotShared />;
  const receipts: any[] = data.receipts ?? [];
  return (
    <Card>
      {receipts.length === 0 ? <EmptyState icon={Receipt} title={t('parent.receipts.none')} /> : (
        <div className={LIST}>
          {receipts.map((r) => (
            <Row key={r.id} title={<bdi>{r.receipt_no}</bdi>} sub={[r.method, formatDate(r.at, 'medium', '')].filter(Boolean).join(' · ')} end={<bdi>{formatMoney(r.amount)}</bdi>} />
          ))}
        </div>
      )}
    </Card>
  );
}

function PocketMoney({ data }: { data: any }) {
  const { t, formatMoney, formatDate } = useI18n();
  if (data.visible === false) return <NotShared />;
  if (data.enabled === false) return <Card><EmptyState icon={PiggyBank} title={t('parent.pocketMoney.notSetUp')} /></Card>;
  const tx: any[] = data.transactions ?? [];
  return (
    <div className="space-y-4">
      <StatTile label={t('parent.pocketMoney.balance')} value={formatMoney(data.balance)} tone="brand" icon={PiggyBank} />
      <Card>
        {tx.length === 0 ? <EmptyState icon={PiggyBank} title={t('parent.pocketMoney.none')} /> : (
          <div className={LIST}>
            {tx.map((x, i) => {
              const deposit = x.type === 'deposit';
              const Icon = deposit ? ArrowDownLeft : ArrowUpRight;
              return (
                <Row key={i}
                  title={<span className="inline-flex items-center gap-1.5"><Icon className={`h-4 w-4 ${deposit ? 'text-emerald-600' : 'text-rose-600'}`} />{t(`parent.pocketMoney.type.${deposit ? 'deposit' : 'withdrawal'}`)}</span>}
                  sub={[x.note, formatDate(x.at, 'medium', '')].filter(Boolean).join(' · ') || undefined}
                  end={<bdi>{formatMoney(x.amount)}</bdi>} endTone={deposit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'} />
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function Reports({ data }: { data: any }) {
  const { t, formatDate } = useI18n();
  const reports: any[] = data.reports ?? [];
  return (
    <Card>
      {reports.length === 0 ? <EmptyState icon={FileText} title={t('parent.reports.none')} hint={t('parent.reports.noneHint')} /> : (
        <div className={LIST}>
          {reports.map((r) => (
            <Row key={r.id} title={t('parent.reports.typeReport', { type: r.type ?? '' })} sub={[r.term, r.year].filter(Boolean).join(' · ') || undefined} end={formatDate(r.createdAt, 'medium', '')} endTone="text-slate-500 dark:text-slate-400 font-normal" />
          ))}
        </div>
      )}
    </Card>
  );
}
