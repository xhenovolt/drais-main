'use client';

/**
 * Finance dashboard — one trusted, school-scoped view of fees, money locations,
 * budgets, pocket money and operational health.
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart3, Loader2, AlertTriangle, TrendingUp, Wallet, PiggyBank, Receipt, ArrowRight } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';
import { useI18n } from '@/components/i18n/I18nProvider';

// English fallbacks for money-location types; localized at render via t().
const TYPE_LABEL: Record<string, string> = {
  cash_bursar: 'Cash (Bursar)', cash_headteacher: 'Cash (Head)', cash: 'Cash',
  bank: 'Bank', mobile_money: 'Mobile Money', schoolpay: 'School Pay', surepay: 'SurePay', other: 'Other',
};

function Stat({ label, value, sub, tone = 'gray' }: { label: string; value: string; sub?: string; tone?: string }) {
  const tones: Record<string, string> = {
    gray: 'text-gray-900 dark:text-white', green: 'text-green-600 dark:text-green-400',
    red: 'text-red-600 dark:text-red-400', indigo: 'text-indigo-600 dark:text-indigo-400',
  };
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${tones[tone]}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function FinanceDashboard() {
  const { format } = useCurrency();
  const { t } = useI18n();
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/finance/dashboard', { cache: 'no-store' });
        const body = await r.json().catch(() => null);
        if (!r.ok || body?.success === false) {
          setLoadError(body?.error || `Failed to load dashboard (${r.status})`);
          setD(null);
          return;
        }
        setD(body);
      } catch {
        setLoadError('Network error. Check your connection.');
        setD(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>;
  if (!d?.success) {
    const denied = loadError?.toLowerCase().includes('forbidden') || loadError?.toLowerCase().includes('permission');
    return (
      <div className="max-w-5xl mx-auto p-6 text-sm text-red-600">
        {denied ? t('financeDash.accessDenied', 'You do not have permission to view the finance dashboard.') : (loadError || t('financeDash.failedLoad', 'Failed to load dashboard.'))}
      </div>
    );
  }

  const warnings = Array.isArray(d.warnings) ? d.warnings : [];
  const balancesByClass = Array.isArray(d.balancesByClass) ? d.balancesByClass : [];
  const recentReceipts = Array.isArray(d.recentReceipts) ? d.recentReceipts : [];
  const moneyByType = d.money?.byType && typeof d.money.byType === 'object' ? d.money.byType : {};

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><BarChart3 className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('financeDash.title', 'Finance Dashboard')}</h1><p className="text-sm text-gray-500 dark:text-gray-400">{t('financeDash.subtitle', 'School-scoped totals from the canonical finance tables.')}</p></div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((w: any, i: number) => (
            <div key={i} className={`flex items-center gap-2 p-3 rounded-lg text-sm ${w.level === 'danger' ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
              <AlertTriangle className="w-4 h-4" />{w.message}
            </div>
          ))}
        </div>
      )}

      {/* Fees top-line */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label={t('financeDash.expectedFees', 'Expected fees')} value={format(d.fees.expected)} sub={`${d.fees.unpaidLearners} ${t('financeDash.learnersOwe', 'learner(s) owe')}`} />
        <Stat label={t('financeDash.collected', 'Collected')} value={format(d.fees.collected)} tone="green" sub={`${d.fees.collectionRate}% ${t('financeDash.ofExpected', 'of expected')}`} />
        <Stat label={t('financeDash.outstanding', 'Outstanding')} value={format(d.fees.outstanding)} tone="red" />
        <Stat label={t('financeDash.todayMonth', 'Today / month')} value={format(d.fees.today)} tone="indigo" sub={`${format(d.fees.thisMonth)} ${t('financeDash.thisMonth', 'this month')}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Money by location */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3"><h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Wallet className="w-4 h-4 text-indigo-500" />{t('financeDash.moneyByLocation', 'Money by location')}</h2><Link href="/finance/locations" className="text-xs text-indigo-600 hover:underline flex items-center gap-1">{t('financeDash.manage', 'Manage')} <ArrowRight className="w-3 h-3" /></Link></div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mb-3">{format(d.money.total)} <span className="text-xs font-normal text-gray-400">{t('financeDash.totalHeld', 'total held')}</span></p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(moneyByType).map(([mt, v]: any) => (
              <div key={mt} className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900/40"><p className="text-[11px] text-gray-500">{t(`financeDash.types.${mt}`, TYPE_LABEL[mt] || mt)}</p><p className="text-sm font-semibold text-gray-900 dark:text-white">{format(v)}</p></div>
            ))}
            {Object.keys(moneyByType).length === 0 && <p className="text-xs text-gray-400">{t('financeDash.noMoneyLocations', 'No money locations yet.')}</p>}
          </div>
        </div>

        {/* Budgets + pocket */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-2"><h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2"><TrendingUp className="w-4 h-4 text-indigo-500" />{t('financeDash.budgets', 'Budgets')}</h2><Link href="/finance/budgets" className="text-xs text-indigo-600 hover:underline">{t('financeDash.view', 'View')}</Link></div>
            <p className="text-sm text-gray-600 dark:text-gray-300">{format(d.budgets.spent)} {t('financeDash.spentOf', 'spent of')} {format(d.budgets.approved)}</p>
            <p className="text-xs text-gray-400">{d.budgets.count} {t('financeDash.budgetsCount', 'budget(s)')}{d.budgets.over > 0 ? ` · ${d.budgets.over} ${t('financeDash.over', 'over')}` : ''}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-2"><h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2"><PiggyBank className="w-4 h-4 text-indigo-500" />{t('financeDash.pocketMoney', 'Pocket money')}</h2><Link href="/finance/pocket-money" className="text-xs text-indigo-600 hover:underline">{t('financeDash.view', 'View')}</Link></div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{format(d.pocketLiability)}</p>
            <p className="text-xs text-gray-400">{t('financeDash.heldForLearners', 'held for learners (liability)')}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Outstanding by class */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('financeDash.outstandingByClass', 'Outstanding by class')}</h2>
          <table className="w-full text-sm">
            <thead className="text-gray-500"><tr><th className="text-left py-1">{t('financeDash.colClass', 'Class')}</th><th className="text-right">{t('financeDash.colExpected', 'Expected')}</th><th className="text-right">{t('financeDash.colOutstanding', 'Outstanding')}</th></tr></thead>
            <tbody>
              {balancesByClass.length === 0 && <tr><td colSpan={3} className="py-3 text-center text-gray-400">{t('financeDash.noFeeData', 'No fee data.')}</td></tr>}
              {balancesByClass.map((c: any, i: number) => (
                <tr key={i} className="border-t border-gray-100 dark:border-gray-700/50"><td className="py-1.5">{c.class_name}</td><td className="text-right">{format(c.expected)}</td><td className="text-right text-red-600">{format(c.outstanding)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Recent receipts + ops */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-2"><h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Receipt className="w-4 h-4 text-indigo-500" />{t('financeDash.recentReceipts', 'Recent receipts')}</h2><Link href="/finance/payments" className="text-xs text-indigo-600 hover:underline">{t('financeDash.all', 'All')}</Link></div>
            {recentReceipts.length === 0 ? <p className="text-xs text-gray-400">{t('financeDash.noReceipts', 'No receipts yet.')}</p> : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {recentReceipts.map((r: any, i: number) => (
                  <li key={i} className="py-1.5 flex items-center justify-between text-sm"><span className="text-gray-700 dark:text-gray-300">{r.student_name || '—'} <span className="text-xs text-gray-400 font-mono">{r.receipt_no}</span></span><span className="font-medium">{format(r.amount)}</span></li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Link href="/finance/payments" className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-center hover:border-indigo-400"><p className="text-xl font-bold text-gray-900 dark:text-white">{d.ops.unreconciled}</p><p className="text-[11px] text-gray-500">{t('financeDash.unreconciled', 'Unreconciled')}</p></Link>
            <Link href="/finance/import" className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-center hover:border-indigo-400"><p className="text-xl font-bold text-gray-900 dark:text-white">{d.ops.importPending}</p><p className="text-[11px] text-gray-500">{t('financeDash.importDrafts', 'Import drafts')}</p></Link>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-center"><p className="text-xl font-bold text-gray-900 dark:text-white">{d.fees.paymentsCount}</p><p className="text-[11px] text-gray-500">{t('financeDash.payments', 'Payments')}</p></div>
          </div>
        </div>
      </div>
    </div>
  );
}
