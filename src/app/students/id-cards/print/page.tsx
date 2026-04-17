'use client';
/**
 * /students/id-cards/print — printable A4 grid of student ID cards
 *
 * Layout: 3 columns × 3 rows = 9 cards per A4 page
 * Data:   Read from sessionStorage (set by the designer page)
 * Print:  window.print() — @media print hides all chrome
 */

import { useState, useEffect } from 'react';
import { Printer, Loader2, ArrowLeft, X } from 'lucide-react';
import { IDCardPreview, IDCardStudent, IDCardMeta } from '@/components/students/IDCardPreview';
import { IDCardConfig, DEFAULT_ID_CARD_CONFIG } from '@/lib/idCardConfig';

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

export default function IDCardPrintPage() {
  const [config,   setConfig]   = useState<IDCardConfig>(DEFAULT_ID_CARD_CONFIG);
  const [meta,     setMeta]     = useState<IDCardMeta>({ schoolName: 'School', schoolLogo: '' });
  const [students, setStudents] = useState<IDCardStudent[]>([]);
  const [ready,    setReady]    = useState(false);

  useEffect(() => {
    try {
      const rawConfig   = sessionStorage.getItem('id_card_config');
      const rawIds      = sessionStorage.getItem('id_card_ids');
      const rawLearners = sessionStorage.getItem('id_card_learners');
      const rawMeta     = sessionStorage.getItem('id_card_meta');

      if (rawConfig)   setConfig({ ...DEFAULT_ID_CARD_CONFIG, ...JSON.parse(rawConfig) });
      if (rawMeta)     setMeta(JSON.parse(rawMeta));

      if (rawIds && rawLearners) {
        const ids: number[]       = JSON.parse(rawIds);
        const all: IDCardStudent[] = JSON.parse(rawLearners);
        const idSet = new Set(ids);
        setStudents(all.filter(s => idSet.has(s.id)));
      } else if (rawLearners) {
        setStudents(JSON.parse(rawLearners));
      }
    } catch (err) {
      console.error('[IDCardPrint] Failed to read sessionStorage:', err);
    }
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const pages = chunk(students, 9);

  return (
    <>
      {/* ── Print controls (hidden in print) ─────────────────────────────── */}
      <div className="no-print fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.close()}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <div>
            <p className="text-sm font-bold text-slate-800">Print ID Cards</p>
            <p className="text-xs text-slate-500">
              {students.length} card{students.length !== 1 ? 's' : ''} · {pages.length} page{pages.length !== 1 ? 's' : ''} · 3 × 3 per A4
            </p>
          </div>
        </div>

        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-md"
        >
          <Printer className="w-4 h-4" />
          Print
        </button>
      </div>

      {/* ── Print stylesheet ─────────────────────────────────────────────── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; padding: 0; background: white; }
          .print-page {
            page-break-after: always;
            break-after: page;
          }
          .print-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
          .id-card-root {
            box-shadow: none !important;
          }
        }
        @page {
          size: A4 portrait;
          margin: 10mm;
        }
      `}</style>

      {/* ── Pages ────────────────────────────────────────────────────────── */}
      <div className="pt-16 pb-8 px-4 space-y-8 bg-slate-100 min-h-screen" id="print-root">
        {pages.length === 0 && (
          <div className="flex items-center justify-center h-64">
            <p className="text-slate-500">No learners selected. Close this window and select learners first.</p>
          </div>
        )}

        {pages.map((pageCards, pi) => (
          <div
            key={pi}
            className="print-page bg-white shadow-lg rounded-xl overflow-hidden"
            style={{
              width: '210mm',
              minHeight: '297mm',
              margin: '0 auto',
              padding: '10mm',
              boxSizing: 'border-box',
            }}
          >
            {/* Page header (only on first page, hidden in print if desired) */}
            {pi === 0 && (
              <div className="no-print mb-4 flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs text-slate-400">Page {pi + 1} of {pages.length}</span>
                <span className="text-xs text-slate-400">{meta.schoolName} — Student ID Cards</span>
              </div>
            )}

            {/* 3 × 3 grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 85.6mm)',
                gridTemplateRows:    'repeat(3, 54mm)',
                gap: '5mm',
                justifyContent: 'center',
              }}
            >
              {pageCards.map(student => (
                <div
                  key={student.id}
                  style={{
                    width: '85.6mm',
                    height: '54mm',
                    pageBreakInside: 'avoid',
                    breakInside: 'avoid',
                  }}
                >
                  <IDCardPreview
                    student={student}
                    meta={meta}
                    config={config}
                    printMode
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
