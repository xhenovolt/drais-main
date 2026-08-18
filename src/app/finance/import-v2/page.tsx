'use client';

/**
 * DRAIS fee import — consolidated experience (opt-in beta, import
 * redesign Phase C). Same upload -> analyze -> plan -> confirm flow as
 * /students/import-v2, adapted for payment rows. Added alongside the
 * three existing legacy fee-import pages (/finance/import,
 * /finance/import-fees, plus the bulk-balances API) — none of them are
 * changed or retired by this page.
 */
import { useState, useRef } from 'react';
import {
  Upload, FileSpreadsheet, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle,
  Info, Loader2, ArrowRight, RotateCcw,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

type Step = 'upload' | 'analyzing' | 'review' | 'preview' | 'importing' | 'done';

interface SheetInspection {
  sheetName: string; rowCount: number;
  header: { headerRowIndex: number; confidence: number };
  headers: string[]; sampleDataRows: unknown[][];
  purpose: { purpose: 'students' | 'fees' | 'results' | 'unknown'; confidence: number };
  isEmpty: boolean;
}
interface WorkbookInspection { sheetCount: number; sheets: SheetInspection[]; likelyNonDataSheets: string[]; }
interface FieldMapping { sourceHeader: string; canonicalField: string | null; confidence: number; reason: string; }
interface IngestionReport {
  runId: string;
  schemaInference: { mappings: FieldMapping[]; unresolvedRequired: string[] };
  counts: { parsed: number; inserted: number; updated: number; skipped: number; orphaned: number; failed: number };
}

const PURPOSE_COLOR: Record<string, string> = {
  students: 'bg-emerald-500/15 text-emerald-300 border-emerald-800',
  fees: 'bg-sky-500/15 text-sky-300 border-sky-800',
  results: 'bg-violet-500/15 text-violet-300 border-violet-800',
  unknown: 'bg-slate-500/15 text-slate-400 border-slate-700',
};

export default function FeesImportV2Page() {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<WorkbookInspection | null>(null);
  const [selectedSheets, setSelectedSheets] = useState<Set<string>>(new Set());
  const [previewReports, setPreviewReports] = useState<IngestionReport[] | null>(null);
  const [finalReports, setFinalReports] = useState<IngestionReport[] | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(f: File) {
    if (!f.name.toLowerCase().endsWith('.xlsx') && !f.name.toLowerCase().endsWith('.xls')) {
      toast.error('This experience is for XLSX workbooks.');
      return;
    }
    setFile(f);
    setStep('analyzing');
    try {
      const form = new FormData();
      form.append('file', f);
      const res = await fetch('/api/finance/import/v2/analyze', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Analysis failed');

      const insp: WorkbookInspection = data.inspection;
      setInspection(insp);
      setSelectedSheets(new Set(
        insp.sheets.filter((s) => s.purpose.purpose === 'fees' && !insp.likelyNonDataSheets.includes(s.sheetName) && !s.isEmpty).map((s) => s.sheetName),
      ));
      setStep('review');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Analysis failed');
      setStep('upload');
    }
  }

  function toggleSheet(name: string) {
    setSelectedSheets((prev) => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next; });
  }

  async function runImport(dryRun: boolean) {
    if (!file || !inspection) return;
    const sheets = inspection.sheets.filter((s) => selectedSheets.has(s.sheetName)).map((s) => ({ sheetName: s.sheetName, headerRowIndex: s.header.headerRowIndex }));
    if (sheets.length === 0) { toast.error('Select at least one sheet.'); return; }

    setBusy(true);
    setStep(dryRun ? 'preview' : 'importing');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('sheets', JSON.stringify(sheets));
      form.append('dryRun', String(dryRun));
      const res = await fetch('/api/finance/import/v2', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Import failed');

      if (dryRun) {
        setPreviewReports(data.reports);
      } else {
        setFinalReports(data.reports);
        setStep('done');
        if (Array.isArray(data.warnings)) data.warnings.forEach((w: string) => toast.error(w, { duration: 8000 }));
        toast.success('Import complete.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
      setStep(dryRun ? 'review' : 'preview');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep('upload'); setFile(null); setInspection(null); setSelectedSheets(new Set());
    setPreviewReports(null); setFinalReports(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const totals = (previewReports ?? []).reduce((acc, r) => ({
    parsed: acc.parsed + r.counts.parsed, updated: acc.updated + r.counts.updated,
    orphaned: acc.orphaned + r.counts.orphaned, failed: acc.failed + r.counts.failed,
  }), { parsed: 0, updated: 0, orphaned: 0, failed: 0 });
  const allUnresolved = (previewReports ?? []).flatMap((r) => r.schemaInference.unresolvedRequired);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Import Fees — consolidated experience</h1>
          <p className="text-xs text-slate-500 mt-1">
            One matching key (admission number, exact only — never a guess), one write path, one audit trail. Opt-in beta — existing fee-import pages are unchanged.
          </p>
        </div>
        {step !== 'upload' && (
          <button onClick={reset} className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" /> Start over
          </button>
        )}
      </header>

      {step === 'upload' && (
        <div
          className="rounded-xl border-2 border-dashed border-slate-700 bg-slate-900 p-12 text-center cursor-pointer hover:border-indigo-600 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleUpload(f); }}
        >
          <Upload className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-300">Drop your fee history workbook here, or click to browse</p>
          <p className="text-xs text-slate-600 mt-1">.xlsx — admission number + amount, however your school already records it</p>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
        </div>
      )}

      {step === 'analyzing' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-12 text-center">
          <Loader2 className="w-6 h-6 text-indigo-400 mx-auto mb-3 animate-spin" />
          <p className="text-sm text-slate-300">Inspecting {file?.name}…</p>
        </div>
      )}

      {inspection && step === 'review' && (
        <>
          <div className="rounded-xl border border-slate-800 bg-slate-900">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5" /> {file?.name} — {inspection.sheetCount} sheet{inspection.sheetCount !== 1 ? 's' : ''} found
              </p>
              <p className="text-xs text-slate-500">{selectedSheets.size} selected</p>
            </div>
            <div className="divide-y divide-slate-800">
              {inspection.sheets.map((sheet) => (
                <div key={sheet.sheetName} className="px-4 py-3 flex items-center gap-3">
                  <input type="checkbox" checked={selectedSheets.has(sheet.sheetName)} disabled={sheet.isEmpty} onChange={() => toggleSheet(sheet.sheetName)} className="accent-indigo-500" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-200 truncate">{sheet.sheetName}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${PURPOSE_COLOR[sheet.purpose.purpose]}`}>
                        {sheet.purpose.purpose} {sheet.purpose.confidence > 0 ? `${Math.round(sheet.purpose.confidence * 100)}%` : ''}
                      </span>
                      {sheet.isEmpty && <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-700 text-slate-500">empty</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{sheet.rowCount} row(s), header at row {sheet.header.headerRowIndex + 1} — columns: {sheet.headers.join(', ') || '(none)'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <button disabled={busy || selectedSheets.size === 0} onClick={() => runImport(true)} className="text-sm px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 flex items-center gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />} Preview import plan
            </button>
          </div>
        </>
      )}

      {step === 'preview' && previewReports && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5"><Info className="w-3.5 h-3.5" /> Import plan — nothing has been posted yet</p>
            <div className="grid grid-cols-4 gap-2">
              <Stat label="Rows read" value={totals.parsed} />
              <Stat label="To record" value={totals.updated} cls="text-emerald-400" />
              <Stat label="Needs review" value={totals.orphaned} cls="text-amber-400" />
              <Stat label="Failed" value={totals.failed} cls="text-rose-400" />
            </div>
            {totals.orphaned > 0 && (
              <p className="mt-3 text-xs text-amber-300 flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {totals.orphaned} row(s) have an admission number that doesn&apos;t match any student — held for manual review, no money will be misattributed by a guess.</p>
            )}
            {allUnresolved.length > 0 && (
              <p className="mt-2 text-xs text-rose-300">Required field(s) could not be mapped: {[...new Set(allUnresolved)].join(', ')}.</p>
            )}
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep('review')} className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300">Back</button>
            <button disabled={busy || totals.parsed === 0} onClick={() => runImport(false)} className="text-sm px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-50 flex items-center gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Confirm and record payments
            </button>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-12 text-center">
          <Loader2 className="w-6 h-6 text-indigo-400 mx-auto mb-3 animate-spin" />
          <p className="text-sm text-slate-300">Recording payments…</p>
        </div>
      )}

      {step === 'done' && finalReports && (
        <div className="rounded-xl border border-emerald-800 bg-emerald-500/10 p-6 text-center space-y-3">
          <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
          <p className="text-sm text-emerald-200">
            Import complete — {finalReports.reduce((n, r) => n + r.counts.updated, 0)} payment(s) recorded, {finalReports.reduce((n, r) => n + r.counts.orphaned, 0)} held for review.
          </p>
          <button onClick={reset} className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300">Import another file</button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: number; cls?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-center">
      <div className={`text-base font-bold tabular-nums ${cls ?? 'text-slate-200'}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-wide text-slate-600">{label}</div>
    </div>
  );
}
