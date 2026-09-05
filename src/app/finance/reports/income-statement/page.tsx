'use client';

/**
 * Income & Expenditure Statement (school-finance equivalent of a P&L).
 *
 * Generated entirely from recorded transactions — nothing here is hand-entered.
 * Revenue has TWO sources and both are shown separately, because for a school
 * fee collections are almost always the overwhelming majority and a statement
 * that hid them inside a single "revenue" number would be useless:
 *
 *   1. Fee collections   finance_payments  (the canonical recordPayment path)
 *   2. Other income      ledger            (manually categorised general income)
 *
 * Replaces a 13-line "Coming Soon" stub. The API already existed; nothing
 * rendered it.
 */

import React, { useState, useMemo } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/utils/fetcher';
import { useCurrency } from '@/hooks/useCurrency';
import { useI18n } from '@/components/i18n/I18nProvider';
import { TrendingUp, TrendingDown, Wallet, Banknote, Smartphone, Landmark } from 'lucide-react';
import { ReportShell, ReportLoading, ReportError, Line, SectionTitle } from '@/components/finance/ReportShell';

type Preset = 'this_month' | 'this_year' | 'last_30' | 'custom';

function rangeFor(preset: Preset): { start: string; end: string } {
  const today = new Date();
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (preset === 'this_month') {
    return { start: iso(new Date(today.getFullYear(), today.getMonth(), 1)), end: iso(today) };
  }
  if (preset === 'this_year') {
    return { start: iso(new Date(today.getFullYear(), 0, 1)), end: iso(today) };
  }
  if (preset === 'last_30') {
    const d = new Date(today);
    d.setDate(d.getDate() - 30);
    return { start: iso(d), end: iso(today) };
  }
  return { start: iso(new Date(today.getFullYear(), 0, 1)), end: iso(today) };
}

export default function IncomeStatementPage() {
  const { t } = useI18n();
  const { format } = useCurrency();
  const [preset, setPreset] = useState<Preset>('this_month');
  const [custom, setCustom] = useState(() => rangeFor('this_month'));

  const range = useMemo(() => (preset === 'custom' ? custom : rangeFor(preset)), [preset, custom]);

  const { data, error, isLoading, mutate } = useSWR(
    `/api/finance/reports/income-statement?start_date=${range.start}&end_date=${range.end}`,
    fetcher,
  );

  if (isLoading) return <ReportLoading />;
  if (error) {
    const status = (error as any)?.status;
    return (
      <ReportError
        message={String((error as Error)?.message ?? error)}
        onRetry={() => mutate()}
        accessDenied={status === 401 || status === 403}
      />
    );
  }
  if (data && data.success === false) return <ReportError message={data.error} onRetry={() => mutate()} />;

  const d = data?.data;
  const s = d?.summary ?? {};
  const fees = d?.fee_collections ?? {};

  const feeIncome = Number(s.fee_income ?? 0);
  const ledgerIncome = Number(s.ledger_income ?? 0);
  const totalIncome = Number(s.total_income ?? 0);
  const totalExpenses = Number(s.total_expenses ?? 0);
  const netIncome = Number(s.net_income ?? 0);
  const profitable = netIncome >= 0;

  const incomeRows = (d?.income?.transactions ?? []).filter((r: any) => Number(r.total_amount) > 0);
  const expenseRows = (d?.expenses?.transactions ?? []).filter((r: any) => Number(r.total_amount) > 0);

  const methods = [
    { key: 'cash_collected', label: t('finance.cash', 'Cash'), Icon: Banknote },
    { key: 'mpesa_collected', label: t('finance.mobileMoney', 'Mobile money'), Icon: Smartphone },
    { key: 'bank_collected', label: t('finance.bank', 'Bank transfer'), Icon: Landmark },
    { key: 'other_collected', label: t('common.other', 'Other'), Icon: Wallet },
  ];

  return (
    <ReportShell
      title={t('finance.incomeStatement', 'Income & Expenditure Statement')}
      subtitle={t('finance.incomeStatementSub', 'Income and expenses, generated from recorded transactions')}
      periodLabel={`${range.start} → ${range.end}`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as Preset)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-200"
          >
            <option value="this_month">{t('finance.thisMonth', 'This month')}</option>
            <option value="last_30">{t('finance.last30', 'Last 30 days')}</option>
            <option value="this_year">{t('finance.thisYear', 'This year')}</option>
            <option value="custom">{t('common.custom', 'Custom range')}</option>
          </select>
          {preset === 'custom' && (
            <>
              <input
                type="date"
                value={custom.start}
                onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-200"
              />
              <input
                type="date"
                value={custom.end}
                onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-200"
              />
            </>
          )}
        </div>
      }
    >
      {/* Headline */}
      <div className="grid gap-3 sm:grid-cols-3 mb-2">
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            {t('finance.totalRevenue', 'Total revenue')}
          </p>
          <p className="text-xl font-extrabold text-emerald-900 dark:text-emerald-200 mt-1 tabular-nums">
            {format(totalIncome)}
          </p>
        </div>
        <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
            {t('finance.totalExpenses', 'Total expenses')}
          </p>
          <p className="text-xl font-extrabold text-rose-900 dark:text-rose-200 mt-1 tabular-nums">
            {format(totalExpenses)}
          </p>
        </div>
        <div
          className={`rounded-xl border p-4 ${
            profitable
              ? 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50'
              : 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40'
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1">
            {profitable ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {t('finance.netIncome', 'Net income')}
          </p>
          <p
            className={`text-xl font-extrabold mt-1 tabular-nums ${
              profitable ? 'text-slate-900 dark:text-white' : 'text-amber-900 dark:text-amber-200'
            }`}
          >
            {format(netIncome)}
          </p>
          {totalIncome > 0 && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {s.profit_margin}% {t('finance.margin', 'surplus margin')}
            </p>
          )}
        </div>
      </div>

      {/* Revenue */}
      <SectionTitle>{t('finance.revenue', 'Revenue')}</SectionTitle>

      <Line
        label={t('finance.feeCollections', 'Fee collections')}
        hint={`${Number(fees.total_transactions ?? 0)} ${t('finance.transactions', 'transactions')}`}
        value={format(feeIncome)}
      />
      {feeIncome > 0 &&
        methods.map(({ key, label, Icon }) => {
          const v = Number(fees[key] ?? 0);
          if (!v) return null;
          return (
            <Line
              key={key}
              indent={1}
              emphasis="muted"
              label={
                <span className="inline-flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </span>
              }
              value={format(v)}
            />
          );
        })}

      {incomeRows.length > 0 && (
        <>
          <Line
            label={t('finance.otherIncome', 'Other income')}
            hint={t('finance.fromLedger', 'From categorised ledger entries')}
            value={format(ledgerIncome)}
          />
          {incomeRows.map((r: any) => (
            <Line
              key={r.category_id}
              indent={1}
              emphasis="muted"
              label={r.category_name}
              value={format(Number(r.total_amount))}
            />
          ))}
        </>
      )}

      <Line label={t('finance.totalRevenue', 'Total revenue')} value={format(totalIncome)} emphasis="subtotal" />

      {/* Expenses */}
      <SectionTitle>{t('finance.expenses', 'Expenses')}</SectionTitle>

      {expenseRows.length === 0 ? (
        <Line
          emphasis="muted"
          label={t('finance.noExpenses', 'No expenses recorded in this period')}
          value={format(0)}
        />
      ) : (
        expenseRows.map((r: any) => (
          <Line key={r.category_id} label={r.category_name} value={format(Number(r.total_amount))} />
        ))
      )}

      <Line label={t('finance.totalExpenses', 'Total expenses')} value={format(totalExpenses)} emphasis="subtotal" />

      {/* Bottom line */}
      <div className="mt-4">
        <Line
          label={profitable ? t('finance.netSurplus', 'Net surplus') : t('finance.netDeficit', 'Net deficit')}
          value={format(netIncome)}
          emphasis="total"
        />
      </div>

      {ledgerIncome === 0 && expenseRows.length === 0 && (
        <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-4">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {t('finance.onlyFeesTitle', 'This statement shows fee collections only')}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            {t(
              'finance.onlyFeesHint',
              'No categorised ledger income or expenses were recorded for this period. Record expenses under Expenditures, and other income in the Ledger, to see a full income and expenditure statement.',
            )}
          </p>
        </div>
      )}
    </ReportShell>
  );
}
