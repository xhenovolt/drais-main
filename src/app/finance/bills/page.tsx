'use client';

/**
 * Bills — generate learner fees from the rules engine.
 * A) Learner preview: pick a learner → see applicable fees + WHY each applies.
 * B) Bulk generate: term (+ optional class) → preview totals → commit (snapshots
 *    into student_fee_items, idempotent).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ReceiptText, Search, Loader2, Users, CheckCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useCurrency } from '@/hooks/useCurrency';

export default function BillsPage() {
  const { format } = useCurrency();
  const [terms, setTerms] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [termId, setTermId] = useState('');

  // A) learner preview
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [learner, setLearner] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
  const [loadingPrev, setLoadingPrev] = useState(false);

  // B) bulk
  const [classId, setClassId] = useState('');
  const [bulk, setBulk] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/terms').then((r) => r.json()).then((j) => { setTerms(j.data || []); if (j.data?.[0]) setTermId(String(j.data[0].id)); }).catch(() => {});
    fetch('/api/classes').then((r) => r.json()).then((j) => setClasses(j.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      try { const r = await fetch(`/api/students/full?q=${encodeURIComponent(q)}&limit=8`); const j = await r.json(); setResults(j.data || j.students || []); } catch { /* */ }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const runPreview = useCallback(async (studentId: number) => {
    setLoadingPrev(true); setPreview(null);
    try {
      const r = await fetch('/api/finance/fee-rules/evaluate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ student_id: studentId, term_id: termId || null }) });
      setPreview(await r.json());
    } finally { setLoadingPrev(false); }
  }, [termId]);

  const runBulk = useCallback(async (commit: boolean) => {
    if (!termId) { toast.error('Pick a term'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/finance/fee-rules/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ term_id: Number(termId), class_id: classId ? Number(classId) : null, commit }) });
      const j = await r.json();
      if (!r.ok) { toast.error(j.error || 'Failed'); return; }
      setBulk(j);
      if (commit) toast.success(`Generated ${j.inserted} fee line(s) for ${j.learnersAffected} learner(s)`);
    } finally { setBusy(false); }
  }, [termId, classId]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><ReceiptText className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-white">Bills</h1><p className="text-sm text-gray-500 dark:text-gray-400">Generate fees from rules — no manual per-learner assignment.</p></div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">Term</span>
        <select value={termId} onChange={(e) => setTermId(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm">
          <option value="">Select term…</option>
          {terms.map((t) => <option key={t.id} value={t.id}>{t.name || `Term ${t.id}`}</option>)}
        </select>
      </div>

      {/* A) Learner preview */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Learner fee preview</h2>
        <div className="relative">
          {learner ? (
            <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm"><span>{learner.name}</span><button onClick={() => { setLearner(null); setPreview(null); }} className="text-xs text-indigo-600">change</button></div>
          ) : (
            <>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"><Search className="w-4 h-4 text-gray-400" /><input placeholder="Search learner…" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 bg-transparent text-sm outline-none" /></div>
              {results.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow max-h-48 overflow-y-auto">
                  {results.map((s: any) => <button key={s.id} onClick={() => { const nm = s.full_name || s.name; setLearner({ id: s.id, name: nm }); setResults([]); setQ(''); runPreview(s.id); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">{s.full_name || s.name} <span className="text-xs text-gray-400">{s.admission_no}</span></button>)}
                </div>
              )}
            </>
          )}
        </div>
        {loadingPrev && <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />}
        {preview && (
          <div>
            {(preview.lines || []).length === 0 ? <p className="text-sm text-gray-400">No fees apply (no matching rules).</p> : (
              <table className="w-full text-sm">
                <thead className="text-gray-500"><tr><th className="text-left py-1">Fee</th><th className="text-left">Why it applies</th><th className="text-right">Amount</th></tr></thead>
                <tbody>
                  {preview.lines.map((l: any, i: number) => (
                    <tr key={i} className="border-t border-gray-100 dark:border-gray-700/50"><td className="py-1.5 font-medium text-gray-900 dark:text-white">{l.name}</td><td className="text-xs text-gray-500">{l.reason}</td><td className="text-right">{format(l.amount)}</td></tr>
                  ))}
                  <tr className="border-t-2 border-gray-200 dark:border-gray-600 font-bold"><td className="py-1.5" colSpan={2}>Total</td><td className="text-right">{format(preview.total)}</td></tr>
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* B) Bulk generate */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Bulk generate</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm">
            <option value="">All classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={() => runBulk(false)} disabled={busy || !termId} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-sm font-medium disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />} Preview</button>
          <button onClick={() => runBulk(true)} disabled={busy || !termId || !bulk} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50"><CheckCircle className="w-4 h-4" /> Generate &amp; save</button>
        </div>
        {bulk && (
          <div className="rounded-lg bg-indigo-50 dark:bg-indigo-900/20 p-3 text-sm">
            <p className="text-indigo-700 dark:text-indigo-300">{bulk.learnersAffected} of {bulk.learners} learner(s) get fees · {bulk.linesTotal} line(s) · {format(bulk.amountTotal)} total</p>
            {bulk.committed ? <p className="text-xs text-green-600 mt-1">Saved: {bulk.inserted} inserted, {bulk.skipped} already existed.</p> : <p className="text-xs text-gray-500 mt-1">Preview only — click “Generate &amp; save” to commit.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
