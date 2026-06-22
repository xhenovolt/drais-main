'use client';

/**
 * Finance Settings — currency configuration (Phase 1).
 * Default UGX; schools can switch their display currency. Display-only: existing
 * amounts are never converted. (Receipt branding settings land in a later phase.)
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Coins, Check, Loader } from 'lucide-react';
import { formatCurrency, SUPPORTED_CURRENCIES } from '@/lib/currency';

const j = (u: string, opts?: RequestInit) => fetch(u, opts).then(r => r.json());

export default function FinanceSettingsPage() {
  const [current, setCurrent] = useState<string>('UGX');
  const [selected, setSelected] = useState<string>('UGX');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    j('/api/finance/currency').then(d => {
      if (d?.currency) { setCurrent(d.currency); setSelected(d.currency); }
    }).finally(() => setLoading(false));
  }, []);

  async function save() {
    setBusy(true); setMsg('');
    const r = await j('/api/finance/currency', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ currency: selected }) }).catch(() => null);
    if (r?.success) { setCurrent(r.currency); setMsg(`Currency set to ${r.currency}. Reload finance pages to see it everywhere.`); }
    else setMsg(r?.error || 'Failed to update currency');
    setBusy(false);
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Link href="/finance" className="p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><ArrowLeft className="w-5 h-5" /></Link>
        <h1 className="text-xl font-bold text-slate-800 dark:text-white">Finance Settings</h1>
      </div>
      <p className="text-xs text-slate-400 mb-5 ml-8">Default is UGX. Changing the currency affects display only — amounts are not converted.</p>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        <div className="flex items-center gap-2 mb-3"><Coins className="w-4 h-4 text-indigo-600" /><h2 className="font-semibold text-slate-800 dark:text-white">Currency</h2>
          <span className="ml-auto text-xs text-slate-400">current: <b className="text-slate-600 dark:text-slate-300">{current}</b></span>
        </div>

        {loading ? <div className="py-8 text-center text-slate-400"><Loader className="w-5 h-5 animate-spin inline" /></div> : (
          <>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">School currency</span>
              <select value={selected} onChange={e => setSelected(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-800 dark:text-white">
                {SUPPORTED_CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} — {c.symbol} ({c.decimals} dp)</option>)}
              </select>
            </label>

            <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-4">
              <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Preview</p>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-700 dark:text-slate-200">
                <span>{formatCurrency(1500000, selected)}</span>
                <span>{formatCurrency(250000, selected)}</span>
                <span>{formatCurrency(12500.5, selected)}</span>
              </div>
            </div>

            {msg && <div className="mt-3 text-sm rounded-lg bg-indigo-50 dark:bg-indigo-950/40 px-3 py-2 text-indigo-800 dark:text-indigo-200">{msg}</div>}

            <button onClick={save} disabled={busy || selected === current}
              className="mt-4 flex items-center gap-2 rounded-lg bg-indigo-600 text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50">
              {busy ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save currency
            </button>
          </>
        )}
      </div>
    </div>
  );
}
