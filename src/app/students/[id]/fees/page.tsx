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
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency } from '@/lib/currency';
import { useI18n } from '@/components/i18n/I18nProvider';

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
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0 });
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StudentFeesPage() {
  const { id } = useParams<{ id: string }>();
  const studentId = parseInt(id);
  const { user } = useAuth();
  const { t, lang, rich, digits, formatNumber, formatMoney, formatDate } = useI18n();
  const currency = user?.school?.currency || 'UGX';
  const money = (n: number) => (lang === 'ar' ? formatMoney(n, currency) : formatCurrency(n, currency));
  // Ledger figures: the original English formatting, Arabic digits in Arabic.
  const num = (n: number) => (lang === 'ar' ? formatNumber(n) : fmt(n));

  const [balance, setBalance]   = useState<Balance | null>(null);
  const [ledger, setLedger]     = useState<LedgerEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading]   = useState(true);
  const [student, setStudent]   = useState<{
    display_name: string; first_name?: string; last_name?: string;
    admission_no?: string; class_name?: string | null;
  } | null>(null);

  // Panel state
  const [showPayment,  setShowPayment]  = useState(false);
  /** Set after a successful payment so the receipt can be handed over at once. */
  const [lastReceipt, setLastReceipt] = useState<{ receiptNo: string; paymentId?: number } | null>(null);
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

      // Learner identity for the page header.
      //
      // This read `profile.student`, which the route never returns — the
      // payload is `{ success, data: { …student } }`. So `student` stayed null
      // and the header rendered nothing, leaving a fees page identified only by
      // the numeric id in the URL. A bursar taking money had no confirmation
      // they were on the right learner.
      const profile = await apiFetch(`/api/students/${studentId}/profile`, { silent: true });
      const p = profile?.data ?? profile?.student ?? null;
      if (p) {
        // The class is NOT a field on the student — it lives on the enrolment,
        // because a learner's class is a fact about a term, not about them
        // (see the person/student/enrolment spine). Take the active enrolment,
        // falling back to the most recent.
        const enrolments = Array.isArray(p.enrollments) ? p.enrollments : [];
        const current =
          enrolments.find((e: any) => e.status === 'active') ?? enrolments[0] ?? null;

        setStudent({
          // `display_name` is the localised name the API composes via
          // personDisplayName(); fall back to the raw name parts.
          display_name:
            p.display_name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
          first_name: p.first_name,
          last_name: p.last_name,
          admission_no: p.admission_no,
          class_name: current?.class_name ?? null,
        });
      }
    } catch (e) {
      showToast('error', t('students.fees.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  // ── Record Payment ─────────────────────────────────────────────────────
  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payAmount || parseFloat(payAmount) <= 0) {
      showToast('error', t('students.fees.validAmount')); return;
    }
    setPaySubmitting(true);
    try {
      // apiFetch THROWS on failure and already shows both the error toast and
      // the success toast. Reaching the next line means the payment was
      // committed, so there is nothing to branch on here.
      //
      // This previously read `if (res.ok)`. apiFetch returns the parsed JSON
      // body, not a Response — so `res.ok` was ALWAYS undefined and every
      // successful payment fell into the else branch. The bursar saw a success
      // toast from apiFetch immediately followed by "Payment failed", the
      // balance never refreshed, and the natural response was to enter the
      // payment again — duplicating it in the ledger.
      // Capture the response. It carries { paymentId, receiptNo, receiptUrl },
      // and this call previously discarded it — so a payment was taken and the
      // payer was offered NO receipt at all. In a school office an
      // undocumented payment is the transaction most likely to be disputed
      // later, and the bursar had nothing to hand over.
      const res: any = await apiFetch('/api/finance/record-payment', {
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

      setPayAmount(''); setPayReference(''); setPayPaidBy('');
      setShowPayment(false);
      setLastReceipt(res?.data?.receiptNo
        ? { receiptNo: res.data.receiptNo, paymentId: res.data.paymentId }
        : null);
      await load();
    } catch {
      // apiFetch has already surfaced the reason. Keep the form open and
      // populated so the bursar can correct and retry rather than re-key it.
    } finally {
      setPaySubmitting(false);
    }
  };

  // ── Adjustment ─────────────────────────────────────────────────────────
  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjAmount || parseFloat(adjAmount) <= 0) {
      showToast('error', t('students.fees.validAmount')); return;
    }
    if (!adjRef.trim()) { showToast('error', t('students.fees.referenceRequired')); return; }
    setAdjSubmitting(true);
    try {
      // Same fix as handlePayment: apiFetch throws on failure and toasts on
      // success, so `if (res.ok)` was always false and every successful
      // adjustment reported "Adjustment failed" without refreshing.
      await apiFetch('/api/finance/adjust', {
        method: 'POST',
        body: JSON.stringify({
          student_id: studentId,
          type: adjType,
          amount: parseFloat(adjAmount),
          reference: adjRef.trim(),
        }),
      });

      setAdjAmount(''); setAdjRef('');
      setShowAdjust(false);
      await load();
    } catch {
      // apiFetch already surfaced the reason; keep the form for correction.
    } finally {
      setAdjSubmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-slate-400">
        <Loader className="w-5 h-5 animate-spin" />
        <span className="text-sm">{t('students.fees.loading')}</span>
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
            {/* The LEARNER leads, not the page title. A bursar about to take
                money must be able to confirm at a glance that they are on the
                right person — the page title is the same on every one. */}
            <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              {student?.display_name || t('students.fees.learnerNumber', { id: studentId })}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {student
                ? [student.admission_no, student.class_name].filter(Boolean).join(' · ') || t('students.fees.ledger')
                : t('students.fees.loadingLearner')}
            </p>
          </div>
        </div>
        <button
          onClick={load}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title={t('students.fees.refresh')}
        >
          <RefreshCw className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Balance Cards */}
      {balance && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label={t('students.fees.totalCharged')}
            value={money(balance.total_charged)}
            sub={t('students.fees.entries', { count: balance.entry_count })}
            icon={TrendingUp}
            color="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300"
          />
          <StatCard
            label={t('students.fees.totalPaid')}
            value={money(balance.total_paid)}
            icon={CreditCard}
            color="bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
          />
          <StatCard
            label={isOverdue ? t('students.fees.balanceDue') : t('students.fees.creditBalance')}
            value={money(Math.abs(balance.balance))}
            sub={isOverdue ? t('students.fees.outstandingMark') : t('students.fees.clearMark')}
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
          {t('students.fees.recordPayment')}
        </button>
        <button
          onClick={() => { setShowAdjust(v => !v); setShowPayment(false); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 transition-colors"
        >
          <Wallet className="w-4 h-4" />
          {t('students.fees.adjustBalance')}
        </button>
        <Link
          href={`/students/${studentId}`}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 rtl-flip" />
          {t('students.fees.profile')}
        </Link>
      </div>

      {/* Receipt handover.
          A payment taken with no receipt offered is the transaction most
          likely to be disputed later, and this page previously discarded the
          receipt number the API had already issued. Shown until dismissed so
          it survives the list refresh. */}
      {lastReceipt && (
        <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4 flex items-center gap-3 flex-wrap">
          <Receipt className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="text-sm text-emerald-800 dark:text-emerald-200 flex-1 min-w-0">
            {rich('students.fees.paymentRecorded', { receipt: <span className="font-mono font-semibold">{lastReceipt.receiptNo}</span> })}
          </span>
          <a
            href={`/finance/receipts/${encodeURIComponent(lastReceipt.receiptNo)}`}
            target="_blank" rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {t('students.fees.viewPrint')}
          </a>
          {lastReceipt.paymentId && (
            <a
              href={`/api/finance/payments/${lastReceipt.paymentId}/receipt`}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-emerald-400 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300"
            >
              {t('students.fees.downloadPdf')}
            </a>
          )}
          <button
            onClick={() => setLastReceipt(null)}
            className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline"
          >
            {t('students.fees.dismiss')}
          </button>
        </div>
      )}

      {/* Record Payment Form */}
      {showPayment && (
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-5">
          <h3 className="text-sm font-bold text-indigo-700 dark:text-indigo-300 mb-4 flex items-center gap-2">
            <Receipt className="w-4 h-4" /> {t('students.fees.recordPayment')}
          </h3>
          <form onSubmit={handlePayment} className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-slate-500 mb-1">{t('students.fees.amount', { currency })}</label>
              <input
                type="number" min="1" step="0.01"
                value={payAmount} onChange={e => setPayAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:border-indigo-500 outline-none"
                placeholder="50000" required
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-slate-500 mb-1">{t('students.fees.method')}</label>
              <select value={payMethod} onChange={e => setPayMethod(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:border-indigo-500 outline-none">
                {['cash','mpesa','airtel','bank_transfer','card','cheque','other'].map(m => (
                  <option key={m} value={m}>{t(`students.fees.methods.${m}`)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">{t('students.fees.account')}</label>
              <select value={payAccountId} onChange={e => setPayAccountId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:border-indigo-500 outline-none">
                <option value="">{t('students.fees.selectAccount')}</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">{t('students.fees.referenceLabel')}</label>
              <input type="text" value={payReference} onChange={e => setPayReference(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:border-indigo-500 outline-none"
                placeholder={t('students.fees.referencePlaceholder')} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1">{t('students.fees.paidBy')}</label>
              <input type="text" value={payPaidBy} onChange={e => setPayPaidBy(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:border-indigo-500 outline-none"
                placeholder={t('students.fees.paidByPlaceholder')} />
            </div>
            <div className="col-span-2 flex gap-2 justify-end">
              <button type="button" onClick={() => setShowPayment(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                {t('students.fees.cancel')}
              </button>
              <button type="submit" disabled={paySubmitting}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-60">
                {paySubmitting ? <Loader className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {t('students.fees.savePayment')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Adjust Balance Form */}
      {showAdjust && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-5">
          <h3 className="text-sm font-bold text-amber-700 dark:text-amber-300 mb-4 flex items-center gap-2">
            <Wallet className="w-4 h-4" /> {t('students.fees.adjustTitle')}
          </h3>
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-4">
            {t('students.fees.adjustNote')}
          </p>
          <form onSubmit={handleAdjust} className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">{t('students.fees.type')}</label>
              <select value={adjType} onChange={e => setAdjType(e.target.value as 'debit'|'credit')}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:border-amber-500 outline-none">
                <option value="credit">{t('students.fees.typeCredit')}</option>
                <option value="debit">{t('students.fees.typeDebit')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">{t('students.fees.amount', { currency })}</label>
              <input type="number" min="1" step="0.01"
                value={adjAmount} onChange={e => setAdjAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:border-amber-500 outline-none"
                placeholder="10000" required />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1">{t('students.fees.reasonLabel')}</label>
              <input type="text" value={adjRef} onChange={e => setAdjRef(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:border-amber-500 outline-none"
                placeholder={t('students.fees.reasonPlaceholder')} required />
            </div>
            <div className="col-span-2 flex gap-2 justify-end">
              <button type="button" onClick={() => setShowAdjust(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                {t('students.fees.cancel')}
              </button>
              <button type="submit" disabled={adjSubmitting}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold disabled:opacity-60">
                {adjSubmitting ? <Loader className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {t('students.fees.applyAdjustment')}
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
            {t('students.fees.history')}
          </h2>
          <span className="text-xs text-slate-400">{t('students.fees.entries', { count: ledger.length })}</span>
        </div>

        {!ledger.length ? (
          <div className="p-12 text-center text-slate-400">
            <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{t('students.fees.noEntries')}</p>
            <p className="text-xs mt-1">{t('students.fees.noEntriesHint')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 text-start">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t('students.fees.col.date')}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t('students.fees.col.reference')}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t('students.fees.col.term')}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide text-end">{t('students.fees.col.debit')}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide text-end">{t('students.fees.col.credit')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {ledger.map((entry) => (
                  <tr
                    key={entry.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {lang === 'ar' ? formatDate(entry.created_at, 'short') : new Date(entry.created_at).toLocaleDateString('en-GB')}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-700 dark:text-slate-200">{entry.reference}</span>
                      {entry.notes && (
                        <p className="text-xs text-slate-400 mt-0.5">{entry.notes}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{entry.term_name || '—'}</td>
                    <td className="px-4 py-3 text-end font-mono">
                      {entry.type === 'debit' ? (
                        <span className="text-red-600 dark:text-red-400 font-semibold">
                          {num(entry.amount)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-end font-mono">
                      {entry.type === 'credit' ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          {num(entry.amount)}
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
                      {t('students.fees.netBalance')}
                    </td>
                    <td className="px-4 py-3 text-end font-mono text-sm text-red-600 dark:text-red-400">
                      {num(balance.total_charged)}
                    </td>
                    <td className="px-4 py-3 text-end font-mono text-sm text-emerald-600 dark:text-emerald-400">
                      {num(balance.total_paid)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-xs text-slate-500 uppercase tracking-wide">
                      {t('students.fees.outstanding')}
                    </td>
                    <td className={`px-4 py-3 text-end font-mono text-base font-bold ${
                      balance.balance > 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}>
                      {balance.balance > 0 ? money(balance.balance) : t('students.fees.clear')}
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
