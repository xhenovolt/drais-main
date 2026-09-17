'use client';

/**
 * Control Center — SMS Financial Control Center (P5).
 * Provider balance + estimated capacity, per-school allocation vs used vs
 * remaining, and the internal-cost-vs-retail-price economics (profit per SMS).
 * Allocate credits so one school can't burn another's.
 */
import React, { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { MessageSquare, Loader2, Wallet, Save, TrendingUp, Send, CheckCircle2, XCircle, ArrowRight, Settings2 } from 'lucide-react';

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then(r => r.json());
const nf = (n: any) => Number(n || 0).toLocaleString();
const money = (n: any) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function ControlSms() {
  const { data, isLoading, mutate } = useSWR<any>('/api/control-center/sms', fetcher, { refreshInterval: 60_000 });
  const provider = data?.provider;
  const pricing = data?.pricing;
  const totals = data?.totals;
  const rows = data?.rows || [];

  const [edits, setEdits] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<number | null>(null);

  const [priceEdits, setPriceEdits] = useState<{ internal_cost?: string; retail_price?: string }>({});
  const [savingPrice, setSavingPrice] = useState(false);

  const save = async (schoolId: number) => {
    const val = edits[schoolId];
    if (val === undefined) return;
    setSaving(schoolId);
    try {
      await fetch('/api/control-center/sms', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, quota: Number(val) }),
      });
      setEdits((e) => { const n = { ...e }; delete n[schoolId]; return n; });
      await mutate();
    } finally { setSaving(null); }
  };

  const savePricing = async () => {
    const internalCost = priceEdits.internal_cost !== undefined ? Number(priceEdits.internal_cost) : pricing?.internal_cost;
    const retailPrice = priceEdits.retail_price !== undefined ? Number(priceEdits.retail_price) : pricing?.retail_price;
    if (!Number.isFinite(internalCost) || internalCost <= 0 || !Number.isFinite(retailPrice) || retailPrice <= 0) return;
    setSavingPrice(true);
    try {
      await fetch('/api/control-center/sms', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ internal_cost: internalCost, retail_price: retailPrice }),
      });
      setPriceEdits({});
      await mutate();
    } finally { setSavingPrice(false); }
  };

  const priceDirty = priceEdits.internal_cost !== undefined || priceEdits.retail_price !== undefined;

  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('DRAIS Control Center SMS test');
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);
  const sendTest = async () => {
    if (!window.confirm('Send one controlled SMS test now? This uses the configured provider and may consume one SMS credit.')) return;
    setTesting(true); setTestResult(null);
    try { const r = await fetch('/api/control-center/sms-test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: testPhone, message: testMessage }) }); setTestResult(await r.json()); } finally { setTesting(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-slate-400">SMS economics — central provider wallet, per-school allocation & usage, and internal cost vs retail price profit.</p>
        <Link href="/control/sms/providers" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"><Settings2 className="w-4 h-4" /> Manage providers <ArrowRight className="w-3.5 h-3.5" /></Link>
      </div>

      <section className="bg-slate-900 border border-indigo-700/40 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div><div className="text-[11px] uppercase tracking-wide text-slate-500">Active platform provider</div><div className="text-lg font-semibold text-slate-100 mt-1">{provider?.provider || (isLoading ? 'Loading…' : 'No active provider')}</div><div className="text-xs text-slate-400 mt-1">All new SMS from every school use this provider. School provider settings do not override it.</div></div>
        <Link href="/control/sms/providers" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"><Settings2 className="w-4 h-4" /> Switch provider</Link>
      </section>

      <section className="bg-slate-900 border border-amber-800/60 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-100"><Send className="w-4 h-4 text-amber-300" /> SMS Test / Send Test Message</div>
        <p className="text-xs text-slate-400">Infrastructure troubleshooting only. One recipient, one short message, and one test per administrator every 10 minutes. This does not change school balances or pricing.</p>
        <div className="grid grid-cols-1 md:grid-cols-[14rem_1fr_auto] gap-2 items-end">
          <label className="text-xs text-slate-400">Phone number<input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="0741341483" className="mt-1 w-full px-2 py-2 rounded bg-slate-800 border border-slate-700 text-slate-100" /></label>
          <label className="text-xs text-slate-400">Short test message<input value={testMessage} maxLength={160} onChange={(e) => setTestMessage(e.target.value)} className="mt-1 w-full px-2 py-2 rounded bg-slate-800 border border-slate-700 text-slate-100" /></label>
          <button onClick={sendTest} disabled={testing || !testPhone || !testMessage.trim()} className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs disabled:opacity-40">{testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send test</button>
        </div>
        {testResult && <div className={`text-xs rounded-lg p-3 ${testResult.accepted_by_provider ? 'bg-emerald-950/50 text-emerald-200' : 'bg-rose-950/50 text-rose-200'}`}><div className="flex items-center gap-2 font-semibold">{testResult.accepted_by_provider ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}{testResult.accepted_by_provider ? 'Provider accepted the request' : 'Provider rejected the request'}</div><div className="mt-1">Internal message ID: {testResult.internal_message_id || 'none'} · Delivery status: {testResult.delivery_status || 'not available'}</div>{testResult.error && <div className="mt-1">Failure reason: {testResult.error}</div>}</div>}
      </section>

      {/* Provider overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-1"><span className="text-xs text-slate-400">Wallet balance</span><Wallet className="w-4 h-4 text-emerald-400" /></div>
          <div className="text-2xl font-bold text-slate-100 tabular-nums">
            {provider?.ok ? `${provider.currency} ${nf(provider.amount)}` : (isLoading ? '…' : '—')}
          </div>
          <div className="text-[11px] text-slate-500">
            {provider?.provider || 'No active central provider'}{provider?.source === 'school' ? ` · legacy via school #${provider.source_school_id} credentials` : provider?.source === 'central' ? ' · centralized platform account' : ' · legacy environment fallback'}
          </div>
          {provider && !provider.ok && <div className="text-[11px] text-amber-300 mt-1">Balance unavailable: {provider.error}</div>}
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 mb-1">Estimated capacity</div>
          <div className="text-2xl font-bold text-sky-300 tabular-nums">{provider?.estimated_sms != null ? nf(provider.estimated_sms) : '—'}</div>
          <div className="text-[11px] text-slate-500">SMS @ UGX {provider?.unit_cost ?? '—'}/unit (internal cost)</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 mb-1">Allocated</div>
          <div className="text-2xl font-bold text-indigo-300 tabular-nums">{nf(totals?.allocated)}</div>
          <div className="text-[11px] text-slate-500">across {totals?.schools ?? 0} schools</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 mb-1">Used (segments)</div>
          <div className="text-2xl font-bold text-amber-300 tabular-nums">{nf(totals?.used)}</div>
          <div className="text-[11px] text-slate-500">from SMS_SENT audit</div>
        </div>
      </div>

      {/* Pricing & profit */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200"><TrendingUp className="w-4 h-4 text-emerald-400" /> Pricing & profit per SMS</div>
          <button onClick={savePricing} disabled={!priceDirty || savingPrice}
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs disabled:opacity-40">
            {savingPrice ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save pricing
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-[11px] text-slate-500 block mb-1">Internal cost (UGX/SMS) — what Africa&apos;s Talking charges us</label>
            <input type="number" min="0" step="0.01"
              value={priceEdits.internal_cost ?? (pricing?.internal_cost ?? '')}
              onChange={(e) => setPriceEdits((p) => ({ ...p, internal_cost: e.target.value }))}
              className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-100 text-sm tabular-nums" />
          </div>
          <div>
            <label className="text-[11px] text-slate-500 block mb-1">Retail price (UGX/SMS) — what schools are charged</label>
            <input type="number" min="0" step="0.01"
              value={priceEdits.retail_price ?? (pricing?.retail_price ?? '')}
              onChange={(e) => setPriceEdits((p) => ({ ...p, retail_price: e.target.value }))}
              className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-100 text-sm tabular-nums" />
          </div>
          <div>
            <div className="text-[11px] text-slate-500 mb-1">Profit / SMS</div>
            <div className="text-lg font-bold text-emerald-300 tabular-nums">UGX {money(pricing?.profit_per_sms)}</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500 mb-1">Margin</div>
            <div className="text-lg font-bold text-emerald-300 tabular-nums">{money(pricing?.margin_pct)}%</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-slate-800">
          <div><div className="text-[11px] text-slate-500">Total revenue</div><div className="text-sm font-semibold text-slate-200 tabular-nums">UGX {money(totals?.revenue)}</div></div>
          <div><div className="text-[11px] text-slate-500">Total cost</div><div className="text-sm font-semibold text-slate-200 tabular-nums">UGX {money(totals?.cost)}</div></div>
          <div><div className="text-[11px] text-slate-500">Total profit</div><div className="text-sm font-semibold text-emerald-300 tabular-nums">UGX {money(totals?.profit)}</div></div>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">Africa&apos;s Talking&apos;s actual per-SMS charge varies by network/sender-ID/volume — verify against the live rate on the AT account and correct it here rather than guessing.</p>
      </div>

      {/* Per-school allocation */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-500 border-b border-slate-800 text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">School</th>
              <th className="px-3 py-2 text-right">Allocated</th>
              <th className="px-3 py-2 text-right">Used</th>
              <th className="px-3 py-2 text-right">Remaining</th>
              <th className="px-3 py-2 text-right">Revenue</th>
              <th className="px-3 py-2 text-right">Cost</th>
              <th className="px-3 py-2 text-right">Profit</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {isLoading && <tr><td colSpan={8} className="px-3 py-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-indigo-400 inline" /></td></tr>}
            {!isLoading && rows.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500">No schools.</td></tr>}
            {rows.map((r: any) => {
              const editing = edits[r.school_id] ?? (r.quota ?? '');
              const dirty = edits[r.school_id] !== undefined && Number(edits[r.school_id]) !== (r.quota ?? 0);
              const over = r.quota != null && r.used > r.quota;
              return (
                <tr key={r.school_id}>
                  <td className="px-3 py-2 text-slate-200">{r.name}</td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" min="0" value={editing}
                      onChange={(e) => setEdits((prev) => ({ ...prev, [r.school_id]: e.target.value }))}
                      placeholder="unlimited"
                      className="w-24 px-2 py-1 text-right rounded bg-slate-800 border border-slate-700 text-slate-100 text-xs tabular-nums" />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-amber-300">{nf(r.used)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${over ? 'text-rose-400 font-semibold' : 'text-emerald-300'}`}>
                    {r.remaining == null ? '∞' : nf(r.remaining)}{over ? ' (over)' : ''}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-300">{money(r.revenue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-300">{money(r.cost)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-300 font-medium">{money(r.profit)}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => save(r.school_id)} disabled={!dirty || saving === r.school_id}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs disabled:opacity-40">
                      {saving === r.school_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">Allocation caps how many SMS segments a school may consume; usage is counted from audited SMS_SENT events. Leave blank for unlimited. Enforcement blocks a send once a school exceeds its allocation. Revenue/cost/profit are computed from used segments × retail price / internal cost.</p>
    </div>
  );
}
