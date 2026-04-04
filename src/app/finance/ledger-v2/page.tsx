'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  DollarSign, Users, TrendingUp, TrendingDown, AlertCircle,
  Upload, Plus, RefreshCw, CheckCircle2, Loader, Trash2,
  BarChart3, FileText, Wallet, ChevronRight,
} from 'lucide-react';
import { apiFetch } from '@/lib/apiClient';
import { showToast } from '@/lib/toast';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Summary {
  total_charged: number;
  total_paid: number;
  total_outstanding: number;
  students_with_entries: number;
}

interface Debtor {
  student_id: number;
  student_name: string;
  admission_no: string;
  class_name: string;
  total_charged: number;
  total_paid: number;
  balance: number;
}

interface FeeItem {
  id: number;
  name: string;
  amount: number;
  class_name: string | null;
  program_name: string | null;
  account_name: string | null;
  is_active: boolean;
}

interface Account {
  id: number;
  name: string;
  type: string;
}

function fmt(n: number) {
  return Number(n || 0).toLocaleString('en-TZ', { minimumFractionDigits: 0 });
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string; icon: React.ElementType; color: string;
}) {
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-3 ${color}`}>
      <div className="p-2 rounded-lg bg-white/30 dark:bg-black/20"><Icon className="w-5 h-5" /></div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
        <p className="text-lg font-bold mt-0.5">{value}</p>
      </div>
    </div>
  );
}

export default function FinanceLedgerPage() {
  const [tab, setTab] = useState<'overview' | 'fee-items' | 'accounts' | 'bulk-import'>('overview');
  const [summary, setSummary]   = useState<Summary | null>(null);
  const [debtors, setDebtors]   = useState<Debtor[]>([]);
  const [feeItems, setFeeItems] = useState<FeeItem[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [classes, setClasses]   = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading]   = useState(true);

  // Fee item form
  const [showFeeForm,    setShowFeeForm]   = useState(false);
  const [feeName,        setFeeName]       = useState('');
  const [feeAmount,      setFeeAmount]     = useState('');
  const [feeClass,       setFeeClass]      = useState('');
  const [feeAccount,     setFeeAccount]    = useState('');
  const [feeSubmitting,  setFeeSubmitting] = useState(false);

  // Account form
  const [showAccForm,   setShowAccForm]   = useState(false);
  const [accName,       setAccName]       = useState('');
  const [accType,       setAccType]       = useState('income');
  const [accSubmitting, setAccSubmitting] = useState(false);

  // Bulk import
  const [bulkCsv,    setBulkCsv]    = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult,  setBulkResult]  = useState<any>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, debtRes, feeRes, accRes, clsRes] = await Promise.all([
        apiFetch('/api/finance/ledger-reports?type=summary'),
        apiFetch('/api/finance/ledger-reports?type=debtors&limit=20'),
        apiFetch('/api/finance/fee-items'),
        apiFetch('/api/finance/accounts'),
        apiFetch('/api/classes'),
      ]);
      setSummary(sumRes);
      setDebtors(debtRes.rows ?? []);
      setFeeItems(Array.isArray(feeRes) ? feeRes : []);
      setAccounts(Array.isArray(accRes) ? accRes : []);
      setClasses(Array.isArray(clsRes) ? clsRes : (clsRes?.classes ?? []));
    } catch { showToast('error', 'Failed to load data'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const createFeeItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feeName.trim() || !feeAmount) { showToast('error', 'Name and amount required'); return; }
    setFeeSubmitting(true);
    try {
      const res = await apiFetch('/api/finance/fee-items', {
        method: 'POST',
        body: JSON.stringify({ name: feeName.trim(), amount: +feeAmount, class_id: feeClass || undefined, account_id: feeAccount || undefined }),
      });
      if (res.id) { showToast('success', 'Fee item created'); setFeeName(''); setFeeAmount(''); setShowFeeForm(false); await loadAll(); }
      else showToast('error', res.error || 'Failed');
    } finally { setFeeSubmitting(false); }
  };

  const createAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName.trim()) { showToast('error', 'Name required'); return; }
    setAccSubmitting(true);
    try {
      const res = await apiFetch('/api/finance/accounts', { method: 'POST', body: JSON.stringify({ name: accName.trim(), type: accType }) });
      if (res.id) { showToast('success', 'Account created'); setAccName(''); setShowAccForm(false); await loadAll(); }
      else showToast('error', res.error || 'Failed');
    } finally { setAccSubmitting(false); }
  };

  const deleteFeeItem = async (id: number, name: string) => {
    if (!confirm(`Deactivate "${name}"?`)) return;
    await apiFetch(`/api/finance/fee-items?id=${id}`, { method: 'DELETE' });
    showToast('success', 'Fee item deactivated');
    setFeeItems(prev => prev.filter(fi => fi.id !== id));
  };

  const runBulkImport = async () => {
    if (!bulkCsv.trim()) { showToast('error', 'Paste CSV data first'); return; }
    setBulkLoading(true); setBulkResult(null);
    try {
      const res = await apiFetch('/api/finance/bulk-import', { method: 'POST', body: JSON.stringify({ csv: bulkCsv }) });
      setBulkResult(res);
      if (res.ok) { showToast(res.message, 'success'); await loadAll(); }
      else showToast(res.error || 'Import failed', 'error');
    } finally { setBulkLoading(false); }
  };

  const inputCls = "w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm outline-none focus:border-indigo-500";
  const tabs = [
    { id: 'overview',    label: 'Overview',    icon: BarChart3 },
    { id: 'fee-items',   label: 'Fee Items',   icon: FileText },
    { id: 'accounts',    label: 'Accounts',    icon: Wallet },
    { id: 'bulk-import', label: 'Bulk Import', icon: Upload },
  ] as const;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Finance Ledger</h1>
          <p className="text-xs text-slate-500 mt-0.5">Every shilling has a source, destination and history.</p>
        </div>
        <button onClick={loadAll} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
          <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}>
            <t.icon className="w-3.5 h-3.5" />{t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total Charged" value={`TZS ${fmt(summary.total_charged)}`} icon={TrendingUp} color="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300" />
              <StatCard label="Collected" value={`TZS ${fmt(summary.total_paid)}`} icon={CheckCircle2} color="border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300" />
              <StatCard label="Outstanding" value={`TZS ${fmt(summary.total_outstanding)}`} icon={AlertCircle} color="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300" />
              <StatCard label="Students" value={String(summary.students_with_entries)} icon={Users} color="border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300" />
            </div>
          )}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500" /> Top Debtors
              </h2>
            </div>
            {!debtors.length ? (
              <p className="p-8 text-center text-slate-400 text-sm">No outstanding balances — all clear! 🎉</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 text-left">
                    {['Student', 'Class', 'Charged', 'Paid', 'Balance', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {debtors.map(d => (
                    <tr key={d.student_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-700 dark:text-slate-200">{d.student_name}</p>
                        <p className="text-xs text-slate-400">{d.admission_no}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{d.class_name || '—'}</td>
                      <td className="px-4 py-3 font-mono text-sm">{fmt(d.total_charged)}</td>
                      <td className="px-4 py-3 font-mono text-sm text-emerald-600 dark:text-emerald-400">{fmt(d.total_paid)}</td>
                      <td className="px-4 py-3 font-mono text-sm font-bold text-red-600 dark:text-red-400">{fmt(d.balance)}</td>
                      <td className="px-4 py-3">
                        <Link href={`/students/${d.student_id}/fees`} className="flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                          View <ChevronRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── FEE ITEMS ── */}
      {tab === 'fee-items' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowFeeForm(v => !v)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg">
              <Plus className="w-4 h-4" /> New Fee Item
            </button>
          </div>
          {showFeeForm && (
            <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-5">
              <form onSubmit={createFeeItem} className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-slate-500 mb-1">Name *</label>
                  <input type="text" value={feeName} onChange={e => setFeeName(e.target.value)} placeholder="Tuition, Boarding…" className={inputCls} required /></div>
                <div><label className="block text-xs font-semibold text-slate-500 mb-1">Amount (TZS) *</label>
                  <input type="number" min="1" value={feeAmount} onChange={e => setFeeAmount(e.target.value)} placeholder="150000" className={inputCls} required /></div>
                <div><label className="block text-xs font-semibold text-slate-500 mb-1">Class (blank = all)</label>
                  <select value={feeClass} onChange={e => setFeeClass(e.target.value)} className={inputCls}>
                    <option value="">— All Classes —</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
                <div><label className="block text-xs font-semibold text-slate-500 mb-1">Account</label>
                  <select value={feeAccount} onChange={e => setFeeAccount(e.target.value)} className={inputCls}>
                    <option value="">— None —</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select></div>
                <div className="col-span-2 flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowFeeForm(false)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm">Cancel</button>
                  <button type="submit" disabled={feeSubmitting} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg disabled:opacity-60">
                    {feeSubmitting ? <Loader className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Create
                  </button>
                </div>
              </form>
            </div>
          )}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            {!feeItems.length ? <p className="p-8 text-center text-slate-400 text-sm">No fee items yet.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="bg-slate-50 dark:bg-slate-800/60 text-left">
                  {['Name', 'Amount', 'Class', 'Account', ''].map(h => <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase">{h}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {feeItems.map(fi => (
                    <tr key={fi.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{fi.name}</td>
                      <td className="px-4 py-3 font-mono text-indigo-600 dark:text-indigo-400">TZS {fmt(fi.amount)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{fi.class_name || 'All Classes'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{fi.account_name || '—'}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => deleteFeeItem(fi.id, fi.name)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-slate-300 hover:text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── ACCOUNTS ── */}
      {tab === 'accounts' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowAccForm(v => !v)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg">
              <Plus className="w-4 h-4" /> New Account
            </button>
          </div>
          {showAccForm && (
            <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-5">
              <form onSubmit={createAccount} className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-slate-500 mb-1">Name *</label>
                  <input type="text" value={accName} onChange={e => setAccName(e.target.value)} placeholder="Tuition Account" className={inputCls} required /></div>
                <div><label className="block text-xs font-semibold text-slate-500 mb-1">Type</label>
                  <select value={accType} onChange={e => setAccType(e.target.value)} className={inputCls}>
                    <option value="income">Income</option><option value="liability">Liability</option>
                    <option value="clearing">Clearing</option><option value="asset">Asset</option>
                  </select></div>
                <div className="col-span-2 flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowAccForm(false)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm">Cancel</button>
                  <button type="submit" disabled={accSubmitting} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg disabled:opacity-60">
                    {accSubmitting ? <Loader className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Create
                  </button>
                </div>
              </form>
            </div>
          )}
          <div className="grid gap-2">
            {!accounts.length && <p className="text-sm text-slate-400 text-center py-8">No accounts yet.</p>}
            {accounts.map(a => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/30"><Wallet className="w-4 h-4 text-indigo-500" /></div>
                <div><p className="font-medium text-slate-700 dark:text-slate-200 text-sm">{a.name}</p>
                  <p className="text-xs text-slate-400 capitalize">{a.type}</p></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── BULK IMPORT ── */}
      {tab === 'bulk-import' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-5">
            <h3 className="text-sm font-bold text-amber-700 dark:text-amber-300 mb-2 flex items-center gap-2">
              <Upload className="w-4 h-4" /> Bulk Opening Balance Import
            </h3>
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-4">
              Format: <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">student_id, balance, reference</code><br />
              Positive = student owes (debit). Negative = school owes student (credit). Safe to re-run.
            </p>
            <textarea value={bulkCsv} onChange={e => setBulkCsv(e.target.value)} rows={10}
              placeholder={`student_id,balance,reference\n812001,150000,Opening Balance\n812002,75000,Carried Forward\n812003,-5000,Overpayment Credit`}
              className={`${inputCls} font-mono resize-y`} />
            <div className="flex justify-end mt-3">
              <button onClick={runBulkImport} disabled={bulkLoading}
                className="flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg disabled:opacity-60">
                {bulkLoading ? <Loader className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Run Import
              </button>
            </div>
          </div>
          {bulkResult && (
            <div className={`rounded-xl border p-4 text-sm ${bulkResult.ok ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300' : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 text-red-700 dark:text-red-300'}`}>
              <p className="font-semibold">{bulkResult.ok ? '✓' : '✗'} {bulkResult.message || bulkResult.error}</p>
              {bulkResult.ok && <ul className="mt-2 text-xs space-y-0.5 opacity-80">
                <li>Rows submitted: {bulkResult.rows_submitted}</li>
                <li>Entries created: {bulkResult.success}</li>
                {bulkResult.failed > 0 && <li className="text-red-500">Failed: {bulkResult.failed}</li>}
              </ul>}
              {bulkResult.errors?.length > 0 && <pre className="mt-2 text-xs opacity-70 whitespace-pre-wrap">{bulkResult.errors.join('\n')}</pre>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
