"use client";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Wallet, CreditCard, Receipt, FileText, TrendingDown, Users, Percent, BarChart3, Loader } from 'lucide-react';
import { apiFetch } from '@/lib/apiClient';

const MODULES = [
  { href: '/finance/ledger-v2', label: 'Ledger v2', desc: 'Accounts, fee items, debtors', icon: FileText, accent: 'indigo' },
  { href: '/finance/learners-fees', label: 'Learner Fees', desc: 'Per-student fee status', icon: Users, accent: 'violet' },
  { href: '/finance/payments', label: 'Payments', desc: 'Payment records', icon: Receipt, accent: 'emerald' },
  { href: '/finance/fees', label: 'Fee Structures', desc: 'Class / term fee items', icon: CreditCard, accent: 'sky' },
  { href: '/finance/wallets', label: 'Wallets', desc: 'School wallets', icon: Wallet, accent: 'amber' },
  { href: '/finance/ledger', label: 'Legacy Ledger', desc: 'Old ledger system', icon: BarChart3, accent: 'slate' },
  { href: '/finance/waivers', label: 'Waivers', desc: 'Discounts & waivers', icon: Percent, accent: 'rose' },
  { href: '/finance/expenditures', label: 'Expenditures', desc: 'School spending', icon: TrendingDown, accent: 'orange' },
];

const ACCENT_MAP: Record<string, string> = {
  indigo: 'border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 hover:border-indigo-400',
  violet: 'border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 hover:border-violet-400',
  emerald: 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 hover:border-emerald-400',
  sky:  'border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30 hover:border-sky-400',
  amber: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 hover:border-amber-400',
  slate: 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:border-slate-400',
  rose:  'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 hover:border-rose-400',
  orange: 'border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 hover:border-orange-400',
};

export default function FinanceHome() {
  const [summary, setSummary] = useState<{ total_charged: number; total_paid: number; balance: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch('/api/finance/ledger-reports?type=summary', { silent: true });
        if (data?.summary) setSummary(data.summary);
      } catch { /* non-critical */ } finally {
        setLoading(false);
      }
    })();
  }, []);

  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">Finance</h1>
        <p className="text-xs text-slate-500 mt-0.5">School financial management</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 animate-pulse bg-slate-50 dark:bg-slate-800 h-16" />
          ))
        ) : summary ? (
          <>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Charged</p>
              <p className="text-base font-bold text-slate-800 dark:text-white mt-0.5">{fmt(summary.total_charged)}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 p-4 bg-emerald-50 dark:bg-emerald-950/20">
              <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wide">Collected</p>
              <p className="text-base font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">{fmt(summary.total_paid)}</p>
            </div>
            <div className="rounded-xl border border-red-200 dark:border-red-800 p-4 bg-red-50 dark:bg-red-950/20">
              <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">Outstanding</p>
              <p className="text-base font-bold text-red-700 dark:text-red-300 mt-0.5">{fmt(summary.balance)}</p>
            </div>
          </>
        ) : null}
      </div>

      {/* Module grid */}
      <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
        {MODULES.map(m => {
          const Icon = m.icon;
          return (
            <Link
              key={m.href}
              href={m.href}
              className={`rounded-xl border p-4 transition-colors group ${ACCENT_MAP[m.accent] ?? ACCENT_MAP.slate}`}
            >
              <Icon className="w-5 h-5 text-slate-500 dark:text-slate-400 mb-2 group-hover:scale-110 transition-transform" />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{m.label}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{m.desc}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
