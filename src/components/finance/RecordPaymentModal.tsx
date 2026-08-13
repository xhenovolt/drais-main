'use client';

/**
 * Record a payment against a learner.
 *
 * WHY THIS EXISTS
 * /finance/payments carried a "Record Payment" button whose onClick set
 * `showPaymentModal` — a state variable NOTHING RENDERED. Clicking it did
 * nothing: no modal, no error, no feedback. The page's only network call
 * fetched a receipt PDF. So from anywhere under /finance a bursar could not
 * take money, and the only working payment form in DRAIS was buried on an
 * individual learner's profile at /students/[id]/fees.
 *
 * That is very likely part of why only four payments exist in production: the
 * obvious place to pay had never worked.
 *
 * ONE COMPONENT, THREE SCREENS
 * Shared by /finance/payments, /finance/fees and /finance/learners-fees. Three
 * copies of a money form is how they drift — and a payment dialog that behaves
 * differently depending on which page you opened it from is worse than one
 * that is merely plain.
 *
 * POSTS TO /api/finance/record-payment, which is module-gated and requires
 * `finance.fees.manage`, and which delegates to recordPayment() in
 * FinanceLedger — the canonical writer. That writes finance_payments, the
 * student_ledger credit and the receipt inside ONE transaction, so a failure
 * cannot leave money recorded with the balance unchanged. This component adds
 * no write path of its own; it is a form over the path that already exists.
 */
import React, { useEffect, useState } from 'react';
import { X, Loader2, Search, Check, AlertTriangle } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';

const METHODS = [
  { value: 'cash',          label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'mpesa',         label: 'MTN / MoMo' },
  { value: 'airtel',        label: 'Airtel Money' },
  { value: 'card',          label: 'Card' },
  { value: 'cheque',        label: 'Cheque' },
  { value: 'other',         label: 'Other' },
];

export interface PrefilledLearner {
  id: number;
  name: string;
  admission_no?: string | null;
  class_name?: string | null;
  balance?: number | null;
}

export function RecordPaymentModal({
  open,
  onClose,
  onRecorded,
  learner: prefilled,
}: {
  open: boolean;
  onClose: () => void;
  /** Called after a successful write so the caller can refresh its list. */
  onRecorded?: (result: any) => void;
  /** When opened from a learner row, the search step is skipped. */
  learner?: PrefilledLearner | null;
}) {
  const { format } = useCurrency();

  const [learner, setLearner] = useState<PrefilledLearner | null>(prefilled ?? null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [notes, setNotes] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<any>(null);

  useEffect(() => { setLearner(prefilled ?? null); }, [prefilled, open]);

  // Reset between openings, so a second payment never inherits the first's
  // amount or reference — the kind of carry-over that produces a duplicate.
  useEffect(() => {
    if (!open) return;
    setAmount(''); setReference(''); setPaidBy(''); setNotes('');
    setMethod('cash'); setError(null); setDone(null); setQ(''); setResults([]);
  }, [open]);

  useEffect(() => {
    if (!open || learner || q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/students/full?q=${encodeURIComponent(q.trim())}&limit=8`);
        const j = await r.json();
        setResults(Array.isArray(j?.data) ? j.data : []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q, open, learner]);

  if (!open) return null;

  // /api/students/full returns first_name / last_name separately — there is no
  // full_name field. Composing it here is the same fix made on /finance/bills,
  // where reading a non-existent field rendered a list of bare admission numbers.
  const nameOf = (s: any) =>
    [s.first_name, s.other_name, s.last_name].filter(Boolean).join(' ').trim()
    || s.admission_no || 'Unnamed learner';

  const submit = async () => {
    setError(null);
    const value = parseFloat(amount);
    if (!learner)                       { setError('Choose a learner first.'); return; }
    if (!Number.isFinite(value) || value <= 0) { setError('Enter an amount greater than zero.'); return; }

    setBusy(true);
    try {
      const res = await fetch('/api/finance/record-payment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          student_id: learner.id,
          amount: value,
          method,
          reference: reference.trim() || undefined,
          paid_by: paidBy.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Show the server's reason. A generic "failed" on a money action sends
        // the operator to the founder instead of to the cause.
        setError(j?.error || j?.message || `Payment failed (${res.status}).`);
      } else {
        setDone(j);
        onRecorded?.(j);
      }
    } catch {
      setError('Could not reach the server. The payment was NOT recorded.');
    } finally {
      setBusy(false);
    }
  };

  const input = 'w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Record a payment</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {done ? (
          <div className="p-6 text-center space-y-3">
            <div className="mx-auto w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Payment recorded</p>
            {/* The endpoint returns { data: { paymentId, receiptNo, receiptUrl } }
                — camelCase, nested under `data`. Reading done.receipt_no would
                render nothing, the same class of mistake that made the bills
                search show bare admission numbers. */}
            <p className="text-xs text-gray-500">
              {learner?.name}
              {done?.data?.receiptNo ? <> · receipt <span className="font-mono">{done.data.receiptNo}</span></> : null}
            </p>

            {/* A payment without a receipt in the payer's hand is the single
                most disputed transaction in a school office. Offered
                immediately, not left for someone to find later. */}
            {done?.data?.receiptNo && (
              <div className="flex justify-center gap-2">
                <a
                  href={`/finance/receipts/${encodeURIComponent(done.data.receiptNo)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="px-3 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
                >
                  View / print receipt
                </a>
                {done?.data?.paymentId && (
                  <a
                    href={`/api/finance/payments/${done.data.paymentId}/receipt`}
                    className="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"
                  >
                    Download PDF
                  </a>
                )}
              </div>
            )}

            <div className="flex justify-center gap-2 pt-1">
              <button
                onClick={() => { setDone(null); setAmount(''); setReference(''); setPaidBy(''); setNotes(''); }}
                className="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"
              >
                Record another
              </button>
              <button onClick={onClose} className="px-3 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white">
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-3">
            {learner ? (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                <div className="min-w-0">
                  <p className="text-sm text-gray-900 dark:text-white truncate">{learner.name}</p>
                  <p className="text-[11px] text-gray-500 truncate">
                    {learner.admission_no}{learner.class_name ? ` · ${learner.class_name}` : ''}
                    {learner.balance != null ? ` · owing ${format(learner.balance)}` : ''}
                  </p>
                </div>
                {!prefilled && (
                  <button onClick={() => setLearner(null)} className="text-[11px] text-indigo-600 hover:underline shrink-0 ml-2">
                    Change
                  </button>
                )}
              </div>
            ) : (
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search learner by name or admission no…"
                  className={`${input} pl-8`}
                />
                {searching && <Loader2 className="w-3.5 h-3.5 animate-spin absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />}
                {results.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow">
                    {results.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { setLearner({ id: s.id, name: nameOf(s), admission_no: s.admission_no, class_name: s.class_name }); setResults([]); setQ(''); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <span className="text-gray-900 dark:text-white">{nameOf(s)}</span>
                        {s.admission_no && <span className="text-xs text-gray-400 ml-1.5">{s.admission_no}</span>}
                        {s.class_name && <span className="text-xs text-gray-400 ml-1.5">· {s.class_name}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">
                  Amount <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number" min="0" step="any" inputMode="decimal"
                  value={amount} onChange={(e) => setAmount(e.target.value)}
                  placeholder="0" className={input}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">Method</label>
                <select value={method} onChange={(e) => setMethod(e.target.value)} className={input}>
                  {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">Reference</label>
                <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Txn / slip no." className={input} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">Paid by</label>
                <input value={paidBy} onChange={(e) => setPaidBy(e.target.value)} placeholder="Who paid" className={input} />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">Notes</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className={input} />
            </div>

            {error && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 text-xs">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <p className="text-[10px] text-gray-400">
              The payment is allocated across the learner&apos;s outstanding items and a receipt is issued. Recorded
              against your account.
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={busy || !learner || !amount}
                className="px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {busy ? 'Recording…' : 'Record payment'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default RecordPaymentModal;
