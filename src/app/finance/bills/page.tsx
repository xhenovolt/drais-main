'use client';

/**
 * Bills — generate learner fees from the rules engine.
 * A) Learner preview: pick a learner → see applicable fees + WHY each applies.
 * B) Bulk generate: term (+ optional class) → preview totals → commit (snapshots
 *    into student_fee_items, idempotent).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ReceiptText, Search, Loader2, Users, CheckCircle, Plus, Trash2, Printer, Download } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useCurrency } from '@/hooks/useCurrency';
import { useSchoolConfig } from '@/hooks/useSchoolConfig';
import { showToast } from '@/lib/toast';

export default function BillsPage() {
  const { format } = useCurrency();
  const { school } = useSchoolConfig();
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

  // adjustments
  const [feeItems, setFeeItems] = useState<any[]>([]);
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const blankAdj = { adjustment_type: 'percent_discount', fee_item_id: '', value: '', tag: '', reason: '' };
  const [adjForm, setAdjForm] = useState<any>(blankAdj);
  const [showAdj, setShowAdj] = useState(false);

  useEffect(() => {
    fetch('/api/terms').then((r) => r.json()).then((j) => { setTerms(j.data || []); if (j.data?.[0]) setTermId(String(j.data[0].id)); }).catch(() => {});
    fetch('/api/classes').then((r) => r.json()).then((j) => setClasses(j.data || [])).catch(() => {});
    fetch('/api/finance/fee-rules/items').then((r) => r.json()).then((j) => setFeeItems(j.items || [])).catch(() => {});
  }, []);

  const loadAdjustments = useCallback(async (studentId: number) => {
    try { const r = await fetch(`/api/finance/fee-rules/adjustments?student_id=${studentId}`, { cache: 'no-store' }); const j = await r.json(); setAdjustments(j.adjustments || []); } catch { /* */ }
  }, []);

  useEffect(() => {
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      try { const r = await fetch(`/api/students/full?q=${encodeURIComponent(q)}&limit=8`); const j = await r.json(); setResults(j.data || j.students || []); } catch { /* */ }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  /** The term's display name, for the printed heading. */
  const termLabel = () => terms.find((t: any) => String(t.id) === String(termId))?.name
    || (termId ? `Term #${termId}` : 'Current term');

  /**
   * CSV of the bill exactly as shown.
   *
   * Built from `preview.lines` — the same rows on screen — so an exported bill
   * can never disagree with the reviewed one. The "why it applies" reason is
   * included because it is the column that answers the question a parent
   * actually asks, and dropping it would make the export less useful than the
   * screen it came from.
   */
  const exportBillCsv = () => {
    const lines = preview?.lines ?? [];
    if (!lines.length) return;
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows: string[][] = [
      ['School', school?.name ?? ''],
      ['Learner', learner?.name ?? ''],
      ['Term', termLabel()],
      ['Generated', new Date().toLocaleString()],
      [],
      ['Fee', 'Why it applies', 'Base', 'Payable'],
      ...lines.map((l: any) => [
        l.name ?? '',
        l.reason ?? '',
        String(l.base_amount ?? l.amount ?? ''),
        String(l.final ?? l.amount ?? ''),
      ]),
      [],
      ['', '', 'Total payable', String(preview?.total ?? '')],
    ];
    const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bill-${(learner?.name ?? 'learner').replace(/[^\w-]+/g, '_')}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Printable bill.
   *
   * Rendered into a new window rather than via a print stylesheet on this page:
   * the page carries filters, an adjustments editor and a bulk-generate panel,
   * none of which belong on a document handed to a parent. Writing the document
   * explicitly means what prints is decided here, not left to whatever CSS
   * happens to survive.
   */
  const printBill = () => {
    const lines = preview?.lines ?? [];
    if (!lines.length) return;
    const esc = (v: unknown) => String(v ?? '').replace(/[&<>]/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as Record<string, string>)[ch]!);

    const body = lines.map((l: any) => `
      <tr>
        <td>${esc(l.name)}</td>
        <td class="reason">${esc(l.reason)}</td>
        <td class="num">${esc(format(l.base_amount ?? l.amount))}</td>
        <td class="num strong">${esc(format(l.final ?? l.amount))}</td>
      </tr>`).join('');

    const html = `<!doctype html><html><head><meta charset="utf-8">
      <title>Bill — ${esc(learner?.name ?? '')}</title>
      <style>
        *{box-sizing:border-box} body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#111;margin:32px;font-size:13px}
        .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px}
        h1{font-size:17px;margin:0} .sub{color:#555;font-size:12px;margin-top:2px}
        .meta{font-size:12px;color:#333;margin-bottom:14px}
        .meta b{display:inline-block;min-width:74px;color:#666;font-weight:500}
        table{width:100%;border-collapse:collapse;font-size:12.5px}
        th{text-align:left;border-bottom:1px solid #999;padding:6px 4px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#555}
        td{padding:6px 4px;border-bottom:1px solid #eee;vertical-align:top}
        .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
        .strong{font-weight:600} .reason{color:#666;font-size:11.5px}
        tfoot td{border-top:2px solid #111;border-bottom:none;font-weight:700;padding-top:8px}
        .foot{margin-top:22px;color:#666;font-size:11px;border-top:1px solid #ddd;padding-top:8px}
        @media print{body{margin:14mm}}
      </style></head><body>
      <div class="head">
        <div>
          <h1>${esc(school?.name || 'Fee Bill')}</h1>
          <div class="sub">${esc([school?.address, school?.phone].filter(Boolean).join(' · '))}</div>
        </div>
        <div class="sub" style="text-align:right">Fee bill<br>${esc(new Date().toLocaleDateString())}</div>
      </div>
      <div class="meta">
        <div><b>Learner</b> ${esc(learner?.name ?? '')}</div>
        <div><b>Term</b> ${esc(termLabel())}</div>
      </div>
      <table>
        <thead><tr><th>Fee</th><th>Why it applies</th><th class="num">Base</th><th class="num">Payable</th></tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><td colspan="3">Total payable</td><td class="num">${esc(format(preview?.total))}</td></tr></tfoot>
      </table>
      <div class="foot">This bill reflects the fee rules in force on ${esc(new Date().toLocaleDateString())}. Contact the bursar with any query.</div>
      </body></html>`;

    const w = window.open('', '_blank', 'width=900,height=1000');
    if (!w) { showToast('error', 'Allow pop-ups to print the bill'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    // Give the new document a tick to lay out before the print dialog opens,
    // otherwise some browsers print a blank first page.
    setTimeout(() => w.print(), 250);
  };

  const runPreview = useCallback(async (studentId: number) => {
    setLoadingPrev(true); setPreview(null);
    try {
      const r = await fetch('/api/finance/fee-rules/evaluate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ student_id: studentId, term_id: termId || null }) });
      setPreview(await r.json());
    } finally { setLoadingPrev(false); }
  }, [termId]);

  const addAdjustment = useCallback(async () => {
    if (!learner) return;
    if (!(Number(adjForm.value) > 0) && adjForm.adjustment_type !== 'waiver') { toast.error('Enter a value'); return; }
    const body = { student_id: learner.id, term_id: termId ? Number(termId) : null,
      adjustment_type: adjForm.adjustment_type, value: adjForm.adjustment_type === 'waiver' ? 0 : Number(adjForm.value),
      fee_item_id: adjForm.fee_item_id ? Number(adjForm.fee_item_id) : null, tag: adjForm.tag || null, reason: adjForm.reason || null };
    const r = await fetch('/api/finance/fee-rules/adjustments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) { toast.error(j.error || 'Failed'); return; }
    toast.success('Adjustment added (pending approval)'); setAdjForm(blankAdj); setShowAdj(false);
    loadAdjustments(learner.id);
  }, [learner, adjForm, termId, loadAdjustments]);

  const decideAdjustment = useCallback(async (id: number, status: string) => {
    await fetch(`/api/finance/fee-rules/adjustments/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) });
    if (learner) { loadAdjustments(learner.id); runPreview(learner.id); }
  }, [learner, loadAdjustments, runPreview]);

  const removeAdjustment = useCallback(async (id: number) => {
    await fetch(`/api/finance/fee-rules/adjustments/${id}`, { method: 'DELETE' });
    if (learner) { loadAdjustments(learner.id); runPreview(learner.id); }
  }, [learner, loadAdjustments, runPreview]);

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
            <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm"><span>{learner.name}</span><button onClick={() => { setLearner(null); setPreview(null); setAdjustments([]); }} className="text-xs text-indigo-600">change</button></div>
          ) : (
            <>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"><Search className="w-4 h-4 text-gray-400" /><input placeholder="Search learner…" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 bg-transparent text-sm outline-none" /></div>
              {results.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow max-h-48 overflow-y-auto">
                  {results.map((s: any) => {
                    // /api/students/full returns first_name and last_name as
                    // SEPARATE fields — there is no full_name and no name. The
                    // previous `s.full_name || s.name` was undefined for every
                    // row, so the learner rendered blank and only the admission
                    // number was visible: searching "Mariam" returned a list of
                    // numbers. Compose from the fields the API actually sends,
                    // and fall back to the admission number only when a learner
                    // genuinely has no name on record.
                    const nm =
                      s.full_name ||
                      s.name ||
                      [s.first_name, s.other_name, s.last_name].filter(Boolean).join(' ').trim() ||
                      s.admission_no ||
                      'Unnamed learner';
                    return (
                      <button
                        key={s.id}
                        onClick={() => { setLearner({ id: s.id, name: nm }); setResults([]); setQ(''); runPreview(s.id); loadAdjustments(s.id); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <span className="text-gray-900 dark:text-white">{nm}</span>
                        {s.admission_no && (
                          <span className="text-xs text-gray-400 ml-1.5">{s.admission_no}</span>
                        )}
                        {s.class_name && (
                          <span className="text-xs text-gray-400 ml-1.5">· {s.class_name}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
        {loadingPrev && <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />}
        {preview && (
          <div>
            {/* A bill is handed to a parent, so it must carry the school's
                identity, the learner, the term and the date — a bare table of
                figures is not a document anyone can act on or file. Both
                actions use the SAME rows already on screen, so what prints is
                exactly what was reviewed. */}
            <div className="flex items-center justify-end gap-2 mb-2 print:hidden">
              <button
                onClick={() => exportBillCsv()}
                disabled={!(preview.lines || []).length}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
              <button
                onClick={() => printBill()}
                disabled={!(preview.lines || []).length}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40"
              >
                <Printer className="w-3.5 h-3.5" /> Print
              </button>
            </div>
            {(preview.lines || []).length === 0 ? <p className="text-sm text-gray-400">No fees apply (no matching rules).</p> : (
              <table className="w-full text-sm">
                <thead className="text-gray-500"><tr><th className="text-left py-1">Fee</th><th className="text-left">Why it applies</th><th className="text-right">Base</th><th className="text-right">Payable</th></tr></thead>
                <tbody>
                  {preview.lines.map((l: any, i: number) => {
                    const adjusted = (l.adjustments && l.adjustments.length) || l.final !== l.base_amount;
                    return (
                      <tr key={i} className="border-t border-gray-100 dark:border-gray-700/50">
                        <td className="py-1.5 font-medium text-gray-900 dark:text-white">{l.name}</td>
                        <td className="text-xs text-gray-500">{l.reason}{adjusted && l.adjustments?.length ? <span className="block text-[11px] text-amber-600">adj: {l.adjustments.join(', ')}</span> : null}</td>
                        <td className="text-right text-gray-400">{format(l.base_amount ?? l.amount)}</td>
                        <td className="text-right font-medium">{format(l.final ?? l.amount)}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-gray-200 dark:border-gray-600 font-bold"><td className="py-1.5" colSpan={3}>Total payable</td><td className="text-right">{format(preview.total)}</td></tr>
                </tbody>
              </table>
            )}

            {/* Adjustments */}
            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Waivers / discounts / overrides</h3>
                <button onClick={() => setShowAdj((v) => !v)} className="text-xs text-indigo-600 hover:underline flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add adjustment</button>
              </div>
              {showAdj && (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 mb-2 grid grid-cols-2 gap-2">
                  <select value={adjForm.adjustment_type} onChange={(e) => setAdjForm({ ...adjForm, adjustment_type: e.target.value })} className="px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm">
                    <option value="percent_discount">% discount</option>
                    <option value="fixed_discount">Fixed discount</option>
                    <option value="override">Override amount</option>
                    <option value="waiver">Full waiver</option>
                  </select>
                  <select value={adjForm.fee_item_id} onChange={(e) => setAdjForm({ ...adjForm, fee_item_id: e.target.value })} className="px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm">
                    <option value="">All fees</option>
                    {feeItems.map((fi) => <option key={fi.id} value={fi.id}>{fi.name}</option>)}
                  </select>
                  {adjForm.adjustment_type !== 'waiver' && (
                    <input type="number" placeholder={adjForm.adjustment_type === 'percent_discount' ? '% off' : 'amount'} value={adjForm.value} onChange={(e) => setAdjForm({ ...adjForm, value: e.target.value })} className="px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
                  )}
                  <select value={adjForm.tag} onChange={(e) => setAdjForm({ ...adjForm, tag: e.target.value })} className="px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm">
                    <option value="">No tag</option>
                    <option value="scholarship">Scholarship</option>
                    <option value="staff_child">Staff child</option>
                    <option value="sibling">Sibling</option>
                    <option value="other">Other</option>
                  </select>
                  <input placeholder="Reason" value={adjForm.reason} onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })} className="col-span-2 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
                  <button onClick={addAdjustment} className="col-span-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium">Add (pending approval)</button>
                </div>
              )}
              {adjustments.length === 0 ? <p className="text-xs text-gray-400">No adjustments.</p> : (
                <ul className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {adjustments.map((a: any) => (
                    <li key={a.id} className="py-1.5 flex items-center justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-300">
                        {a.adjustment_type.replace('_', ' ')}{a.adjustment_type !== 'waiver' ? ` ${a.value}${a.adjustment_type === 'percent_discount' ? '%' : ''}` : ''}
                        <span className="text-xs text-gray-400"> · {a.fee_item_name || 'all fees'}{a.tag ? ` · ${a.tag}` : ''}{a.reason ? ` · ${a.reason}` : ''}</span>
                        <span className={`ml-1 text-[11px] ${a.status === 'approved' ? 'text-green-600' : a.status === 'rejected' ? 'text-red-600' : 'text-amber-600'}`}>[{a.status}]</span>
                      </span>
                      <span className="flex items-center gap-2">
                        {a.status === 'pending' && <button onClick={() => decideAdjustment(a.id, 'approved')} className="text-xs text-green-600 hover:underline">approve</button>}
                        <button onClick={() => removeAdjustment(a.id)} className="p-1 text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
