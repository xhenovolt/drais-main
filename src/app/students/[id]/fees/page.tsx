'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, TrendingUp, TrendingDown, DollarSign, CreditCard,
  Plus, Minus, Upload, RefreshCw, AlertCircle, CheckCircle2,
  Loader, Receipt, ChevronDown, ChevronUp, Wallet,
} from 'lucide-react';
import { apiFetch } from '@/lib/apiClient';
import { showToast } from '@/lib/toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LedgerEntry {
  id: number;
  type: 'debit' | 'credit';
  amount: number;
  reference: string;
  term_name: string | null;
  notes: string | null;
  created_at: string;
}

interface Balance {
  total_charged: number;
  total_paid: number;
  balance: number;
  entry_count: number;
}

interface Account {
  id: number;
  name: string;
  type: string;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, color,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className={`rounded-xl border p-4 flex items-start gap-3 ${color}`}>
      <div className="p-2 rounded-lg bg-white/40 dark:bg-black/20">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
        <p className="text-xl font-bold mt-0.5">{value}</p>
        {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function fmt(n: number) {
  return Number(n).toLocaleString('en-TZ', { minimumFractionDigits: 0 });
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StudentFeesPage() {
  const { id } = useParams<{ id: string }>();
  const studentId = parseInt(id);

  const [balance, setBalance]   = useState<Balance | null>(null);
  const [ledger, setLedger]     = useState<LedgerEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading]   = useState(true);
  const [student, setStudent]   = useState<{ first_name: string; last_name: string; admission_no: string } | null>(null);

  // Panel state
  const [showPayment,  setShowPayment]  = useState(false);
  const [showAdjust,   setShowAdjust]   = useState(false);

  // Form state — payment
  const [payAmount,    setPayAmount]    = useState('');
  const [payMethod,    setPayMethod]    = useState('cash');
  const [payReference, setPayReference] = useState('');
  const [payPaidBy,    setPayPaidBy]    = useState('');
  const [payAccountId, setPayAccountId] = useState('');
  const [paySubmitting, setPaySubmitting] = useState(false);

  // Form state — adjustment
  const [adjType,      setAdjType]      = useState<'debit' | 'credit'>('credit');
  const [adjAmount,    setAdjAmount]    = useState('');
  const [adjRef,       setAdjRef]       = useState('');
  const [adjSubmitting, setAdjSubmitting] = useState(false);

  // ── Load data ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ledgerRes, balanceRes, accRes] = await Promise.all([
        apiFetch(`/api/finance/student-ledger?student_id=${studentId}`),
        apiFetch(`/api/finance/balance/${studentId}`),
        apiFetch('/api/finance/accounts'),
      ]);
      setLedger(ledgerRes.ledger ?? []);
      setBalance(balanceRes);
      setAccounts(Array.isArray(accRes) ? accRes : []);

      // Get student name from profile
      const profile = await apiFetch(`/api/students/${studentId}/profile`);
      if (profile?.student) {
        setStudent({
          first_name: profile.student.first_name,
          last_name: profile.student.last_name,
          admission_no: profile.student.admission_no,
        });
      }
    } catch (e) {
      showToast('error', 'Failed to load fee data');
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  // ── Record Payment ─────────────────────────────────────────────────────
  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payAmount || parseFloat(payAmount) <= 0) {
      showToast('error', 'Enter a valid amount'); return;
    }
    setPaySubmitting(true);
    try {
      const res = await apiFetch('/api/finance/record-payment', {
        method: 'POST',
        body: JSON.stringify({
          student_id: studentId,
          amount: parseFloat(payAmount),
          method: payMethod,
          reference: payReference || undefined,
          paid_by: payPaidBy || undefined,
          account_id: payAccountId ? +payAccountId : undefined,
        }),
      });
      if (res.ok) {
        showToast(res.message || 'Payment recorded', 'success');
        setPayAmount(''); setPayReference(''); setPayPaidBy('');
        setShowPayment(false);
        await load();
      } else {
        showToast(res.error || 'Payment failed', 'error');
      }
    } finally {
      setPaySubmitting(false);
    }
  };

  // ── Adjustment ─────────────────────────────────────────────────────────
  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjAmount || parseFloat(adjAmount) <= 0) {
      showToast('error', 'Enter a valid amount'); return;
    }
    if (!adjRef.trim()) { showToast('error', 'Reference is required'); return; }
    setAdjSubmitting(true);
    try {
      const res = await apiFetch('/api/finance/adjust', {
        method: 'POST',
        body: JSON.stringify({
          student_id: studentId,
          type: adjType,
          amount: parseFloat(adjAmount),
          reference: adjRef.trim(),
        }),
      });
      if (res.ok) {
        showToast(res.message || 'Balance adjusted', 'success');
        setAdjAmount(''); setAdjRef('');
        setShowAdjust(false);
        await load();
      } else {
        showToast(res.error || 'Adjustment failed', 'error');
      }
    } finally {
      setAdjSubmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-slate-400">
        <Loader className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading fee data…</span>
      </div>
    );
  }

  const isOverdue = balance ? balance.balance > 0 : false;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/students/${studentId}`}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500" />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              Fee Ledger
            </h1>
            {student && (
              <p className="text-xs text-slate-500 mt-0.5">
                {student.first_name} {student.last_name} &middot; {student.admission_no}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={load}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Balance Cards */}
      {balance && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label="Total Charged"
            value={`TZS ${fmt(balance.total_charged)}`}
            sub={`${balance.entry_count} entries`}
            icon={TrendingUp}
            color="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300"
          />
          <StatCard
            label="Total Paid"
            value={`TZS ${fmt(balance.total_paid)}`}
            icon={CreditCard}
            color="bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
          />
          <StatCard
            label={isOverdue ? 'Balance Due' : 'Credit Balance'}
            value={`TZS ${fmt(Math.abs(balance.balance))}`}
            sub={isOverdue ? '⚠ Outstanding' : '✓ Overpaid / Clear'}
            icon={isOverdue ? AlertCircle : CheckCircle2}
            color={
              isOverdue
                ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                : 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
            }
          />
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => { setShowPayment(v => !v); setShowAdjust(false); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
        >
          <Receipt className="w-4 h-4" />
          Record Payment
        </button>
        <button
          onClick={() => { setShowAdjust(v => !v); setShowPayment(false); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 transition-colors"
        >
          <Wallet className="w-4 h-4" />
          Adjust Balance
        </button>
        <Link
          href={`/students/${studentId}`}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Profile
        </Link>
      </div>

      {/* Record Payment Form */}
      {showPayment && (
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-5">
          <h3 className="text-sm font-bold text-indigo-700 dark:text-indigo-300 mb-4 flex items-center gap-2">
            <Receipt className="w-4 h-4" /> Record Payment
          </h3>
          <form onSubmit={handlePayment} className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Amount (TZS) *</label>
              <input
                type="number" min="1" step="0.01"
                value={payAmount} onChange={e => setPayAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:border-indigo-500 outline-none"
                placeholder="50000" required
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Method</label>
              <select value={payMethod} onChange={e => setPayMethod(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:border-indigo-500 outline-none">
                {['cash','mpesa','airtel','bank_transfer','card','cheque','other'].map(m => (
                  <option key={m} value={m}>{m.replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Account</label>
              <select value={payAccountId} onChange={e => setPayAccountId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:border-indigo-500 outline-none">
                <option value="">— select account —</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Reference / Receipt No.</label>
              <input type="text" value={payReference} onChange={e => setPayReference(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:border-indigo-500 outline-none"
                placeholder="M-Pesa code, bank ref…" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Paid By (parent/guardian)</label>
              <input type="text" value={payPaidBy} onChange={e => setPayPaidBy(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:border-indigo-500 outline-none"
                placeholder="Guardian name" />
            </div>
            <div className="col-span-2 flex gap-2 justify-end">
              <button type="button" onClick={() => setShowPayment(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                Cancel
              </button>
              <button type="submit" disabled={paySubmitting}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-60">
                {paySubmitting ? <Loader className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Save Payment
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Adjust Balance Form */}
      {showAdjust && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-5">
          <h3 className="text-sm font-bold text-amber-700 dark:text-amber-300 mb-4 flex items-center gap-2">
            <Wallet className="w-4 h-4" /> Manual Balance Adjustment
          </h3>
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-4">
            A new ledger entry is created — nothing is overwritten.
          </p>
          <form onSubmit={handleAdjust} className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Type</label>
              <select value={adjType} onChange={e => setAdjType(e.target.value as 'debit'|'credit')}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:border-amber-500 outline-none">
                <option value="credit">Credit — reduce balance (e.g. waiver)</option>
                <option value="debit">Debit — increase balance (e.g. penalty)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Amount (TZS) *</label>
              <input type="number" min="1" step="0.01"
                value={adjAmount} onChange={e => setAdjAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:border-amber-500 outline-none"
                placeholder="10000" required />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Reference (reason) *</label>
              <input type="text" value={adjRef} onChange={e => setAdjRef(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:border-amber-500 outline-none"
                placeholder="e.g. Scholarship waiver / Data correction" required />
            </div>
            <div className="col-span-2 flex gap-2 justify-end">
              <button type="button" onClick={() => setShowAdjust(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                Cancel
              </button>
              <button type="submit" disabled={adjSubmitting}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold disabled:opacity-60">
                {adjSubmitting ? <Loader className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Apply Adjustment
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Ledger Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-indigo-500" />
            Full Ledger History
          </h2>
          <span className="text-xs text-slate-400">{ledger.length} entries</span>
        </div>

        {!ledger.length ? (
          <div className="p-12 text-center text-slate-400">
            <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No ledger entries yet.</p>
            <p className="text-xs mt-1">Assign fees or record a payment to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Date</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Reference</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Term</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide text-right">Debit</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide text-right">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {ledger.map((entry) => (
                  <tr
                    key={entry.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(entry.created_at).toLocaleDateString('en-GB')}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-700 dark:text-slate-200">{entry.reference}</span>
                      {entry.notes && (
                        <p className="text-xs text-slate-400 mt-0.5">{entry.notes}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{entry.term_name || '—'}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {entry.type === 'debit' ? (
                        <span className="text-red-600 dark:text-red-400 font-semibold">
                          {fmt(entry.amount)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {entry.type === 'credit' ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          {fmt(entry.amount)}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Running total footer */}
              {balance && (
                <tfoot className="bg-slate-50 dark:bg-slate-800/60 font-bold">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-xs text-slate-500 uppercase tracking-wide">
                      Net Balance
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-red-600 dark:text-red-400">
                      {fmt(balance.total_charged)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-emerald-600 dark:text-emerald-400">
                      {fmt(balance.total_paid)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-xs text-slate-500 uppercase tracking-wide">
                      Outstanding
                    </td>
                    <td className={`px-4 py-3 text-right font-mono text-base font-bold ${
                      balance.balance > 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}>
                      {balance.balance > 0 ? `TZS ${fmt(balance.balance)}` : 'CLEAR'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
