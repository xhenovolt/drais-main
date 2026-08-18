'use client';

/**
 * DRAIS student import — redesigned experience (opt-in beta).
 *
 * Implements the flow from the import-redesign brief: upload -> DRAIS
 * explains what it found per sheet, with confidence -> user corrects
 * anything -> import plan -> confirm -> report. Lives alongside the
 * legacy ImportModal-driven /students/import (unchanged) — this is not a
 * replacement yet, per "retire the legacy importer once v2 is proven."
 *
 * State machine: upload -> analyzing -> review -> previewing -> preview
 * -> importing -> done.
 */
import { useState, useRef } from 'react';
import {
  Upload, FileSpreadsheet, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle,
  Info, Loader2, Settings2, ArrowRight, RotateCcw, ShieldAlert,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

type Step = 'upload' | 'analyzing' | 'review' | 'previewing' | 'preview' | 'importing' | 'done';

interface SheetInspection {
  sheetName: string;
  sheetIndex: number;
  rowCount: number;
  columnCount: number;
  header: { headerRowIndex: number; confidence: number; reason: string; skippedRows: number[] };
  headers: string[];
  sampleDataRows: unknown[][];
  purpose: { purpose: 'students' | 'fees' | 'results' | 'unknown'; confidence: number; reason: string };
  nameContext: { className: string | null; streamName: string | null; genderHint: string | null; datasetHint: string | null; termHint: string | null; confidence: number; reason: string };
  isEmpty: boolean;
}

interface WorkbookInspection {
  sheetCount: number;
  sheets: SheetInspection[];
  likelyNonDataSheets: string[];
}

interface ImportSettings {
  allowCreateNew: boolean;
  allowUpdateExisting: boolean;
  allowClassReassignment: boolean;
  autoCreateMissingClasses: boolean;
  allowSheetNameContext: boolean;
  requireManualConfirmationForFuzzyMatches: boolean;
  fieldConflictDefault: 'prefer-existing' | 'prefer-new' | 'prefer-non-empty';
}

interface FieldMapping { sourceHeader: string; canonicalField: string | null; confidence: number; reason: string; }
interface IngestionReport {
  runId: string;
  schemaInference: { mappings: FieldMapping[]; unresolvedRequired: string[]; overallConfidence: number };
  counts: { parsed: number; inserted: number; updated: number; merged: number; skipped: number; orphaned: number; failed: number };
  outcomes: Array<{ raw: Record<string, unknown>; decision: { action: string; reason?: string; error?: string }; provenance: { sourceSheet?: string; sourceRowIndex: number } }>;
}

const PURPOSE_LABEL: Record<string, string> = { students: 'Students', fees: 'Fees', results: 'Results', unknown: 'Unrecognized' };
const PURPOSE_COLOR: Record<string, string> = {
  students: 'bg-emerald-500/15 text-emerald-300 border-emerald-800',
  fees: 'bg-sky-500/15 text-sky-300 border-sky-800',
  results: 'bg-violet-500/15 text-violet-300 border-violet-800',
  unknown: 'bg-slate-500/15 text-slate-400 border-slate-700',
};

export default function StudentImportV2Page() {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<WorkbookInspection | null>(null);
  const [settings, setSettings] = useState<ImportSettings | null>(null);
  const [selectedSheets, setSelectedSheets] = useState<Set<string>>(new Set());
  const [expandedSheet, setExpandedSheet] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [previewReports, setPreviewReports] = useState<IngestionReport[] | null>(null);
  const [finalReports, setFinalReports] = useState<IngestionReport[] | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(f: File) {
    if (!f.name.toLowerCase().endsWith('.xlsx') && !f.name.toLowerCase().endsWith('.xls')) {
      toast.error('This experience is for XLSX workbooks — the sheet intelligence only applies to multi-sheet Excel files.');
      return;
    }
    setFile(f);
    setStep('analyzing');
    try {
      const form = new FormData();
      form.append('file', f);
      const res = await fetch('/api/students/import/v2/analyze', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Analysis failed');

      const insp: WorkbookInspection = data.inspection;
      setInspection(insp);
      setSettings(data.settings);
      // Default selection: sheets DRAIS is confident are students data,
      // not flagged as likely non-data. Never auto-select fees/results/
      // unknown sheets — those need a human to decide.
      const defaults = new Set(
        insp.sheets
          .filter((s) => s.purpose.purpose === 'students' && !insp.likelyNonDataSheets.includes(s.sheetName) && !s.isEmpty)
          .map((s) => s.sheetName),
      );
      setSelectedSheets(defaults);
      setStep('review');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Analysis failed');
      setStep('upload');
    }
  }

  function toggleSheet(name: string) {
    setSelectedSheets((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  async function runImport(dryRun: boolean) {
    if (!file || !inspection) return;
    const sheets = inspection.sheets
      .filter((s) => selectedSheets.has(s.sheetName))
      .map((s) => ({ sheetName: s.sheetName, headerRowIndex: s.header.headerRowIndex }));
    if (sheets.length === 0) {
      toast.error('Select at least one sheet to import.');
      return;
    }

    setBusy(true);
    setStep(dryRun ? 'previewing' : 'importing');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('sheets', JSON.stringify(sheets));
      form.append('dryRun', String(dryRun));
      const res = await fetch('/api/students/import/v2', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Import failed');

      if (dryRun) {
        setPreviewReports(data.reports);
        setStep('preview');
      } else {
        setFinalReports(data.reports);
        setStep('done');
        if (Array.isArray(data.warnings) && data.warnings.length > 0) {
          data.warnings.forEach((w: string) => toast.error(w, { duration: 8000 }));
        }
        toast.success('Import complete.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
      setStep(dryRun ? 'review' : 'preview');
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(patch: Partial<ImportSettings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next); // optimistic
    try {
      const res = await fetch('/api/students/import/v2/settings', {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not save settings');
      setSettings(data.settings);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save settings');
    }
  }

  function reset() {
    setStep('upload'); setFile(null); setInspection(null); setSelectedSheets(new Set());
    setPreviewReports(null); setFinalReports(null); setExpandedSheet(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Import Students — new experience</h1>
          <p className="text-xs text-slate-500 mt-1">
            Bring your school&apos;s workbook as it already is. DRAIS inspects every sheet and explains what it found before anything is written. Opt-in beta — the existing importer is unchanged.
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
          <p className="text-sm text-slate-300">Drop your workbook here, or click to browse</p>
          <p className="text-xs text-slate-600 mt-1">.xlsx — one sheet, one sheet per class, or however your school already keeps it</p>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
        </div>
      )}

      {step === 'analyzing' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-12 text-center">
          <Loader2 className="w-6 h-6 text-indigo-400 mx-auto mb-3 animate-spin" />
          <p className="text-sm text-slate-300">Inspecting {file?.name}…</p>
          <p className="text-xs text-slate-600 mt-1">Reading every sheet, detecting headers, guessing what each one means</p>
        </div>
      )}

      {inspection && (step === 'review' || step === 'previewing') && (
        <>
          <SettingsPanel settings={settings} show={showSettings} onToggle={() => setShowSettings((s) => !s)} onSave={saveSettings} />

          <div className="rounded-xl border border-slate-800 bg-slate-900">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5" /> {file?.name} — {inspection.sheetCount} sheet{inspection.sheetCount !== 1 ? 's' : ''} found
              </p>
              <p className="text-xs text-slate-500">{selectedSheets.size} selected</p>
            </div>
            <div className="divide-y divide-slate-800">
              {inspection.sheets.map((sheet) => (
                <SheetRow
                  key={sheet.sheetName}
                  sheet={sheet}
                  isLikelyNonData={inspection.likelyNonDataSheets.includes(sheet.sheetName)}
                  selected={selectedSheets.has(sheet.sheetName)}
                  expanded={expandedSheet === sheet.sheetName}
                  onToggleSelect={() => toggleSheet(sheet.sheetName)}
                  onToggleExpand={() => setExpandedSheet(expandedSheet === sheet.sheetName ? null : sheet.sheetName)}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              disabled={busy || selectedSheets.size === 0}
              onClick={() => runImport(true)}
              className="text-sm px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 flex items-center gap-2"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />} Preview import plan
            </button>
          </div>
        </>
      )}

      {step === 'preview' && previewReports && (
        <PreviewPlan reports={previewReports} onBack={() => setStep('review')} onConfirm={() => runImport(false)} busy={busy} />
      )}

      {step === 'importing' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-12 text-center">
          <Loader2 className="w-6 h-6 text-indigo-400 mx-auto mb-3 animate-spin" />
          <p className="text-sm text-slate-300">Importing…</p>
        </div>
      )}

      {step === 'done' && finalReports && <FinalReport reports={finalReports} onReset={reset} />}
    </div>
  );
}

function SettingsPanel({ settings, show, onToggle, onSave }: { settings: ImportSettings | null; show: boolean; onToggle: () => void; onSave: (p: Partial<ImportSettings>) => void }) {
  if (!settings) return null;
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900">
      <button onClick={onToggle} className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wide">
        <span className="flex items-center gap-1.5"><Settings2 className="w-3.5 h-3.5" /> Import settings for this school</span>
        {show ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {show && (
        <div className="px-4 pb-4 space-y-2 text-xs">
          <Toggle label="Update existing students when matched" hint="Off by default — a matched row is left untouched instead of overwritten." value={settings.allowUpdateExisting} onChange={(v) => onSave({ allowUpdateExisting: v })} danger />
          <Toggle label="Allow class reassignment on update" hint="Off by default — even with updates on, a student's class won't change unless this is on too." value={settings.allowClassReassignment} onChange={(v) => onSave({ allowClassReassignment: v })} danger disabled={!settings.allowUpdateExisting} />
          <Toggle label="Auto-create classes/streams that don't exist yet" hint="Off by default — unrecognized classes are held for review instead." value={settings.autoCreateMissingClasses} onChange={(v) => onSave({ autoCreateMissingClasses: v })} danger />
          <Toggle label="Use sheet names to infer class/stream" hint="&ldquo;S.2 Blue&rdquo; → Senior 2 / Blue, only when the row's own class column is empty." value={settings.allowSheetNameContext} onChange={(v) => onSave({ allowSheetNameContext: v })} />
        </div>
      )}
    </div>
  );
}

function Toggle({ label, hint, value, onChange, danger, disabled }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void; danger?: boolean; disabled?: boolean }) {
  return (
    <label className={`flex items-start gap-3 py-1.5 ${disabled ? 'opacity-40' : ''}`}>
      <input type="checkbox" checked={value} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 accent-indigo-500" />
      <span>
        <span className="text-slate-300 flex items-center gap-1.5">{label} {danger && <ShieldAlert className="w-3 h-3 text-amber-500" />}</span>
        <span className="block text-slate-600 mt-0.5">{hint}</span>
      </span>
    </label>
  );
}

function SheetRow({ sheet, isLikelyNonData, selected, expanded, onToggleSelect, onToggleExpand }: {
  sheet: SheetInspection; isLikelyNonData: boolean; selected: boolean; expanded: boolean; onToggleSelect: () => void; onToggleExpand: () => void;
}) {
  const ctx = sheet.nameContext;
  const ctxParts = [ctx.className, ctx.streamName].filter(Boolean).join(' · ');
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <input type="checkbox" checked={selected} onChange={onToggleSelect} disabled={sheet.isEmpty} className="accent-indigo-500" />
        <div className="min-w-0 flex-1 cursor-pointer" onClick={onToggleExpand}>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-200 truncate">{sheet.sheetName}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${PURPOSE_COLOR[sheet.purpose.purpose]}`}>
              {PURPOSE_LABEL[sheet.purpose.purpose]} {sheet.purpose.confidence > 0 ? `${Math.round(sheet.purpose.confidence * 100)}%` : ''}
            </span>
            {isLikelyNonData && <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-800 bg-amber-500/10 text-amber-300">looks non-data</span>}
            {sheet.isEmpty && <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-700 text-slate-500">empty</span>}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {sheet.rowCount} row(s), header detected at row {sheet.header.headerRowIndex + 1} ({Math.round(sheet.header.confidence * 100)}% confidence)
            {ctxParts && <> · sheet name suggests <span className="text-slate-300">{ctxParts}</span> ({Math.round(ctx.confidence * 100)}%)</>}
          </p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" onClick={onToggleExpand} />}
      </div>
      {expanded && (
        <div className="mt-3 pl-7 space-y-2">
          <p className="text-xs text-slate-500">Detected columns: <span className="text-slate-300">{sheet.headers.join(', ') || '(none)'}</span></p>
          {sheet.header.skippedRows.length > 0 && (
            <p className="text-xs text-slate-600">Skipped {sheet.header.skippedRows.length} row(s) above the header (title/blank rows).</p>
          )}
          {sheet.sampleDataRows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="text-xs w-full">
                <thead><tr className="bg-slate-950">{sheet.headers.map((h, i) => <th key={i} className="px-2 py-1 text-left text-slate-500 font-medium">{h}</th>)}</tr></thead>
                <tbody>
                  {sheet.sampleDataRows.slice(0, 3).map((row, ri) => (
                    <tr key={ri} className="border-t border-slate-800">
                      {(row as unknown[]).map((c, ci) => <td key={ci} className="px-2 py-1 text-slate-400">{c === null || c === undefined ? '' : String(c)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PreviewPlan({ reports, onBack, onConfirm, busy }: { reports: IngestionReport[]; onBack: () => void; onConfirm: () => void; busy: boolean }) {
  const totals = reports.reduce((acc, r) => ({
    parsed: acc.parsed + r.counts.parsed, inserted: acc.inserted + r.counts.inserted, updated: acc.updated + r.counts.updated,
    skipped: acc.skipped + r.counts.skipped, orphaned: acc.orphaned + r.counts.orphaned, failed: acc.failed + r.counts.failed,
  }), { parsed: 0, inserted: 0, updated: 0, skipped: 0, orphaned: 0, failed: 0 });

  const allUnresolved = reports.flatMap((r) => r.schemaInference.unresolvedRequired);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5"><Info className="w-3.5 h-3.5" /> Import plan — nothing has been written yet</p>
        <div className="grid grid-cols-6 gap-2">
          <Stat label="Rows read" value={totals.parsed} />
          <Stat label="New" value={totals.inserted} cls="text-emerald-400" />
          <Stat label="Existing" value={totals.updated} cls="text-sky-400" />
          <Stat label="Skipped" value={totals.skipped} cls="text-slate-400" />
          <Stat label="Needs review" value={totals.orphaned} cls="text-amber-400" />
          <Stat label="Failed" value={totals.failed} cls="text-rose-400" />
        </div>
        {allUnresolved.length > 0 && (
          <div className="mt-3 rounded-lg border border-rose-800 bg-rose-500/10 p-3 text-xs text-rose-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Required field(s) could not be mapped: {[...new Set(allUnresolved)].join(', ')}. Add a column for these, or rename an existing column to match, then re-upload.</span>
          </div>
        )}
      </div>

      {reports.map((r, i) => (
        <div key={r.runId} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Sheet {i + 1} — column mapping DRAIS used</p>
          <div className="space-y-1">
            {r.schemaInference.mappings.filter((m) => m.canonicalField).map((m, mi) => (
              <p key={mi} className="text-xs flex items-center gap-2">
                <span className="text-slate-400 w-40 truncate">{m.sourceHeader}</span>
                <ArrowRight className="w-3 h-3 text-slate-600" />
                <span className="text-slate-200">{m.canonicalField}</span>
                <span className="text-slate-600">({Math.round(m.confidence * 100)}%, {m.reason})</span>
              </p>
            ))}
          </div>
        </div>
      ))}

      <div className="flex justify-between">
        <button onClick={onBack} className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300">Back</button>
        <button
          disabled={busy || totals.parsed === 0}
          onClick={onConfirm}
          className="text-sm px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-50 flex items-center gap-2"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Confirm and import
        </button>
      </div>
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

function FinalReport({ reports, onReset }: { reports: IngestionReport[]; onReset: () => void }) {
  const totals = reports.reduce((acc, r) => ({
    inserted: acc.inserted + r.counts.inserted, updated: acc.updated + r.counts.updated,
    orphaned: acc.orphaned + r.counts.orphaned, failed: acc.failed + r.counts.failed,
  }), { inserted: 0, updated: 0, orphaned: 0, failed: 0 });

  return (
    <div className="rounded-xl border border-emerald-800 bg-emerald-500/10 p-6 text-center space-y-3">
      <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
      <p className="text-sm text-emerald-200">Import complete — {totals.inserted} new student(s), {totals.updated} updated, {totals.orphaned} held for review, {totals.failed} failed.</p>
      <button onClick={onReset} className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300">Import another file</button>
    </div>
  );
}
