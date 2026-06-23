'use client';

/**
 * Finance dashboard — one trusted, school-scoped view of fees, money locations,
 * budgets, pocket money and operational health.
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart3, Loader2, AlertTriangle, TrendingUp, Wallet, PiggyBank, Receipt, ArrowRight } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';

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
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { const r = await fetch('/api/finance/dashboard', { cache: 'no-store' }); setD(await r.json()); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>;
  if (!d?.success) return <div className="max-w-5xl mx-auto p-6 text-sm text-red-600">Failed to load dashboard.</div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><BarChart3 className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-white">Finance Dashboard</h1><p className="text-sm text-gray-500 dark:text-gray-400">School-scoped totals from the canonical finance tables.</p></div>
      </div>

      {/* Warnings */}
      {d.warnings?.length > 0 && (
        <div className="space-y-2">
          {d.warnings.map((w: any, i: number) => (
            <div key={i} className={`flex items-center gap-2 p-3 rounded-lg text-sm ${w.level === 'danger' ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
              <AlertTriangle className="w-4 h-4" />{w.message}
            </div>
          ))}
        </div>
      )}

      {/* Fees top-line */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Expected fees" value={format(d.fees.expected)} sub={`${d.fees.unpaidLearners} learner(s) owe`} />
        <Stat label="Collected" value={format(d.fees.collected)} tone="green" sub={`${d.fees.collectionRate}% of expected`} />
        <Stat label="Outstanding" value={format(d.fees.outstanding)} tone="red" />
        <Stat label="Today / month" value={format(d.fees.today)} tone="indigo" sub={`${format(d.fees.thisMonth)} this month`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Money by location */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3"><h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Wallet className="w-4 h-4 text-indigo-500" />Money by location</h2><Link href="/finance/locations" className="text-xs text-indigo-600 hover:underline flex items-center gap-1">Manage <ArrowRight className="w-3 h-3" /></Link></div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mb-3">{format(d.money.total)} <span className="text-xs font-normal text-gray-400">total held</span></p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(d.money.byType).map(([t, v]: any) => (
              <div key={t} className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900/40"><p className="text-[11px] text-gray-500">{TYPE_LABEL[t] || t}</p><p className="text-sm font-semibold text-gray-900 dark:text-white">{format(v)}</p></div>
            ))}
            {Object.keys(d.money.byType).length === 0 && <p className="text-xs text-gray-400">No money locations yet.</p>}
          </div>
        </div>

        {/* Budgets + pocket */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-2"><h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2"><TrendingUp className="w-4 h-4 text-indigo-500" />Budgets</h2><Link href="/finance/budgets" className="text-xs text-indigo-600 hover:underline">View</Link></div>
            <p className="text-sm text-gray-600 dark:text-gray-300">{format(d.budgets.spent)} spent of {format(d.budgets.approved)}</p>
            <p className="text-xs text-gray-400">{d.budgets.count} budget(s){d.budgets.over > 0 ? ` · ${d.budgets.over} over` : ''}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-2"><h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2"><PiggyBank className="w-4 h-4 text-indigo-500" />Pocket money</h2><Link href="/finance/pocket-money" className="text-xs text-indigo-600 hover:underline">View</Link></div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{format(d.pocketLiability)}</p>
            <p className="text-xs text-gray-400">held for learners (liability)</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Outstanding by class */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Outstanding by class</h2>
          <table className="w-full text-sm">
            <thead className="text-gray-500"><tr><th className="text-left py-1">Class</th><th className="text-right">Expected</th><th className="text-right">Outstanding</th></tr></thead>
            <tbody>
              {d.balancesByClass.length === 0 && <tr><td colSpan={3} className="py-3 text-center text-gray-400">No fee data.</td></tr>}
              {d.balancesByClass.map((c: any, i: number) => (
                <tr key={i} className="border-t border-gray-100 dark:border-gray-700/50"><td className="py-1.5">{c.class_name}</td><td className="text-right">{format(c.expected)}</td><td className="text-right text-red-600">{format(c.outstanding)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Recent receipts + ops */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-2"><h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Receipt className="w-4 h-4 text-indigo-500" />Recent receipts</h2><Link href="/finance/payments" className="text-xs text-indigo-600 hover:underline">All</Link></div>
            {d.recentReceipts.length === 0 ? <p className="text-xs text-gray-400">No receipts yet.</p> : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {d.recentReceipts.map((r: any, i: number) => (
                  <li key={i} className="py-1.5 flex items-center justify-between text-sm"><span className="text-gray-700 dark:text-gray-300">{r.student_name || '—'} <span className="text-xs text-gray-400 font-mono">{r.receipt_no}</span></span><span className="font-medium">{format(r.amount)}</span></li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Link href="/finance/payments" className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-center hover:border-indigo-400"><p className="text-xl font-bold text-gray-900 dark:text-white">{d.ops.unreconciled}</p><p className="text-[11px] text-gray-500">Unreconciled</p></Link>
            <Link href="/finance/import" className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-center hover:border-indigo-400"><p className="text-xl font-bold text-gray-900 dark:text-white">{d.ops.importPending}</p><p className="text-[11px] text-gray-500">Import drafts</p></Link>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-center"><p className="text-xl font-bold text-gray-900 dark:text-white">{d.fees.paymentsCount}</p><p className="text-[11px] text-gray-500">Payments</p></div>
          </div>
        </div>
      </div>
    </div>
  );
}
