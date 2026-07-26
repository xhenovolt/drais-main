'use client';

/**
 * Control Center — Business Intelligence (Phase 24). MRR/ARR, revenue,
 * outstanding, school + plan mix, churn. Built on the billing ledger.
 */
import React from 'react';
import useSWR from 'swr';
import { TrendingUp, DollarSign, AlertCircle, School, Loader2, CreditCard } from 'lucide-react';
import { ExportButtons } from '@/app/control/_components/ExportButtons';

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then(r => r.json());

export default function ControlBI() {
  const { data, isLoading } = useSWR<any>('/api/control-center/bi', fetcher, { refreshInterval: 120_000 });
  const cur = data?.currency || 'UGX';
  const money = (n: any) => `${cur} ${Number(n || 0).toLocaleString()}`;
  const planMix = data?.plan_mix || [];

  const tiles = [
    { label: 'MRR', value: money(data?.mrr), sub: 'monthly recurring', icon: TrendingUp, accent: 'text-emerald-400' },
    { label: 'ARR', value: money(data?.arr), sub: 'annualised', icon: TrendingUp, accent: 'text-emerald-400' },
    { label: 'Collected (30d)', value: money(data?.revenue?.last_30d), sub: `${money(data?.revenue?.all_time)} all-time`, icon: DollarSign, accent: 'text-sky-400' },
    { label: 'Outstanding', value: money(data?.outstanding), sub: 'unpaid invoices', icon: AlertCircle, accent: Number(data?.outstanding) > 0 ? 'text-rose-400' : 'text-slate-400' },
    { label: 'Active schools', value: (data?.schools?.active ?? 0).toLocaleString(), sub: `${data?.schools?.suspended ?? 0} suspended · ${data?.schools?.archived ?? 0} archived`, icon: School, accent: 'text-indigo-400' },
    { label: 'Churn (30d)', value: (data?.churn_30d ?? 0).toLocaleString(), sub: 'newly suspended', icon: AlertCircle, accent: Number(data?.churn_30d) > 0 ? 'text-amber-400' : 'text-slate-400' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">Platform business intelligence</p>
        <ExportButtons filename="drais-bi-plan-mix" rows={planMix} columns={[
          { key: 'name', label: 'Plan' }, { key: 'code', label: 'Code' }, { key: 'count', label: 'Active schools' },
        ]} />
      </div>
      {isLoading && !data && <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-400 inline" /></div>}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {tiles.map(({ label, value, sub, icon: Icon, accent }) => (
          <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-400">{label}</span>
              <Icon className={`w-4 h-4 ${accent}`} />
            </div>
            <div className="text-2xl font-bold text-slate-100 tabular-nums">{value ?? '—'}</div>
            <div className="text-[11px] text-slate-500">{sub}</div>
          </div>
        ))}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <p className="text-sm font-semibold text-slate-200 mb-2 flex items-center gap-1.5"><CreditCard className="w-4 h-4 text-indigo-400" /> Plan mix (active schools)</p>
        {planMix.length === 0 ? <p className="text-xs text-slate-500">No plans assigned yet.</p> : (
          <div className="space-y-1.5">
            {planMix.map((p: any) => {
              const total = planMix.reduce((a: number, b: any) => a + b.count, 0) || 1;
              const pct = Math.round((p.count / total) * 100);
              return (
                <div key={p.code}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="text-slate-300">{p.name || p.code}</span>
                    <span className="text-slate-400">{p.count} · {pct}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <p className="text-[11px] text-slate-500">MRR normalises each active school's plan to a monthly figure; collected/outstanding come from the billing ledger. Assign plans + record payments for these to populate.</p>
    </div>
  );
}
