'use client';

/**
 * Control Center → SMS → Pricing & top-ups.
 * Set what each SMS costs (default, or per school — one, several or all), switch online buying on/off per school,
 * check the MarzPay connection, and follow every purchase. Schools buy their own SMS by mobile money on /admin/sms/buy.
 */
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { CheckCircle2, CircleAlert, Loader2, RefreshCw, Search, Wallet } from 'lucide-react';

const fetcher = async (url: string) => {
  const r = await fetch(url, { cache: 'no-store' });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b.error || `HTTP ${r.status}`);
  return b;
};
const input = 'px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm';
const fmt = (n: number) => n.toLocaleString('en-US');

interface SchoolRow { id: number; name: string; overrideUgx: number | null; priceUgx: number; topupEnabled: boolean; purchases: number; paidUgx: number; sms: number }
interface Recent { id: number; schoolId: number; school: string; amountUgx: number; sms: number; status: string; reason: string | null; phone: string | null; createdAt: string; creditedAt: string | null }
interface Data { canManage: boolean; marzConfigured: boolean; defaultPriceUgx: number; internalCostUgx: number; schools: SchoolRow[]; totals: { paidUgx: number; sms: number; needsReview: number }; recent: Recent[] }

const TONE: Record<string, string> = { credited: 'text-emerald-400', processing: 'text-amber-300', initiated: 'text-amber-300', paid: 'text-amber-300', review: 'text-red-300', failed: 'text-slate-400', expired: 'text-slate-400' };

export default function SmsPricingPage() {
  const { data, error, isLoading, mutate } = useSWR<Data>('/api/control-center/sms/pricing', fetcher, { refreshInterval: 30_000, shouldRetryOnError: false });
  const [defaultPrice, setDefaultPrice] = useState('');
  const [schoolPrice, setSchoolPrice] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const schools = data?.schools ?? [];
  const shown = useMemo(() => schools.filter((s) => !search.trim() || s.name.toLowerCase().includes(search.toLowerCase())), [schools, search]);
  const can = !!data?.canManage;

  const send = async (key: string, method: 'PUT' | 'POST', body: unknown) => {
    setBusy(key); setMsg(null);
    try {
      const r = await fetch('/api/control-center/sms/pricing', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || 'Failed');
      await mutate();
      return b;
    } catch (e: any) { setMsg({ ok: false, text: e.message || 'Failed' }); return null; }
    finally { setBusy(null); }
  };

  const applyPrice = async (ids: number[] | 'all', price: number | null) => {
    const n = ids === 'all' ? schools.length : ids.length;
    const what = price === null ? 'go back to the default price' : `be charged UGX ${fmt(price)} per SMS`;
    if (!confirm(`Make ${ids === 'all' ? 'ALL ' + n : n} school${n === 1 ? '' : 's'} ${what}?\n\nThis applies to their next purchase. Purchases already made are not changed.`)) return;
    const b = await send('price', 'PUT', { schoolIds: ids, priceUgx: price });
    if (b) { setMsg({ ok: true, text: `Saved for ${b.updated} school${b.updated === 1 ? '' : 's'}.` }); setSelected(new Set()); }
  };

  const toggleBuying = async (ids: number[], enabled: boolean) => {
    const b = await send('toggle', 'PUT', { schoolIds: ids, topupEnabled: enabled });
    if (b) setMsg({ ok: true, text: `Online buying ${enabled ? 'switched on' : 'switched off'} for ${b.updated} school${b.updated === 1 ? '' : 's'}.` });
  };

  return (
    <div className="space-y-5 max-w-6xl">
      <div>
        <Link href="/control/sms" className="text-xs text-slate-400 hover:text-slate-200">← SMS</Link>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2 mt-1"><Wallet className="w-6 h-6 text-indigo-400" /> SMS pricing &amp; top-ups</h1>
        <p className="text-sm text-slate-400 mt-1 max-w-3xl">
          Set what each SMS costs. A school that pays UGX 300,000 at UGX 30 per SMS receives 10,000 SMS, automatically, as soon as MarzPay confirms the payment.
          Schools buy on their own <b>Buy SMS</b> page — no need to contact you first.
        </p>
      </div>

      {isLoading && <div className="text-slate-400 text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>}
      {error && <div className="text-red-300 text-sm bg-red-900/20 rounded-lg p-3">{(error as Error).message}</div>}
      {msg && <p className={`text-sm ${msg.ok ? 'text-emerald-400' : 'text-red-300'}`}>{msg.text}</p>}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <section className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-2">
              <h2 className="text-sm font-semibold text-white">Default price per SMS</h2>
              <div className="text-2xl font-bold text-white">UGX {fmt(data.defaultPriceUgx)}</div>
              <div className="text-xs text-slate-400">Costs us about UGX {fmt(data.internalCostUgx)}. Used by every school without its own price.</div>
              <div className="flex gap-2">
                <input className={`${input} w-28`} inputMode="numeric" placeholder="30" value={defaultPrice} onChange={(e) => setDefaultPrice(e.target.value)} disabled={!can} />
                <button disabled={!can || !defaultPrice || busy === 'default'} onClick={async () => { const b = await send('default', 'PUT', { defaultPriceUgx: Number(defaultPrice) }); if (b) { setDefaultPrice(''); setMsg({ ok: true, text: `Default price is now UGX ${fmt(b.defaultPriceUgx)}.` }); } }}
                  className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm disabled:opacity-40">Change</button>
              </div>
            </section>
            <section className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-2">
              <h2 className="text-sm font-semibold text-white">MarzPay connection</h2>
              <div className={`text-sm flex items-center gap-1 ${data.marzConfigured ? 'text-emerald-400' : 'text-red-300'}`}>
                {data.marzConfigured ? <CheckCircle2 className="w-4 h-4" /> : <CircleAlert className="w-4 h-4" />}
                {data.marzConfigured ? 'Credentials are set on the server' : 'Credentials are not set (MARZPAY_API_KEY / MARZPAY_API_SECRET)'}
              </div>
              <button disabled={!can || busy === 'verify'} onClick={async () => { const b = await send('verify', 'POST', { action: 'verify' }); if (b) setMsg({ ok: b.ok, text: b.message }); }}
                className="px-3 py-2 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800 text-sm disabled:opacity-40">{busy === 'verify' ? 'Checking…' : 'Check connection'}</button>
              <div className="text-xs text-slate-500">Checking never moves money.</div>
            </section>
            <section className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-1">
              <h2 className="text-sm font-semibold text-white">Received through the app</h2>
              <div className="text-2xl font-bold text-white">UGX {fmt(data.totals.paidUgx)}</div>
              <div className="text-xs text-slate-400">{fmt(data.totals.sms)} SMS sold{data.totals.needsReview > 0 ? ` · ${data.totals.needsReview} payment(s) need your review` : ''}</div>
            </section>
          </div>

          <section className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-white">Price per school {can ? '' : '(view only)'}</h2>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-slate-400">Price per SMS (UGX)
                <input className={`${input} block mt-1 w-32`} inputMode="numeric" placeholder="e.g. 25" value={schoolPrice} onChange={(e) => setSchoolPrice(e.target.value)} disabled={!can} />
              </label>
              <button disabled={!can || !schoolPrice || selected.size === 0 || busy === 'price'} onClick={() => applyPrice([...selected], Number(schoolPrice))} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm disabled:opacity-40">Set for {selected.size} selected</button>
              <button disabled={!can || !schoolPrice || busy === 'price'} onClick={() => applyPrice('all', Number(schoolPrice))} className="px-4 py-2 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800 text-sm disabled:opacity-40">Set for ALL schools</button>
              <button disabled={!can || selected.size === 0 || busy === 'price'} onClick={() => applyPrice([...selected], null)} className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 text-sm disabled:opacity-40">Use default for selected</button>
              <button disabled={!can || selected.size === 0 || busy === 'toggle'} onClick={() => toggleBuying([...selected], false)} className="px-3 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 text-sm disabled:opacity-40">Switch buying off</button>
              <button disabled={!can || selected.size === 0 || busy === 'toggle'} onClick={() => toggleBuying([...selected], true)} className="px-3 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 text-sm disabled:opacity-40">Switch buying on</button>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative"><Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" /><input className={`${input} pl-9 w-64`} placeholder="Find a school…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              <button onClick={() => setSelected(new Set(shown.map((s) => s.id)))} className="text-xs text-slate-300 underline">Select all shown</button>
              <button onClick={() => setSelected(new Set())} className="text-xs text-slate-400 underline">Clear</button>
            </div>
            <div className="rounded-lg border border-slate-700 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-[11px] uppercase tracking-wider text-slate-400"><tr><th className="w-8 px-3 py-2" /><th className="px-3 py-2 text-left">School</th><th className="px-3 py-2 text-right">Price / SMS</th><th className="px-3 py-2 text-left">Buying online</th><th className="px-3 py-2 text-right">Bought</th></tr></thead>
                <tbody className="divide-y divide-slate-800">
                  {shown.map((s) => (
                    <tr key={s.id} className="bg-slate-900">
                      <td className="px-3 py-2"><input type="checkbox" checked={selected.has(s.id)} disabled={!can} aria-label={`Select ${s.name}`} onChange={() => setSelected((p) => { const n = new Set(p); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })} /></td>
                      <td className="px-3 py-2 text-slate-100">{s.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-100">UGX {fmt(s.priceUgx)}{s.overrideUgx == null && <span className="text-xs text-slate-500"> (default)</span>}</td>
                      <td className="px-3 py-2 text-xs">{s.topupEnabled ? <span className="text-emerald-400">On</span> : <span className="text-amber-300">Off</span>}</td>
                      <td className="px-3 py-2 text-right text-xs text-slate-400">{s.purchases > 0 ? `${fmt(s.sms)} SMS · UGX ${fmt(s.paidUgx)}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-2">
            <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-white">Recent purchases</h2><button onClick={() => mutate()} className="text-xs text-slate-300 inline-flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-slate-400"><tr><th className="px-3 py-2 text-left">When</th><th className="px-3 py-2 text-left">School</th><th className="px-3 py-2 text-right">UGX</th><th className="px-3 py-2 text-right">SMS</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2" /></tr></thead>
                <tbody className="divide-y divide-slate-800">
                  {data.recent.map((t) => (
                    <tr key={t.id}>
                      <td className="px-3 py-2 text-xs text-slate-400 whitespace-nowrap">{new Date(t.createdAt).toLocaleString()}</td>
                      <td className="px-3 py-2 text-slate-100">{t.school ?? `School ${t.schoolId}`}<div className="text-[11px] text-slate-500">{t.phone}</div></td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-100">{fmt(t.amountUgx)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-100">{fmt(t.sms)}</td>
                      <td className={`px-3 py-2 text-xs ${TONE[t.status] ?? 'text-slate-300'}`}>{t.status}{t.reason && <div className="text-slate-500 max-w-xs">{t.reason}</div>}</td>
                      <td className="px-3 py-2 text-xs">
                        {can && t.status !== 'credited' && (
                          <button disabled={busy === `re${t.id}`} onClick={async () => { const b = await send(`re${t.id}`, 'POST', { action: 'recheck', topupId: t.id }); if (b) setMsg({ ok: b.credited || b.status === 'processing', text: b.credited ? 'Confirmed with MarzPay — SMS added.' : `MarzPay says: ${b.status}${b.reason ? ' — ' + b.reason : ''}` }); }}
                            className="text-indigo-300 underline disabled:opacity-40">{busy === `re${t.id}` ? 'Checking…' : 'Recheck'}</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {data.recent.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">No purchases yet.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500">“Recheck” asks MarzPay for the real status and adds the SMS only if the payment truly completed for the exact amount. Sandbox payments never add SMS.</p>
          </section>
        </>
      )}
    </div>
  );
}
