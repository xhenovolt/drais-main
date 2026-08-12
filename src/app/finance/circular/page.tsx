'use client';

/**
 * Fee circular — the document a school sends home each term.
 *
 * Schools produce this by hand every term, reading a fee list and working out
 * which classes pay what. DRAIS already held both halves — `fee_items` and
 * `fee_eligibility_rules` — and no screen put them together, so the error-prone
 * step stayed manual.
 *
 * The design decision that matters is how conditional fees are shown. A fee
 * that depends on boarding status, gender or entrant status cannot be resolved
 * for a whole class, so it is listed SEPARATELY with its condition rather than
 * folded into the total. A circular that adds a boarding fee to a day
 * scholar's total is worse than no circular — the school asks for money it
 * cannot justify.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Printer, FileText, Download } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';
import { useSchoolConfig } from '@/hooks/useSchoolConfig';
import { showToast } from '@/lib/toast';

export default function FeeCircularPage() {
  const { format } = useCurrency();
  const { school } = useSchoolConfig();

  const [terms, setTerms] = useState<any[]>([]);
  const [termId, setTermId] = useState('');
  const [classes, setClasses] = useState<any[]>([]);
  const [classId, setClassId] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/terms').then((r) => r.json())
      .then((j) => { setTerms(j.data || []); if (j.data?.[0]) setTermId(String(j.data[0].id)); })
      .catch(() => {});
    fetch('/api/classes').then((r) => r.json())
      .then((j) => setClasses(j.data || []))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (termId) p.set('term_id', termId);
      if (classId) p.set('class_id', classId);
      const r = await fetch(`/api/finance/circular?${p}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) { showToast('error', j?.error ?? 'Could not build the circular'); setData(null); }
      else setData(j);
    } catch {
      showToast('error', 'Could not reach the server');
    } finally { setLoading(false); }
  }, [termId, classId]);

  useEffect(() => { if (termId) load(); }, [termId, classId, load]);

  const termName = terms.find((t) => String(t.id) === String(termId))?.name ?? '';
  const rows: any[] = data?.classes ?? [];

  const exportCsv = () => {
    if (!rows.length) return;
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const out: string[][] = [
      [school?.name ?? '', 'Fee circular', termName],
      ['Generated', new Date().toLocaleString()],
      [],
      ['Class', 'Category', 'Fee', 'Frequency', 'Amount', 'Applies to'],
    ];
    for (const c of rows) {
      for (const g of c.groups) {
        for (const it of g.items) {
          out.push([c.class_name, g.category, it.name, it.frequency ?? '', String(it.amount), 'all in class']);
        }
      }
      for (const it of c.conditional) {
        out.push([c.class_name, it.category, it.name, it.frequency ?? '', String(it.amount), it.condition]);
      }
      out.push([c.class_name, '', 'TOTAL (excludes conditional)', '', String(c.total), '']);
      out.push([]);
    }
    const blob = new Blob([`﻿${out.map((r) => r.map(esc).join(',')).join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fee-circular-${termName.replace(/[^\w-]+/g, '_') || 'term'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap print:hidden">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-500" /> Fee circular
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            What each class pays this term, and who each fee applies to. Built from your fee items and rules.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            disabled={!rows.length}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button
            onClick={() => window.print()}
            disabled={!rows.length}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <select
          value={termId}
          onChange={(e) => setTermId(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        >
          {terms.map((t) => <option key={t.id} value={t.id}>{t.name || `Term ${t.id}`}</option>)}
        </select>
        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        >
          <option value="">All classes</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />}
      </div>

      {/* Print header — hidden on screen, where the page already has a title. */}
      <div className="hidden print:block border-b-2 border-black pb-2 mb-3">
        <h1 className="text-lg font-bold">{school?.name || 'Fee circular'}</h1>
        <p className="text-xs">
          Fee circular{termName ? ` · ${termName}` : ''} · {new Date().toLocaleDateString()}
        </p>
      </div>

      {!loading && rows.length === 0 && (
        <div className="py-10 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-300">No fees are set up yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            Add fees under Finance → Fee items, then give each one a rule saying who pays it.
          </p>
        </div>
      )}

      <div className="space-y-6">
        {rows.map((c) => (
          <section
            key={c.class_id}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 print:border-black print:break-inside-avoid"
          >
            <div className="flex items-baseline justify-between gap-3 border-b border-gray-100 dark:border-gray-800 pb-2 mb-3">
              <h2 className="font-bold text-gray-900 dark:text-white">{c.class_name}</h2>
              <span className="text-sm font-bold tabular-nums text-gray-900 dark:text-white">
                {format(c.total)}
              </span>
            </div>

            {c.groups.length === 0 ? (
              <p className="text-xs text-gray-400">No fees apply to this class.</p>
            ) : (
              <div className="space-y-3">
                {c.groups.map((g: any) => (
                  <div key={g.category}>
                    <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1">
                      {g.category}
                    </p>
                    <table className="w-full text-sm">
                      <tbody>
                        {g.items.map((it: any) => (
                          <tr key={it.id} className="border-b border-gray-50 dark:border-gray-800/60">
                            <td className="py-1 text-gray-800 dark:text-gray-100">
                              {it.name}
                              {!it.mandatory && (
                                <span className="ml-1.5 text-[10px] text-gray-400">optional</span>
                              )}
                            </td>
                            <td className="py-1 text-xs text-gray-400 w-24">{it.frequency}</td>
                            <td className="py-1 text-right tabular-nums w-32">{format(it.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}

            {c.conditional.length > 0 && (
              <div className="mt-3 pt-3 border-t border-dashed border-gray-200 dark:border-gray-700">
                <p className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400 font-semibold mb-1">
                  Additional, depending on the learner
                </p>
                {/* Listed apart from the total on purpose: these depend on
                    boarding, gender or entrant status, which is a property of a
                    LEARNER, not of a class. Folding them into one number would
                    misstate what most parents owe. */}
                <table className="w-full text-sm">
                  <tbody>
                    {c.conditional.map((it: any, i: number) => (
                      <tr key={`${it.id}-${i}`} className="border-b border-gray-50 dark:border-gray-800/60">
                        <td className="py-1 text-gray-800 dark:text-gray-100">{it.name}</td>
                        <td className="py-1 text-xs text-amber-700 dark:text-amber-400 w-40">{it.condition}</td>
                        <td className="py-1 text-right tabular-nums w-32">{format(it.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[11px] text-gray-400 mt-1">
                  Not included in the {format(c.total)} above — each applies only to learners who meet the condition.
                </p>
              </div>
            )}
          </section>
        ))}
      </div>

      {rows.length > 0 && (
        <p className="text-[11px] text-gray-400 print:mt-4">
          Prepared {new Date().toLocaleDateString()}
          {termName ? ` for ${termName}` : ''}. Amounts reflect the fee rules in force today.
        </p>
      )}
    </div>
  );
}
