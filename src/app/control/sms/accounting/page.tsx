'use client';

/**
 * Control Center — SMS Accounting.
 * Answers the questions the economics/providers pages don't: how many SMS a
 * school actually sends per day, what that implies for the rest of the
 * month at the current rate, and how its parent contact book splits across
 * MTN vs Airtel.
 */
import React from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { BarChart3, Loader2, ArrowRight, Smartphone } from 'lucide-react';

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then((r) => r.json());
const nf = (n: any) => Number(n || 0).toLocaleString();

export default function SmsAccountingPage() {
  const { data, isLoading, error } = useSWR<any>('/api/control-center/sms/accounting', fetcher, { refreshInterval: 60_000 });
  const rows: any[] = data?.rows || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <BarChart3 className="w-5 h-5 text-indigo-400 mt-0.5" />
          <div>
            <h1 className="text-sm font-semibold text-slate-100">SMS Accounting</h1>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Daily sending rate, a projected month-end total at that rate, and each school&apos;s parent
              contact book split by network. MTN/Airtel is a best-effort guess from the phone number&apos;s
              prefix — a ported number still shows under its original network.
            </p>
          </div>
        </div>
        <Link href="/control/sms" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 shrink-0">
          Economics <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {error && (
        <section className="bg-rose-950/40 border border-rose-800/60 rounded-xl p-4">
          <div className="text-sm font-semibold text-rose-200">Accounting data could not load</div>
          <p className="text-xs text-rose-300 mt-1">{error.message || 'Unknown error'}</p>
        </section>
      )}

      {/* Cards on phone, table from md up — 8 columns is unreadable at phone width. */}
      <div className="md:hidden space-y-2">
        {isLoading && <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-center"><Loader2 className="w-5 h-5 animate-spin text-indigo-400 inline" /></div>}
        {!isLoading && rows.length === 0 && <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-center text-slate-500 text-sm">No schools.</div>}
        {rows.map((r) => (
          <div key={r.school_id} className="rounded-xl border border-slate-800 bg-slate-900 p-3 space-y-2">
            <div className="text-slate-100 font-medium text-sm">{r.name}</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><div className="text-slate-500 text-[10px] uppercase">Avg/day (active)</div><div className="tabular-nums text-slate-200 mt-0.5">{nf(r.avg_per_active_day)}</div></div>
              <div><div className="text-slate-500 text-[10px] uppercase">This month</div><div className="tabular-nums text-slate-200 mt-0.5">{nf(r.total_this_month)}</div></div>
              <div><div className="text-slate-500 text-[10px] uppercase">Projected month end</div><div className="tabular-nums text-amber-300 mt-0.5">{nf(r.projected_month_total)}</div></div>
              <div><div className="text-slate-500 text-[10px] uppercase">Active days (30d)</div><div className="tabular-nums text-slate-200 mt-0.5">{nf(r.active_days_window)}</div></div>
            </div>
            <div className="flex items-center gap-1.5 text-xs pt-1 border-t border-slate-800">
              <Smartphone className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-sky-300 font-medium">{nf(r.contacts.mtn)}</span> MTN ·{' '}
              <span className="text-rose-300 font-medium">{nf(r.contacts.airtel)}</span> Airtel ·{' '}
              <span className="text-slate-400 font-medium">{nf(r.contacts.other)}</span> other ·{' '}
              <span className="text-slate-500">{nf(r.contacts.total)} total</span>
            </div>
          </div>
        ))}
      </div>
      <div className="hidden md:block bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-500 border-b border-slate-800 text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">School</th>
              <th className="px-3 py-2 text-right">Avg/day (active days)</th>
              <th className="px-3 py-2 text-right">Active days (30d)</th>
              <th className="px-3 py-2 text-right">This month</th>
              <th className="px-3 py-2 text-right">Projected month end</th>
              <th className="px-3 py-2 text-right">MTN contacts</th>
              <th className="px-3 py-2 text-right">Airtel contacts</th>
              <th className="px-3 py-2 text-right">Other</th>
              <th className="px-3 py-2 text-right">Total contacts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {isLoading && <tr><td colSpan={9} className="px-3 py-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-indigo-400 inline" /></td></tr>}
            {!isLoading && rows.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">No schools.</td></tr>}
            {rows.map((r) => (
              <tr key={r.school_id}>
                <td className="px-3 py-2 text-slate-200">{r.name}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-200">{nf(r.avg_per_active_day)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-400">{nf(r.active_days_window)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-200">{nf(r.total_this_month)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-amber-300 font-medium">{nf(r.projected_month_total)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-sky-300">{nf(r.contacts.mtn)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-rose-300">{nf(r.contacts.airtel)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-400">{nf(r.contacts.other)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-200">{nf(r.contacts.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">
        "Avg/day (active days)" divides this month&apos;s segments by the days the school actually sent something — a
        school that just onboarded isn&apos;t dragged down by the days before it existed. "Projected month end" is
        this month&apos;s total so far plus that average × the days left in the month: a plausible cap if the
        current rate holds, not a hard limit.
      </p>
    </div>
  );
}
