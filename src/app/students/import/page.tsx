'use client';

import { useState, useCallback, useRef } from 'react';
import {
  Upload, FileText, Eye, Play, RotateCcw, AlertTriangle,
  CheckCircle2, XCircle, Users, RefreshCw, ChevronDown,
  Download, ArrowRight, Columns, Plus, Search, Loader,
  FileDown, ChevronUp, AlertCircle, Info, Shield,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

/* ── Types ─────────────────────────────────────────────────────────────────── */

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

interface ValidationResult {
  total: number;
  valid: number;
  duplicateInSystem: number;
  errors: ValidationError[];
  rowFlags: ('valid' | 'warning' | 'error')[];
  missingClasses: string[];
  missingStreams: { class: string; stream: string }[];
  canProceed: boolean;
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
}

type Status = 'idle' | 'analyzing' | 'preview' | 'validating' | 'validated' | 'importing' | 'complete' | 'error';

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
  const [status, setStatus]             = useState<Status>('idle');
  const [file, setFile]                 = useState<File | null>(null);
  const [isDragging, setIsDragging]     = useState(false);
  const [previewData, setPreviewData]   = useState<PreviewData | null>(null);
  const [validation, setValidation]     = useState<ValidationResult | null>(null);
  const [progress, setProgress]         = useState({ done: 0, updated: 0, failed: 0, total: 0, current: '' });
  const [result, setResult]             = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg]         = useState('');
  const [showTemplate, setShowTemplate] = useState(false);
  const [showMapper, setShowMapper]     = useState(false);
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [columnMapping, setColumnMapping] = useState<Record<string, string | null>>({});
  const [creatingClass, setCreatingClass] = useState<string | null>(null);
  const [creatingStream, setCreatingStream] = useState<{ class: string; stream: string } | null>(null);
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
    const rows = result.failedRows.join(', ');
    const csv = `Failed Row Numbers\n${rows}\n\nErrors:\n${result.errors.join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `import_failed_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success('Failed rows exported');
  };

  /* ── File handling ───────────────────────────────────────────────────────── */

  const acceptFile = (f: File | null) => {
    if (!f) return;
    const valid = /\.(csv|xlsx|xls)$/i.test(f.name);
    if (!valid) { toast.error('Only .csv and .xlsx files are accepted'); return; }
    setFile(f);
    setStatus('idle');
    setPreviewData(null);
    setValidation(null);
    setResult(null);
    setColumnMapping({});
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
      // Re-validate
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
      // We need the class_id — get it first
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
    setProgress({ done: 0, updated: 0, failed: 0, total: retryRows ? retryRows.length : (previewData?.total ?? 0), current: 'Starting...' });

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mode', 'import');
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

            if (event.type === 'progress') {
              setProgress({
                done: event.imported ?? 0,
                updated: event.updated ?? 0,
                failed: event.failed ?? 0,
                total: event.total,
                current: event.current_name ?? '',
              });
            } else if (event.type === 'complete') {
              setResult(event as ImportResult);
              setStatus('complete');
              if (event.failed > 0) {
                toast.error(`Import done: ${event.failed} failed`);
              } else {
                toast.success(`Import complete: ${event.imported} admitted, ${event.updated} updated`);
              }
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
    setProgress({ done: 0, updated: 0, failed: 0, total: 0, current: '' });
    setShowMapper(false);
    setShowAllErrors(false);
    setColumnMapping({});
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /* ── Computed ────────────────────────────────────────────────────────────── */

  const totalProcessed = progress.done + progress.updated + progress.failed;
  const pct = progress.total > 0 ? Math.round((totalProcessed / progress.total) * 100) : 0;
  const mapping = columnMapping;
  const fileHeaders = previewData?.fileHeaders ?? [];
  const hasNameMapping = mapping.name || (mapping.first_name && mapping.last_name);

  const validationErrors = validation?.errors ?? [];
  const hardErrors = validationErrors.filter(e => !e.message.includes('will UPDATE') && !e.message.includes('does not exist') && !e.message.includes('is empty') && !e.message.includes('Negative'));
  const canImport = !hardErrors.length || !validation;

  /* ── Render ──────────────────────────────────────────────────────────────── */

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Users className="text-blue-600" size={26} />
              Learner Import
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Upload CSV or Excel &bull; Automatic admission &amp; enrollment &bull; Supports 10,000+ rows
            </p>
          </div>
          <button onClick={downloadTemplate}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-sm">
            <Download size={16} /> Download Template
          </button>
        </div>

        {/* Progress steps */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-xs">
            {[
              { key: 'upload', label: 'Upload', activeStates: ['idle', 'analyzing'] },
              { key: 'preview', label: 'Preview', activeStates: ['preview'] },
              { key: 'validate', label: 'Validate', activeStates: ['validating', 'validated'] },
              { key: 'import', label: 'Import', activeStates: ['importing'] },
              { key: 'done', label: 'Done', activeStates: ['complete'] },
            ].map((step, i, arr) => {
              const isActive = step.activeStates.includes(status);
              const isPast = arr.findIndex(s => s.activeStates.includes(status)) > i;
              return (
                <div key={step.key} className="flex items-center gap-2">
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium transition-all ${
                    isActive ? 'bg-blue-600 text-white' :
                    isPast ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                    'bg-gray-100 text-gray-400 dark:bg-gray-800'
                  }`}>
                    {isPast && <CheckCircle2 size={12} />}
                    {step.label}
                  </div>
                  {i < arr.length - 1 && <ArrowRight size={12} className="text-gray-300" />}
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">

          {/* ── STEP 1: FILE SELECT ── */}
          {(status === 'idle' || status === 'analyzing') && (
            <>
              <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
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
                  {status === 'analyzing' ? <><RefreshCw size={16} className="animate-spin" /> Analyzing...</> : <><Eye size={16} /> Preview File</>}
                </button>
                <button onClick={() => setShowTemplate(s => !s)}
                  className="px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-1">
                  Template <ChevronDown size={14} className={showTemplate ? 'rotate-180 transition-transform' : 'transition-transform'} />
                </button>
              </div>

              {showTemplate && (
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">CSV Column Headers</p>
                    <button onClick={downloadTemplate} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><Download size={12} /> Download .csv</button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Required: <strong>name</strong> (or first_name + last_name) and <strong>class</strong>. Optional: <strong>fees_balance</strong> for financial records.
                  </p>
                  <pre className="text-xs bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-600 overflow-x-auto text-gray-700 dark:text-gray-300">{TEMPLATE_CSV}</pre>
                </div>
              )}
            </>
          )}

          {/* ── STEP 2: PREVIEW ── */}
          {status === 'preview' && previewData && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                <CheckCircle2 size={18} className="text-blue-600 flex-shrink-0" />
                <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                  {previewData.total.toLocaleString()} learner{previewData.total !== 1 ? 's' : ''} detected — showing first 10 rows
                </p>
              </div>

              {/* Column Mapper with override */}
              {fileHeaders.length > 0 && (
                <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                  <button onClick={() => setShowMapper(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                    <span className="flex items-center gap-2">
                      <Columns size={16} className="text-blue-500" />
                      Column Mapping
                      {!hasNameMapping && <span className="text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded-full">Name unmapped</span>}
                    </span>
                    <ChevronDown size={14} className={showMapper ? 'rotate-180 transition-transform' : 'transition-transform'} />
                  </button>

                  {showMapper && (
                    <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                        File headers: <span className="font-mono text-gray-700 dark:text-gray-300">{fileHeaders.join(', ')}</span>
                      </p>
                      {SYSTEM_FIELDS.map(field => {
                        const mapped = mapping[field.key] ?? null;
                        return (
                          <div key={field.key} className={`flex items-center gap-3 py-2 px-3 rounded-lg ${field.primary ? 'bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30' : ''}`}>
                            <span className={`w-40 text-xs font-medium truncate flex items-center gap-1 ${field.required ? 'text-gray-800 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400'}`}>
                              {field.primary && <Shield size={10} className="text-blue-500" />}
                              {field.label}
                              {field.required && <span className="text-red-500">*</span>}
                            </span>
                            <ArrowRight size={12} className="text-gray-400 flex-shrink-0" />
                            <select value={mapped ?? ''}
                              onChange={e => updateMapping(field.key, e.target.value || null)}
                              className="flex-1 px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                              <option value="">— not mapped —</option>
                              {fileHeaders.map(h => (
                                <option key={h} value={h}>{h}</option>
                              ))}
                            </select>
                            {mapped && previewData.columnTypes?.[mapped] && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${TYPE_BADGES[previewData.columnTypes[mapped]]?.color ?? TYPE_BADGES.unmapped.color}`}>
                                {TYPE_BADGES[previewData.columnTypes[mapped]]?.label ?? 'Unknown'}
                              </span>
                            )}
                          </div>
                        );
                      })}
                      <button onClick={rePreview}
                        className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
                        <RefreshCw size={12} /> Re-analyze with updated mapping
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Warnings */}
              {previewData.warnings.length > 0 && (
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg">
                  <p className="text-xs font-semibold text-yellow-800 dark:text-yellow-400 mb-1 flex items-center gap-1">
                    <AlertTriangle size={14} /> Warnings
                  </p>
                  <ul className="text-xs text-yellow-700 dark:text-yellow-300 space-y-0.5">
                    {previewData.warnings.map((w, i) => <li key={i}>• {w}</li>)}
                  </ul>
                </div>
              )}

              {/* Preview Table */}
              {previewData.preview.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">First 10 rows:</p>
                  <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-600">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          {Object.keys(previewData.preview[0]).map(k => (
                            <th key={k} className={`px-3 py-2 text-left font-semibold ${
                              k === 'name' ? 'text-blue-700 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10' : 'text-gray-600 dark:text-gray-300'
                            }`}>
                              {k === 'name' && <Shield size={10} className="inline mr-1 text-blue-500" />}
                              {k}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.preview.map((row, i) => (
                          <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                            {Object.entries(row).map(([k, v], j) => (
                              <td key={j} className={`px-3 py-2 ${
                                k === 'name' ? 'font-medium text-gray-900 dark:text-white' :
                                v === '—' ? 'text-gray-300 dark:text-gray-600 italic' :
                                'text-gray-700 dark:text-gray-300'
                              }`}>{String(v)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={reset}
                  className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 transition-colors">
                  ← Back
                </button>
                <button onClick={handleValidate}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
                  <Shield size={16} /> Validate {previewData.total.toLocaleString()} Rows
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: VALIDATING ── */}
          {status === 'validating' && (
            <div className="py-12 text-center">
              <Loader size={32} className="animate-spin text-blue-600 mx-auto mb-3" />
              <p className="font-semibold text-gray-800 dark:text-white">Validating all rows against database...</p>
              <p className="text-sm text-gray-400 mt-1">Checking duplicates, missing classes, invalid fees</p>
            </div>
          )}

          {/* ── STEP 3b: VALIDATED ── */}
          {status === 'validated' && validation && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 text-center">
                  <p className="text-xs text-gray-500">Total Rows</p>
                  <p className="text-2xl font-bold text-gray-800 dark:text-white">{validation.total}</p>
                </div>
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700 text-center">
                  <p className="text-xs text-green-600">Valid (New)</p>
                  <p className="text-2xl font-bold text-green-700">{validation.valid}</p>
                </div>
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700 text-center">
                  <p className="text-xs text-blue-600">Existing (Update)</p>
                  <p className="text-2xl font-bold text-blue-700">{validation.duplicateInSystem}</p>
                </div>
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-700 text-center">
                  <p className="text-xs text-red-600">Errors</p>
                  <p className="text-2xl font-bold text-red-700">{hardErrors.length}</p>
                </div>
              </div>

              {/* Missing classes → Quick-add */}
              {validation.missingClasses.length > 0 && (
                <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg">
                  <p className="text-xs font-semibold text-orange-800 dark:text-orange-400 mb-2 flex items-center gap-1">
                    <AlertCircle size={14} /> Missing Classes — create them to proceed
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

              {/* Missing streams → Quick-add */}
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
                        Create &ldquo;{stream}&rdquo; under &ldquo;{cls}&rdquo;
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Error list */}
              {validationErrors.length > 0 && (
                <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                  <button onClick={() => setShowAllErrors(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                    <span className="flex items-center gap-2">
                      <AlertTriangle size={16} className="text-red-500" />
                      {validationErrors.length} issue{validationErrors.length !== 1 ? 's' : ''} found
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
                            <th className="px-3 py-2 text-left text-gray-500 font-medium">Value</th>
                            <th className="px-3 py-2 text-left text-gray-500 font-medium">Issue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {validationErrors.slice(0, 100).map((e, i) => (
                            <tr key={i} className={`border-t ${
                              e.message.includes('will UPDATE') ? 'bg-blue-50/50 dark:bg-blue-900/10' :
                              e.message.includes('does not exist') || e.message.includes('Negative') ? 'bg-yellow-50/50 dark:bg-yellow-900/10' :
                              'bg-red-50/50 dark:bg-red-900/10'
                            }`}>
                              <td className="px-3 py-2 font-mono">{e.row}</td>
                              <td className="px-3 py-2 font-medium">{e.field}</td>
                              <td className="px-3 py-2 text-gray-500 truncate max-w-[120px]">{e.value || '(empty)'}</td>
                              <td className="px-3 py-2">
                                {e.message.includes('will UPDATE') ? (
                                  <span className="inline-flex items-center gap-1 text-blue-600"><Info size={10} /> {e.message}</span>
                                ) : e.message.includes('does not exist') || e.message.includes('is empty') ? (
                                  <span className="inline-flex items-center gap-1 text-yellow-600"><AlertTriangle size={10} /> {e.message}</span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-red-600"><XCircle size={10} /> {e.message}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {validationErrors.length > 100 && (
                        <p className="text-xs text-gray-400 text-center py-2">Showing first 100 of {validationErrors.length} issues</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button onClick={() => setStatus('preview')}
                  className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 transition-colors">
                  ← Back to Preview
                </button>
                <button onClick={handleValidate}
                  className="px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 transition-colors flex items-center gap-1">
                  <RefreshCw size={14} /> Re-validate
                </button>
                <button onClick={() => handleImport()} disabled={!canImport}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
                  <Play size={16} />
                  {canImport
                    ? `Import ${validation.total.toLocaleString()} Learners`
                    : `Fix ${hardErrors.length} error${hardErrors.length !== 1 ? 's' : ''} first`
                  }
                </button>
              </div>

              {!canImport && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
                  <p className="text-xs text-red-700 dark:text-red-400 flex items-center gap-1">
                    <XCircle size={12} />
                    {hardErrors.length} critical error{hardErrors.length !== 1 ? 's' : ''} must be fixed. Fix the CSV and re-upload, or use column mapping to correct misdetected columns.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 4: IMPORTING ── */}
          {status === 'importing' && (
            <div className="py-4 space-y-5">
              <div className="text-center">
                <RefreshCw size={32} className="animate-spin text-blue-600 mx-auto mb-3" />
                <p className="font-semibold text-gray-800 dark:text-white">
                  Processing {totalProcessed.toLocaleString()} / {progress.total.toLocaleString()}
                </p>
                <p className="text-sm text-gray-400 mt-1 truncate max-w-xs mx-auto">{progress.current || 'Processing...'}</p>
              </div>

              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                <div className="bg-blue-600 h-3 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-center text-sm font-semibold text-blue-600">{pct}%</p>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-xs text-green-600">Admitted</p>
                  <p className="text-lg font-bold text-green-700">{progress.done}</p>
                </div>
                <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-xs text-blue-600">Updated</p>
                  <p className="text-lg font-bold text-blue-700">{progress.updated}</p>
                </div>
                <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <p className="text-xs text-red-600">Failed</p>
                  <p className="text-lg font-bold text-red-700">{progress.failed}</p>
                </div>
              </div>

              <p className="text-xs text-center text-gray-400">
                Do not close this tab — import is running server-side in chunks of 50
              </p>
            </div>
          )}

          {/* ── STEP 5: COMPLETE ── */}
          {status === 'complete' && result && (
            <div className="space-y-4">
              <div className={`flex items-center gap-3 p-4 rounded-xl border ${
                result.failed > 0
                  ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700'
                  : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
              }`}>
                {result.failed > 0
                  ? <AlertTriangle size={22} className="text-yellow-600 flex-shrink-0" />
                  : <CheckCircle2 size={22} className="text-green-600 flex-shrink-0" />
                }
                <div>
                  <p className={`font-semibold ${result.failed > 0 ? 'text-yellow-800 dark:text-yellow-300' : 'text-green-800 dark:text-green-300'}`}>
                    {result.message}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Admitted', value: result.imported, color: 'text-green-700', bg: 'bg-green-50 dark:bg-green-900/20' },
                  { label: 'Updated', value: result.updated, color: 'text-blue-700', bg: 'bg-blue-50 dark:bg-blue-900/20' },
                  { label: 'Skipped', value: result.skipped, color: 'text-gray-500', bg: 'bg-gray-50 dark:bg-gray-700' },
                  { label: 'Failed', value: result.failed, color: 'text-red-700', bg: 'bg-red-50 dark:bg-red-900/20' },
                ].map(({ label, value, color, bg }) => (
                  <div key={label} className={`p-3 ${bg} rounded-lg border border-gray-200 dark:border-gray-600 text-center`}>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                    <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Error details */}
              {result.errors.length > 0 && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-red-800 dark:text-red-400">
                      {result.errors.length} row error{result.errors.length > 1 ? 's' : ''}:
                    </p>
                    <button onClick={() => downloadErrors(result.errors)}
                      className="text-xs text-red-600 dark:text-red-400 hover:underline flex items-center gap-1">
                      <Download size={12} /> Download log
                    </button>
                  </div>
                  <ul className="text-xs text-red-700 dark:text-red-300 space-y-0.5 max-h-32 overflow-y-auto">
                    {result.errors.map((e, i) => <li key={i}>• {e}</li>)}
                  </ul>
                </div>
              )}

              {/* Action buttons */}
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

          {/* ── ERROR ── */}
          {status === 'error' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl">
                <XCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-800 dark:text-red-300">Import Failed</p>
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
