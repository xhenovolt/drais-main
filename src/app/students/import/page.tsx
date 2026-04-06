'use client';

import { useState, useRef } from 'react';
import {
  Upload, FileText, Eye, Play, RotateCcw, AlertTriangle,
  CheckCircle2, XCircle, Users, RefreshCw, ChevronDown,
  Download, ArrowRight, Columns, Plus, Loader,
  FileDown, ChevronUp, AlertCircle, Info, Shield, Ban,
  Settings2, Zap,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import Swal from 'sweetalert2';

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface PreviewData {
  total: number;
  preview: Record<string, string>[];
  warnings: string[];
  readyToImport: boolean;
  fileHeaders?: string[];
  columnMapping?: Record<string, string | null>;
  columnTypes?: Record<string, string>;
}

interface ValidationError {
  row: number;
  field: string;
  value: string;
  message: string;
}

interface RowMatchResult {
  rowNum: number;
  name: string;
  regNo: string;
  class: string;
  matchResult: 'EXACT_MATCH' | 'PARTIAL_MATCH' | 'NO_MATCH' | 'AMBIGUOUS' | 'INVALID';
  existingAdmNo?: string;
  issues: string[];
}

interface ValidationResult {
  total: number;
  valid: number;
  duplicateInSystem: number;
  // New match engine fields
  exactMatches: number;
  partialMatches: number;
  noMatches: number;
  ambiguous: number;
  invalid: number;
  errors: ValidationError[];
  rowFlags: ('valid' | 'warning' | 'error')[];
  matchResults?: RowMatchResult[];
  missingClasses: string[];
  missingStreams: { class: string; stream: string }[];
  canProceed: boolean;
}

interface ImportOptions {
  updateExisting: boolean;
  createNew: boolean;
  feesOnly: boolean;
  enrollNew: boolean;
}

interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  total: number;
  message: string;
  errors: string[];
  failedRows: number[];
  session_id?: number | null;
}

type Status = 'idle' | 'analyzing' | 'preview' | 'options' | 'validating' | 'validated' | 'importing' | 'cancelled' | 'complete' | 'error';

const SYSTEM_FIELDS = [
  { key: 'name',          label: 'Full Name',        required: true,  primary: true },
  { key: 'first_name',    label: 'First Name',       required: false, primary: false },
  { key: 'last_name',     label: 'Last Name',        required: false, primary: false },
  { key: 'reg_no',        label: 'Reg No / Adm No',  required: false, primary: false },
  { key: 'class',         label: 'Class',             required: true,  primary: false },
  { key: 'section',       label: 'Section / Stream',  required: false, primary: false },
  { key: 'fees_balance',  label: 'Fees Balance',      required: false, primary: false },
  { key: 'gender',        label: 'Gender',            required: false, primary: false },
  { key: 'date_of_birth', label: 'Date of Birth',     required: false, primary: false },
  { key: 'phone',         label: 'Phone',             required: false, primary: false },
  { key: 'address',       label: 'Address',           required: false, primary: false },
  { key: 'photo_url',     label: 'Photo URL',         required: false, primary: false },
  { key: 'biometric_id',  label: 'Biometric ID',      required: false, primary: false },
];

const TEMPLATE_CSV = `name,reg_no,class,section,fees_balance,gender,date_of_birth,phone,address
Ali Hassan,ADM-001,Senior One,,5000,M,2010-05-14,0700000001,Kampala
Fatuma Nuru,ADM-002,Senior Two,Stream A,12500,F,2009-08-22,0700000002,Entebbe
Ibrahim Sali,,Senior One,,0,M,2011-01-30,0700000003,,`;

const TYPE_BADGES: Record<string, { label: string; color: string }> = {
  text:     { label: 'Text',     color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  number:   { label: 'Number',   color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  date:     { label: 'Date',     color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  enum:     { label: 'Enum',     color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  unmapped: { label: 'Unmapped', color: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
};

export default function BulkImportPage() {
  const [status, setStatus]               = useState<Status>('idle');
  const [file, setFile]                   = useState<File | null>(null);
  const [isDragging, setIsDragging]       = useState(false);
  const [previewData, setPreviewData]     = useState<PreviewData | null>(null);
  const [validation, setValidation]       = useState<ValidationResult | null>(null);
  const [progress, setProgress]           = useState({ done: 0, updated: 0, skipped: 0, failed: 0, total: 0, current: '' });
  const [result, setResult]               = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg]           = useState('');
  const [showTemplate, setShowTemplate]   = useState(false);
  const [showMapper, setShowMapper]       = useState(false);
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [showMatchDetails, setShowMatchDetails] = useState(false);
  const [columnMapping, setColumnMapping] = useState<Record<string, string | null>>({});
  const [creatingClass, setCreatingClass] = useState<string | null>(null);
  const [creatingStream, setCreatingStream] = useState<{ class: string; stream: string } | null>(null);
  const [importOptions, setImportOptions] = useState<ImportOptions>({
    updateExisting: true,
    createNew: true,
    feesOnly: false,
    enrollNew: true,
  });
  const [sessionId, setSessionId]         = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Helpers ─────────────────────────────────────────────────────────────── */

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'drais_import_template.csv'; a.click();
    URL.revokeObjectURL(url);
    toast.success('Template downloaded');
  };

  const downloadErrors = (errors: string[]) => {
    if (!errors.length) return;
    const content = errors.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `import_errors_${new Date().toISOString().slice(0, 10)}.txt`; a.click();
    URL.revokeObjectURL(url);
    toast.success('Error log downloaded');
  };

  const exportFailedCSV = () => {
    if (!result?.failedRows.length) return;
    const csv = `Failed Row Numbers\n${result.failedRows.join(', ')}\n\nErrors:\n${result.errors.join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `import_failed_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success('Failed rows exported');
  };

  /* ── Cancel import ───────────────────────────────────────────────────────── */

  const handleCancelImport = async () => {
    const confirmed = await Swal.fire({
      title: 'Stop Import?',
      text: 'This will stop import at current progress. Rows already processed are saved.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, stop it',
      cancelButtonText: 'Keep going',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
    });
    if (!confirmed.isConfirmed) return;

    if (sessionId) {
      try {
        const fd = new FormData();
        fd.append('mode', 'cancel');
        fd.append('session_id', String(sessionId));
        await fetch('/api/students/import', { method: 'POST', body: fd });
      } catch {}
    }
    setStatus('cancelled');
    toast('Import stopped', { icon: '⛔' });
  };

  /* ── File handling ───────────────────────────────────────────────────────── */

  const acceptFile = (f: File | null) => {
    if (!f) return;
    if (!/\.(csv|xlsx|xls)$/i.test(f.name)) { toast.error('Only .csv and .xlsx files are accepted'); return; }
    setFile(f);
    setStatus('idle');
    setPreviewData(null);
    setValidation(null);
    setResult(null);
    setColumnMapping({});
    setSessionId(null);
  };

  const onFileInput  = (e: React.ChangeEvent<HTMLInputElement>) => acceptFile(e.target.files?.[0] ?? null);
  const onDragOver   = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave  = () => setIsDragging(false);
  const onDrop       = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); acceptFile(e.dataTransfer.files?.[0] ?? null); };

  /* ── Preview ─────────────────────────────────────────────────────────────── */

  const handlePreview = async () => {
    if (!file) return;
    setStatus('analyzing');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mode', 'preview');
      if (Object.values(columnMapping).some(v => v)) {
        fd.append('columnMapping', JSON.stringify(columnMapping));
      }
      const res = await fetch('/api/students/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Preview failed');
      setPreviewData(data);
      setColumnMapping(data.columnMapping || {});
      setStatus('preview');
    } catch (err) {
      setErrorMsg((err as Error).message);
      setStatus('error');
    }
  };

  /* ── Column mapping change ───────────────────────────────────────────────── */

  const updateMapping = (systemKey: string, fileHeader: string | null) => {
    setColumnMapping(prev => ({ ...prev, [systemKey]: fileHeader }));
  };

  const rePreview = async () => {
    setStatus('analyzing');
    await handlePreview();
  };

  /* ── Validate ────────────────────────────────────────────────────────────── */

  const handleValidate = async () => {
    if (!file) return;
    setStatus('validating');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mode', 'validate');
      if (Object.values(columnMapping).some(v => v)) {
        fd.append('columnMapping', JSON.stringify(columnMapping));
      }
      const res = await fetch('/api/students/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Validation failed');
      setValidation(data);
      setStatus('validated');
    } catch (err) {
      setErrorMsg((err as Error).message);
      setStatus('error');
    }
  };

  /* ── Quick-create class/stream ───────────────────────────────────────────── */

  const quickCreateClass = async (name: string) => {
    setCreatingClass(name);
    try {
      const fd = new FormData();
      fd.append('mode', 'create-class');
      fd.append('name', name);
      const res = await fetch('/api/students/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed');
      toast.success(data.existed ? `Class "${name}" already exists` : `Class "${name}" created`);
      await handleValidate();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreatingClass(null);
    }
  };

  const quickCreateStream = async (className: string, streamName: string) => {
    setCreatingStream({ class: className, stream: streamName });
    try {
      // Get class_id first
      const clsFd = new FormData();
      clsFd.append('mode', 'create-class');
      clsFd.append('name', className);
      const clsRes = await fetch('/api/students/import', { method: 'POST', body: clsFd });
      const clsData = await clsRes.json();
      if (!clsRes.ok || !clsData.success) throw new Error(clsData.error || 'Failed');

      const fd = new FormData();
      fd.append('mode', 'create-stream');
      fd.append('name', streamName);
      fd.append('class_id', String(clsData.id));
      const res = await fetch('/api/students/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed');
      toast.success(data.existed ? `Stream "${streamName}" already exists` : `Stream "${streamName}" created under "${className}"`);
      await handleValidate();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreatingStream(null);
    }
  };

  /* ── Import with SSE ─────────────────────────────────────────────────────── */

  const handleImport = async (retryRows?: number[]) => {
    if (!file) return;
    setStatus('importing');
    setSessionId(null);
    setProgress({ done: 0, updated: 0, skipped: 0, failed: 0, total: retryRows ? retryRows.length : (previewData?.total ?? 0), current: 'Starting...' });

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mode', 'import');
      // Pass import options
      fd.append('updateExisting', String(importOptions.updateExisting));
      fd.append('createNew',      String(importOptions.createNew));
      fd.append('feesOnly',       String(importOptions.feesOnly));
      fd.append('enrollNew',      String(importOptions.enrollNew));
      if (Object.values(columnMapping).some(v => v)) {
        fd.append('columnMapping', JSON.stringify(columnMapping));
      }
      if (retryRows) {
        fd.append('retryIndices', JSON.stringify(retryRows));
      }

      const res = await fetch('/api/students/import', { method: 'POST', body: fd });
      if (!res.ok || !res.body) throw new Error(`Server returned ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === 'session') {
              setSessionId(event.session_id ?? null);
            } else if (event.type === 'progress') {
              setProgress({
                done:    event.imported ?? 0,
                updated: event.updated  ?? 0,
                skipped: event.skipped  ?? 0,
                failed:  event.failed   ?? 0,
                total:   event.total,
                current: event.current_name ?? '',
              });
            } else if (event.type === 'complete') {
              setResult(event as ImportResult);
              setStatus('complete');
              if (event.failed > 0) {
                toast.error(`Import done: ${event.failed} failed`);
              } else {
                toast.success(`Import complete: ${event.imported} created, ${event.updated} updated`);
              }
            } else if (event.type === 'cancelled') {
              setStatus('cancelled');
              toast('Import stopped', { icon: '⛔' });
            } else if (event.type === 'error') {
              throw new Error(event.message);
            }
          } catch { /* malformed SSE line, skip */ }
        }
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
      setStatus('error');
      toast.error('Import failed: ' + (err as Error).message);
    }
  };

  /* ── Reset ───────────────────────────────────────────────────────────────── */

  const reset = () => {
    setStatus('idle');
    setFile(null);
    setPreviewData(null);
    setValidation(null);
    setResult(null);
    setErrorMsg('');
    setProgress({ done: 0, updated: 0, skipped: 0, failed: 0, total: 0, current: '' });
    setShowMapper(false);
    setShowAllErrors(false);
    setShowMatchDetails(false);
    setColumnMapping({});
    setSessionId(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /* ── Computed ────────────────────────────────────────────────────────────── */

  const totalProcessed = progress.done + progress.updated + progress.skipped + progress.failed;
  const pct            = progress.total > 0 ? Math.round((totalProcessed / progress.total) * 100) : 0;
  const mapping        = columnMapping;
  const fileHeaders    = previewData?.fileHeaders ?? [];
  const hasNameMapping = mapping.name || (mapping.first_name && mapping.last_name);

  const validationErrors = validation?.errors ?? [];
  const hardErrors = validationErrors.filter(e =>
    !e.message.includes('will UPDATE') && !e.message.includes('does not exist') &&
    !e.message.includes('is empty') && !e.message.includes('Negative') &&
    !e.message.includes('auto-created') && !e.message.includes('AMBIGUOUS') === false
  );
  const canImport = validation ? (validation.invalid < validation.total) : false;

  // Determine what will happen with current options
  const willCreate = importOptions.createNew  && !importOptions.feesOnly ? (validation?.noMatches ?? 0) : 0;
  const willUpdate = importOptions.updateExisting && !importOptions.feesOnly
    ? ((validation?.exactMatches ?? 0) + (validation?.partialMatches ?? 0))
    : (importOptions.feesOnly ? ((validation?.exactMatches ?? 0) + (validation?.partialMatches ?? 0)) : 0);

  /* ── Progress steps ──────────────────────────────────────────────────────── */

  const STEPS = [
    { key: 'upload',   label: 'Upload',   states: ['idle', 'analyzing'] },
    { key: 'preview',  label: 'Preview',  states: ['preview'] },
    { key: 'options',  label: 'Options',  states: ['options'] },
    { key: 'validate', label: 'Validate', states: ['validating', 'validated'] },
    { key: 'import',   label: 'Import',   states: ['importing', 'cancelled'] },
    { key: 'done',     label: 'Done',     states: ['complete'] },
  ];

  const activeIdx = STEPS.findIndex(s => s.states.includes(status));

  /* ── Render ─────────────────────────────────────────────────────────────── */

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-4xl mx-auto">

        {/* ── Header ── */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Users className="text-blue-600" size={26} />
              Smart Import Engine
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              CSV / Excel · Match engine · No duplicates · Reversible · Cancellable
            </p>
          </div>
          <button onClick={downloadTemplate}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-sm">
            <Download size={16} /> Download Template
          </button>
        </div>

        {/* ── Step breadcrumb ── */}
        <div className="mb-6 flex items-center gap-1.5 flex-wrap text-xs font-medium">
          {STEPS.map((step, i) => {
            const isActive = step.states.includes(status);
            const isPast   = activeIdx > i;
            return (
              <div key={step.key} className="flex items-center gap-1.5">
                <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full transition-all ${
                  isActive ? 'bg-blue-600 text-white'
                  : isPast  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  :            'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
                }`}>
                  {isPast && <CheckCircle2 size={11} />}
                  {step.label}
                </span>
                {i < STEPS.length - 1 && <ArrowRight size={11} className="text-gray-300 dark:text-gray-600" />}
              </div>
            );
          })}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">

          {/* ══ STEP 1: UPLOAD ══════════════════════════════════════════════ */}
          {(status === 'idle' || status === 'analyzing') && (
            <>
              <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
                }`}>
                <Upload className="mx-auto mb-3 text-gray-400" size={36} />
                <p className="font-semibold text-gray-700 dark:text-gray-200">Drop file here or click to browse</p>
                <p className="text-sm text-gray-400 mt-1">.csv or .xlsx — up to 10,000 rows</p>
                <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={onFileInput} className="hidden" />
              </div>

              {file && (
                <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg">
                  <FileText size={18} className="text-green-600" />
                  <span className="text-sm font-medium text-green-800 dark:text-green-300 flex-1 truncate">{file.name}</span>
                  <button onClick={reset} className="text-gray-400 hover:text-red-500 transition-colors"><XCircle size={18} /></button>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={handlePreview} disabled={!file || status === 'analyzing'}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
                  {status === 'analyzing'
                    ? <><RefreshCw size={16} className="animate-spin" /> Analyzing...</>
                    : <><Eye size={16} /> Analyze File</>}
                </button>
                <button onClick={() => setShowTemplate(s => !s)}
                  className="px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                  Template <ChevronDown size={14} className={`inline ${showTemplate ? 'rotate-180' : ''} transition-transform`} />
                </button>
              </div>

              {showTemplate && (
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">CSV Column Headers</p>
                    <button onClick={downloadTemplate} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                      <Download size={12} /> Download .csv
                    </button>
                  </div>
                  <pre className="text-xs bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-600 overflow-x-auto text-gray-700 dark:text-gray-300">{TEMPLATE_CSV}</pre>
                </div>
              )}
            </>
          )}

          {/* ══ STEP 2: PREVIEW ═════════════════════════════════════════════ */}
          {status === 'preview' && previewData && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                <CheckCircle2 size={18} className="text-blue-600 flex-shrink-0" />
                <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                  {previewData.total.toLocaleString()} row{previewData.total !== 1 ? 's' : ''} detected
                </p>
              </div>

              {/* Column mapper */}
              {fileHeaders.length > 0 && (
                <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                  <button onClick={() => setShowMapper(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                    <span className="flex items-center gap-2">
                      <Columns size={16} className="text-blue-500" />
                      Column Mapping
                      {!hasNameMapping && (
                        <span className="text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded-full">Name unmapped</span>
                      )}
                    </span>
                    <ChevronDown size={14} className={showMapper ? 'rotate-180 transition-transform' : 'transition-transform'} />
                  </button>
                  {showMapper && (
                    <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 font-mono">{fileHeaders.join(', ')}</p>
                      {SYSTEM_FIELDS.map(field => {
                        const mapped = mapping[field.key] ?? null;
                        return (
                          <div key={field.key} className={`flex items-center gap-3 py-2 px-3 rounded-lg ${field.primary ? 'bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30' : ''}`}>
                            <span className="w-40 text-xs font-medium truncate flex items-center gap-1 text-gray-700 dark:text-gray-300">
                              {field.primary && <Shield size={10} className="text-blue-500" />}
                              {field.label}
                              {field.required && <span className="text-red-500">*</span>}
                            </span>
                            <ArrowRight size={12} className="text-gray-400 flex-shrink-0" />
                            <select value={mapped ?? ''}
                              onChange={e => updateMapping(field.key, e.target.value || null)}
                              className="flex-1 px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                              <option value="">— not mapped —</option>
                              {fileHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                            </select>
                          </div>
                        );
                      })}
                      <button onClick={rePreview} className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
                        <RefreshCw size={12} /> Re-analyze with updated mapping
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Warnings */}
              {previewData.warnings.length > 0 && (
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg">
                  <p className="text-xs font-semibold text-yellow-800 dark:text-yellow-400 mb-1 flex items-center gap-1"><AlertTriangle size={14} /> Warnings</p>
                  <ul className="text-xs text-yellow-700 dark:text-yellow-300 space-y-0.5">
                    {previewData.warnings.map((w, i) => <li key={i}>• {w}</li>)}
                  </ul>
                </div>
              )}

              {/* Preview table */}
              {previewData.preview.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">First 10 rows:</p>
                  <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-600">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          {Object.keys(previewData.preview[0]).map(k => (
                            <th key={k} className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.preview.map((row, i) => (
                          <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                            {Object.entries(row).map(([k, v], j) => (
                              <td key={j} className={`px-3 py-2 ${k === 'name' ? 'font-medium text-gray-900 dark:text-white' : v === '—' ? 'text-gray-300 dark:text-gray-600 italic' : 'text-gray-700 dark:text-gray-300'}`}>
                                {String(v)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={reset} className="px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 transition-colors">← Back</button>
                <button onClick={() => setStatus('options')}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
                  <Settings2 size={16} /> Configure Options →
                </button>
              </div>
            </div>
          )}

          {/* ══ STEP 3: OPTIONS (DECISION PANEL) ════════════════════════════ */}
          {status === 'options' && previewData && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Settings2 size={18} className="text-blue-600" /> Import Options
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">Choose what happens to each learner row</p>
              </div>

              <div className="space-y-3">
                {/* Update existing */}
                <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  importOptions.updateExisting && !importOptions.feesOnly
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                }`}>
                  <input type="checkbox"
                    checked={importOptions.updateExisting && !importOptions.feesOnly}
                    onChange={e => setImportOptions(o => ({ ...o, updateExisting: e.target.checked }))}
                    disabled={importOptions.feesOnly}
                    className="mt-0.5 accent-blue-600"
                  />
                  <div>
                    <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm">Update existing students</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Matched students (by admission no or name+class) will have their details updated: name, class, section, contacts.
                    </p>
                  </div>
                </label>

                {/* Create new */}
                <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  importOptions.createNew && !importOptions.feesOnly
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                }`}>
                  <input type="checkbox"
                    checked={importOptions.createNew && !importOptions.feesOnly}
                    onChange={e => setImportOptions(o => ({ ...o, createNew: e.target.checked }))}
                    disabled={importOptions.feesOnly}
                    className="mt-0.5 accent-green-600"
                  />
                  <div>
                    <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm">Create new students</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Rows with no matching student will create a new admission record.
                    </p>
                  </div>
                </label>

                {/* Enroll new */}
                <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  importOptions.enrollNew && !importOptions.feesOnly
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                }`}>
                  <input type="checkbox"
                    checked={importOptions.enrollNew && !importOptions.feesOnly}
                    onChange={e => setImportOptions(o => ({ ...o, enrollNew: e.target.checked }))}
                    disabled={importOptions.feesOnly}
                    className="mt-0.5 accent-indigo-600"
                  />
                  <div>
                    <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm">Auto-enroll new students</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      New students will be enrolled in the class from the file. If enrollment fails, the student creation is rolled back.
                    </p>
                  </div>
                </label>

                {/* Fees only (exclusive toggle) */}
                <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  importOptions.feesOnly
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                }`}>
                  <input type="checkbox"
                    checked={importOptions.feesOnly}
                    onChange={e => setImportOptions(o => ({ ...o, feesOnly: e.target.checked }))}
                    className="mt-0.5 accent-amber-600"
                  />
                  <div>
                    <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm flex items-center gap-1.5">
                      <Zap size={14} className="text-amber-600" />
                      Fees-only update mode
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Only update <code className="bg-amber-100 dark:bg-amber-900/30 px-1 rounded">fees_balance</code> for matched students.
                      No student creation, no profile updates. Unmatched rows are safely skipped.
                    </p>
                    {importOptions.feesOnly && (
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mt-1">
                        ⚠ Create New and Update Existing are disabled in fees-only mode.
                      </p>
                    )}
                  </div>
                </label>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStatus('preview')} className="px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 transition-colors">← Back</button>
                <button onClick={handleValidate}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
                  <Shield size={16} /> Validate {previewData.total.toLocaleString()} Rows →
                </button>
              </div>
            </div>
          )}

          {/* ══ STEP 4: VALIDATING ══════════════════════════════════════════ */}
          {status === 'validating' && (
            <div className="py-12 text-center">
              <Loader size={32} className="animate-spin text-blue-600 mx-auto mb-3" />
              <p className="font-semibold text-gray-800 dark:text-white">Scanning all rows against the database...</p>
              <p className="text-sm text-gray-400 mt-1">Matching by admission no → name+class</p>
            </div>
          )}

          {/* ══ STEP 4b: VALIDATED — MATCH STATS + DECISION ════════════════ */}
          {status === 'validated' && validation && (
            <div className="space-y-5">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">Match Analysis — {validation.total.toLocaleString()} rows</h2>

              {/* 5-stat grid */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { label: 'Exact Match', value: validation.exactMatches,  sub: 'by admission no', color: 'text-blue-700',   bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700' },
                  { label: 'Name Match',  value: validation.partialMatches, sub: 'name + class',    color: 'text-indigo-700', bg: 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-700' },
                  { label: 'New',         value: validation.noMatches,      sub: 'will be created', color: 'text-green-700',  bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700' },
                  { label: 'Ambiguous',   value: validation.ambiguous,      sub: 'will skip',       color: 'text-orange-700', bg: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700' },
                  { label: 'Invalid',     value: validation.invalid,        sub: 'will skip',       color: 'text-red-700',    bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700' },
                ].map(({ label, value, sub, color, bg }) => (
                  <div key={label} className={`p-3 rounded-lg border ${bg} text-center`}>
                    <p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
                    <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</p>
                    <p className="text-[10px] text-gray-400">{sub}</p>
                  </div>
                ))}
              </div>

              {/* What will happen with current options */}
              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">With current options, the import will:</p>
                <ul className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                  {importOptions.feesOnly
                    ? <li className="flex items-center gap-1.5"><Zap size={12} className="text-amber-500" /> Update fees for {((validation.exactMatches + validation.partialMatches)).toLocaleString()} matched students only</li>
                    : <>
                        {importOptions.updateExisting && <li className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-blue-500" /> Update {(validation.exactMatches + validation.partialMatches).toLocaleString()} matched students</li>}
                        {importOptions.createNew && <li className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-green-500" /> Create {validation.noMatches.toLocaleString()} new students{importOptions.enrollNew ? ' + enroll them' : ''}</li>}
                      </>
                  }
                  {(validation.ambiguous > 0 || validation.invalid > 0) && (
                    <li className="flex items-center gap-1.5"><XCircle size={12} className="text-red-500" /> Skip {(validation.ambiguous + validation.invalid).toLocaleString()} rows (ambiguous or invalid)</li>
                  )}
                </ul>
              </div>

              {/* Missing classes */}
              {validation.missingClasses.length > 0 && (
                <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg">
                  <p className="text-xs font-semibold text-orange-800 dark:text-orange-400 mb-2 flex items-center gap-1">
                    <AlertCircle size={14} /> Missing Classes — create them to enable enrollment
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {validation.missingClasses.map(cls => (
                      <button key={cls} onClick={() => quickCreateClass(cls)} disabled={creatingClass === cls}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white dark:bg-gray-700 border border-orange-300 dark:border-orange-600 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors disabled:opacity-50">
                        {creatingClass === cls ? <Loader size={12} className="animate-spin" /> : <Plus size={12} />}
                        Create &ldquo;{cls}&rdquo;
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing streams */}
              {validation.missingStreams.length > 0 && (
                <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg">
                  <p className="text-xs font-semibold text-orange-800 dark:text-orange-400 mb-2 flex items-center gap-1">
                    <AlertCircle size={14} /> Missing Sections/Streams
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {validation.missingStreams.map(({ class: cls, stream }) => (
                      <button key={`${cls}:${stream}`}
                        onClick={() => quickCreateStream(cls, stream)}
                        disabled={creatingStream?.class === cls && creatingStream?.stream === stream}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white dark:bg-gray-700 border border-orange-300 dark:border-orange-600 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors disabled:opacity-50">
                        {(creatingStream?.class === cls && creatingStream?.stream === stream) ? <Loader size={12} className="animate-spin" /> : <Plus size={12} />}
                        &ldquo;{stream}&rdquo; under &ldquo;{cls}&rdquo;
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Errors / matches detail collapsible */}
              {validationErrors.length > 0 && (
                <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                  <button onClick={() => setShowAllErrors(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                    <span className="flex items-center gap-2">
                      <AlertTriangle size={16} className="text-amber-500" />
                      {validationErrors.length} issue{validationErrors.length !== 1 ? 's' : ''} detected
                    </span>
                    {showAllErrors ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {showAllErrors && (
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left text-gray-500 font-medium">Row</th>
                            <th className="px-3 py-2 text-left text-gray-500 font-medium">Field</th>
                            <th className="px-3 py-2 text-left text-gray-500 font-medium">Issue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {validationErrors.slice(0, 100).map((e, i) => (
                            <tr key={i} className={`border-t ${
                              e.message.includes('AMBIGUOUS') ? 'bg-orange-50/50 dark:bg-orange-900/10' :
                              e.message.includes('auto-created') || e.message.includes('Negative') ? 'bg-yellow-50/50 dark:bg-yellow-900/10' :
                              'bg-red-50/50 dark:bg-red-900/10'
                            }`}>
                              <td className="px-3 py-2 font-mono">{e.row}</td>
                              <td className="px-3 py-2 font-medium">{e.field}</td>
                              <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{e.message}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Match detail rows */}
              {(validation.matchResults?.length ?? 0) > 0 && (
                <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                  <button onClick={() => setShowMatchDetails(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                    <span className="flex items-center gap-2"><Info size={16} className="text-blue-500" /> Per-row match detail</span>
                    {showMatchDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {showMatchDetails && (
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left text-gray-500 font-medium">Row</th>
                            <th className="px-3 py-2 text-left text-gray-500 font-medium">Name</th>
                            <th className="px-3 py-2 text-left text-gray-500 font-medium">Match</th>
                            <th className="px-3 py-2 text-left text-gray-500 font-medium">Existing Adm</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(validation.matchResults ?? []).slice(0, 200).map((r, i) => (
                            <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                              <td className="px-3 py-1.5 font-mono text-gray-500">{r.rowNum}</td>
                              <td className="px-3 py-1.5 font-medium text-gray-800 dark:text-gray-200">{r.name}</td>
                              <td className="px-3 py-1.5">
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  r.matchResult === 'EXACT_MATCH'   ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                  r.matchResult === 'PARTIAL_MATCH' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' :
                                  r.matchResult === 'NO_MATCH'      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                  r.matchResult === 'AMBIGUOUS'     ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                                  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                }`}>{r.matchResult}</span>
                              </td>
                              <td className="px-3 py-1.5 text-gray-500 font-mono text-[10px]">{r.existingAdmNo ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setStatus('options')} className="px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 transition-colors">← Options</button>
                <button onClick={handleValidate} className="px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 transition-colors flex items-center gap-1">
                  <RefreshCw size={14} /> Re-validate
                </button>
                <button onClick={() => handleImport()} disabled={!canImport}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
                  <Play size={16} />
                  {canImport
                    ? `Start Import — ${validation.total.toLocaleString()} rows`
                    : `All ${validation.total} rows are invalid`}
                </button>
              </div>
            </div>
          )}

          {/* ══ STEP 5: IMPORTING ═══════════════════════════════════════════ */}
          {status === 'importing' && (
            <div className="py-4 space-y-5">
              <div className="text-center">
                <RefreshCw size={32} className="animate-spin text-blue-600 mx-auto mb-3" />
                <p className="font-semibold text-gray-800 dark:text-white">
                  {totalProcessed.toLocaleString()} / {progress.total.toLocaleString()} rows processed
                </p>
                <p className="text-sm text-gray-400 mt-1 truncate max-w-xs mx-auto">{progress.current || 'Processing...'}</p>
                {sessionId && <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-1 font-mono">session #{sessionId}</p>}
              </div>

              {/* Progress bar */}
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                <div className="bg-blue-600 h-3 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-center text-sm font-bold text-blue-600">{pct}%</p>

              {/* Live counters */}
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: 'Created',  value: progress.done,    color: 'text-green-700',  bg: 'bg-green-50 dark:bg-green-900/20' },
                  { label: 'Updated',  value: progress.updated, color: 'text-blue-700',   bg: 'bg-blue-50 dark:bg-blue-900/20' },
                  { label: 'Skipped',  value: progress.skipped, color: 'text-gray-500',   bg: 'bg-gray-50 dark:bg-gray-700' },
                  { label: 'Failed',   value: progress.failed,  color: 'text-red-700',    bg: 'bg-red-50 dark:bg-red-900/20' },
                ].map(({ label, value, color, bg }) => (
                  <div key={label} className={`p-2 ${bg} rounded-lg`}>
                    <p className="text-[10px] text-gray-500">{label}</p>
                    <p className={`text-lg font-bold ${color}`}>{value.toLocaleString()}</p>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <button onClick={handleCancelImport}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-400 rounded-lg font-medium hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
                  <Ban size={16} /> Cancel Import
                </button>
              </div>
              <p className="text-xs text-center text-gray-400">Processing in chunks of 50 — rows already saved will not be rolled back on cancel</p>
            </div>
          )}

          {/* ══ STEP 5b: CANCELLED ══════════════════════════════════════════ */}
          {status === 'cancelled' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-xl">
                <Ban size={20} className="text-orange-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-orange-800 dark:text-orange-300">Import Cancelled</p>
                  <p className="text-sm text-orange-700 dark:text-orange-400 mt-0.5">
                    Stopped at row {totalProcessed.toLocaleString()} of {progress.total.toLocaleString()}.
                    Rows already committed to DB are saved ({progress.done + progress.updated} records).
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[['Created', progress.done, 'text-green-700'], ['Updated', progress.updated, 'text-blue-700'], ['Skipped', progress.skipped, 'text-gray-500'], ['Failed', progress.failed, 'text-red-700']].map(([label, value, color]) => (
                  <div key={String(label)} className="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <p className="text-[10px] text-gray-500">{label}</p>
                    <p className={`text-lg font-bold ${color}`}>{Number(value).toLocaleString()}</p>
                  </div>
                ))}
              </div>
              <button onClick={reset}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
                <RotateCcw size={16} /> Start New Import
              </button>
            </div>
          )}

          {/* ══ STEP 6: COMPLETE ════════════════════════════════════════════ */}
          {status === 'complete' && result && (
            <div className="space-y-4">
              {/* Summary banner */}
              <div className={`flex items-center gap-3 p-4 rounded-xl border ${
                result.failed > 0
                  ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700'
                  : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
              }`}>
                {result.failed > 0
                  ? <AlertTriangle size={22} className="text-yellow-600 flex-shrink-0" />
                  : <CheckCircle2 size={22} className="text-green-600 flex-shrink-0" />}
                <div>
                  <p className={`font-semibold ${result.failed > 0 ? 'text-yellow-800 dark:text-yellow-300' : 'text-green-800 dark:text-green-300'}`}>
                    Import Complete
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{result.message}</p>
                </div>
              </div>

              {/* 4-stat summary */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Created',  value: result.imported, color: 'text-green-700',  bg: 'bg-green-50 dark:bg-green-900/20' },
                  { label: 'Updated',  value: result.updated,  color: 'text-blue-700',   bg: 'bg-blue-50 dark:bg-blue-900/20' },
                  { label: 'Skipped',  value: result.skipped,  color: 'text-gray-500',   bg: 'bg-gray-50 dark:bg-gray-700' },
                  { label: 'Failed',   value: result.failed,   color: 'text-red-700',    bg: 'bg-red-50 dark:bg-red-900/20' },
                ].map(({ label, value, color, bg }) => (
                  <div key={label} className={`p-3 ${bg} rounded-lg border border-gray-200 dark:border-gray-600 text-center`}>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                    <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</p>
                  </div>
                ))}
              </div>

              {result.session_id && (
                <p className="text-xs text-gray-400 text-center font-mono">Session #{result.session_id}</p>
              )}

              {/* Error details */}
              {result.errors.length > 0 && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-red-800 dark:text-red-400">{result.errors.length} row error{result.errors.length > 1 ? 's' : ''}:</p>
                    <button onClick={() => downloadErrors(result.errors)} className="text-xs text-red-600 dark:text-red-400 hover:underline flex items-center gap-1">
                      <Download size={12} /> Download log
                    </button>
                  </div>
                  <ul className="text-xs text-red-700 dark:text-red-300 space-y-0.5 max-h-32 overflow-y-auto">
                    {result.errors.map((e, i) => <li key={i}>• {e}</li>)}
                  </ul>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={reset}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
                  <RotateCcw size={16} /> Import Another File
                </button>
                {result.failedRows.length > 0 && (
                  <>
                    <button onClick={() => handleImport(result.failedRows)}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 transition-colors">
                      <RefreshCw size={16} /> Retry {result.failedRows.length} Failed
                    </button>
                    <button onClick={exportFailedCSV}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 transition-colors">
                      <FileDown size={16} /> Export Failed
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ══ ERROR ═══════════════════════════════════════════════════════ */}
          {status === 'error' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl">
                <XCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-800 dark:text-red-300">Something went wrong</p>
                  <p className="text-sm text-red-700 dark:text-red-400 mt-0.5">{errorMsg}</p>
                </div>
              </div>
              <button onClick={reset}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
                <RotateCcw size={16} /> Try Again
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
