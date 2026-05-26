'use client';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import useSWR from 'swr';
import {
  BookOpenCheck, Plus, Loader2, Printer, RefreshCcw, AlertCircle,
  TrendingUp, TrendingDown, Wallet as WalletIcon,
} from 'lucide-react';
import { apiFetch } from '@/lib/apiClient';

const API = '/api/finance/ledger';
const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: 'same-origin' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error || `HTTP ${res.status}`);
    (err as any).status = res.status;
    throw err;
  }
  return body;
};

interface Entry {
  id:             number;
  wallet_id:      number;
  wallet_name:    string | null;
  category_id:    number;
  category_name:  string | null;
  tx_type:        'credit' | 'debit';
  amount:         number | string;
  reference:      string | null;
  description:    string | null;
  student_id:     number | null;
  student_name:   string | null;
  staff_id:       number | null;
  staff_name:     string | null;
  created_at:     string;
}
interface Wallet   { id: number; name: string; }
interface Category { id: number; name: string; type?: string; }

export default function LedgerPage() {
  const [page,    setPage]    = useState(1);
  const perPage = 25;

  const [filters, setFilters] = useState({
    wallet_id: '', tx_type: '', category_id: '', date_from: '', date_to: '',
  });
  const [form, setForm] = useState({
    wallet_id: '', category_id: '', tx_type: 'credit' as 'credit'|'debit',
    amount: '', reference: '', description: '',
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState<string | null>(null);

  const queryString = useMemo(() => {
    const sp = new URLSearchParams({ page: String(page), per_page: String(perPage) });
    if (filters.wallet_id)   sp.set('wallet_id',   filters.wallet_id);
    if (filters.tx_type)     sp.set('tx_type',     filters.tx_type);
    if (filters.category_id) sp.set('category_id', filters.category_id);
    if (filters.date_from)   sp.set('date_from',   filters.date_from);
    if (filters.date_to)     sp.set('date_to',     filters.date_to);
    return sp.toString();
  }, [page, filters]);

  const { data, error, isLoading, mutate } = useSWR<{
    data: Entry[]; total: number; totals: { credit: number; debit: number; balance: number };
  }>(`${API}?${queryString}`, fetcher);

  const { data: walletsRes }  = useSWR<{ data: Wallet[] }>(`/api/finance/wallets`,    fetcher);
  const { data: catsRes }     = useSWR<{ data: Category[] }>(`/api/finance/categories`, fetcher);
  const wallets    = walletsRes?.data ?? [];
  const categories = catsRes?.data    ?? [];

  const entries = data?.data ?? [];
  const total   = data?.total ?? 0;
  const totals  = data?.totals ?? { credit: 0, debit: 0, balance: 0 };

  const printRef = useRef<HTMLDivElement>(null);

  async function submit() {
    setErr(null);
    if (!form.wallet_id || !form.category_id || !form.amount) {
      setErr('Wallet, category, and amount are required'); return;
    }
    setSaving(true);
    try {
      await apiFetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }),
        successMessage: 'Entry added',
      });
      setForm({ wallet_id: '', category_id: '', tx_type: 'credit', amount: '', reference: '', description: '' });
      mutate();
    } catch (e: any) {
      setErr(e?.message || 'Failed to add entry');
    } finally {
      setSaving(false);
    }
  }

  function doPrint() {
    if (!printRef.current) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(
      '<html><head><title>Ledger Print</title><style>' +
      'body{font-family:system-ui,sans-serif;padding:20px} ' +
      'h1{font-size:16px;margin:0 0 8px} ' +
      '.totals{display:flex;gap:24px;font-size:12px;margin:12px 0;color:#444} ' +
      'table{width:100%;border-collapse:collapse;font-size:11px;margin-top:8px} ' +
      'th,td{border:1px solid #ccc;padding:5px;text-align:left} ' +
      'th{background:#f3f3f3}' +
      '</style></head><body>' +
      `<h1>General Ledger</h1>` +
      `<div class="totals">` +
        `<span><b>Credits:</b> ${fmt(totals.credit)}</span>` +
        `<span><b>Debits:</b> ${fmt(totals.debit)}</span>` +
        `<span><b>Net:</b> ${fmt(totals.balance)}</span>` +
      `</div>` +
      printRef.current.innerHTML +
      '</body></html>'
    );
    w.document.close();
    w.print();
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpenCheck className="w-6 h-6 text-indigo-500" />
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">General Ledger</h1>
            <p className="text-xs text-slate-400">All recorded credits and debits across wallets.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => mutate()}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">
            <RefreshCcw className="w-3 h-3" /> Refresh
          </button>
          <button onClick={doPrint}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">
            <Printer className="w-3 h-3" /> Print
          </button>
        </div>
      </div>

      {/* Totals */}
      <div className="grid sm:grid-cols-3 gap-3">
        <Stat icon={TrendingUp}   label="Total Credits" value={fmt(totals.credit)}  tone="emerald" />
        <Stat icon={TrendingDown} label="Total Debits"  value={fmt(totals.debit)}   tone="rose"    />
        <Stat icon={WalletIcon}   label="Net Balance"   value={fmt(totals.balance)} tone={totals.balance >= 0 ? 'emerald' : 'rose'} />
      </div>

      {/* Filters */}
      <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 grid sm:grid-cols-5 gap-3">
        <Picker label="Wallet" value={filters.wallet_id} onChange={v => { setPage(1); setFilters(f => ({ ...f, wallet_id: v })); }}
          options={wallets} placeholder="All wallets" />
        <Picker label="Category" value={filters.category_id} onChange={v => { setPage(1); setFilters(f => ({ ...f, category_id: v })); }}
          options={categories} placeholder="All categories" />
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Type</span>
          <select value={filters.tx_type} onChange={e => { setPage(1); setFilters(f => ({ ...f, tx_type: e.target.value })); }}
            className={inputCls}>
            <option value="">Both</option>
            <option value="credit">Credit</option>
            <option value="debit">Debit</option>
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">From</span>
          <input type="date" value={filters.date_from}
            onChange={e => { setPage(1); setFilters(f => ({ ...f, date_from: e.target.value })); }}
            className={inputCls} />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">To</span>
          <input type="date" value={filters.date_to}
            onChange={e => { setPage(1); setFilters(f => ({ ...f, date_to: e.target.value })); }}
            className={inputCls} />
        </label>
      </div>

      {/* New entry */}
      <div className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/30 dark:bg-indigo-900/10">
        <p className="text-xs font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300 mb-3">New Entry</p>
        <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Picker label="Wallet *" value={form.wallet_id} onChange={v => setForm(f => ({ ...f, wallet_id: v }))}
            options={wallets} placeholder="—" />
          <Picker label="Category *" value={form.category_id} onChange={v => setForm(f => ({ ...f, category_id: v }))}
            options={categories} placeholder="—" />
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Type *</span>
            <select value={form.tx_type} onChange={e => setForm(f => ({ ...f, tx_type: e.target.value as any }))}
              className={inputCls}>
              <option value="credit">Credit</option>
              <option value="debit">Debit</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Amount *</span>
            <input type="number" step="0.01" value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className={inputCls} />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Reference</span>
            <input value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
              placeholder="Receipt/Invoice/etc." className={inputCls} />
          </label>
          <label className="block sm:col-span-3 lg:col-span-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Description</span>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className={inputCls} />
          </label>
        </div>
        <div className="flex items-center justify-between mt-3">
          {err && <p className="text-xs text-rose-500">{err}</p>}
          <button onClick={submit} disabled={saving}
            className="ml-auto inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add Entry
          </button>
        </div>
      </div>

      {/* Error from list */}
      {error && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-950/30 p-3 text-sm text-rose-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Failed to load ledger</p>
            <p className="text-xs opacity-90">{error.message}</p>
          </div>
        </div>
      )}

      {/* Table */}
      <div ref={printRef} className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2.5">Date</th>
              <th className="px-3 py-2.5">Wallet</th>
              <th className="px-3 py-2.5">Category</th>
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5 text-right">Amount</th>
              <th className="px-3 py-2.5">Reference</th>
              <th className="px-3 py-2.5">Linked To</th>
              <th className="px-3 py-2.5">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {isLoading ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin inline" />
              </td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400 text-sm">
                No ledger entries match the current filters.
              </td></tr>
            ) : entries.map(e => (
              <tr key={e.id} className="bg-white dark:bg-slate-900">
                <td className="px-3 py-2 font-mono text-xs text-slate-500 whitespace-nowrap">
                  {new Date(e.created_at).toLocaleDateString()}
                </td>
                <td className="px-3 py-2 font-medium">{e.wallet_name ?? `Wallet #${e.wallet_id}`}</td>
                <td className="px-3 py-2 text-slate-500">{e.category_name ?? '—'}</td>
                <td className="px-3 py-2">
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                    e.tx_type === 'credit'
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                      : 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'
                  }`}>{e.tx_type}</span>
                </td>
                <td className={`px-3 py-2 text-right font-mono ${
                  e.tx_type === 'credit' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                }`}>
                  {e.tx_type === 'credit' ? '+' : '−'}{fmt(e.amount)}
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">{e.reference ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-slate-500">
                  {e.student_name ?? e.staff_name ?? '—'}
                </td>
                <td className="px-3 py-2 text-xs text-slate-500 max-w-[240px] truncate" title={e.description ?? ''}>
                  {e.description ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > perPage && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of {total}</span>
          <div className="flex items-center gap-2">
            <button disabled={page === 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-600 disabled:opacity-30">
              Prev
            </button>
            <span>Page {page} of {Math.ceil(total / perPage)}</span>
            <button disabled={page >= Math.ceil(total / perPage)}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-600 disabled:opacity-30">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function fmt(v: number | string): string {
  const n = Number(v) || 0;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const inputCls = "mt-1 w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800";

function Picker({
  label, value, onChange, options, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { id: number; name: string }[]; placeholder: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className={inputCls}>
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}

function Stat({
  icon: Icon, label, value, tone,
}: {
  icon: React.ElementType; label: string; value: string;
  tone: 'emerald' | 'rose' | 'indigo';
}) {
  const colors = {
    emerald: 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300',
    rose:    'border-rose-200    dark:border-rose-800    bg-rose-50    dark:bg-rose-900/20    text-rose-700    dark:text-rose-300',
    indigo:  'border-indigo-200  dark:border-indigo-800  bg-indigo-50  dark:bg-indigo-900/20  text-indigo-700  dark:text-indigo-300',
  }[tone];
  return (
    <div className={`p-4 rounded-2xl border ${colors}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wide font-semibold opacity-80">{label}</p>
          <p className="text-2xl font-bold mt-1 font-mono">{value}</p>
        </div>
        <Icon className="w-5 h-5 opacity-60" />
      </div>
    </div>
  );
}
