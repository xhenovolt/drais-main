'use client';

import { useState, useCallback, useRef } from 'react';
import {
  Upload, FileText, Eye, Play, RotateCcw, AlertTriangle,
  CheckCircle2, XCircle, Users, RefreshCw, ChevronDown,
  Download, ArrowRight, Columns,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface PreviewData {
  total: number;
  preview: Record<string, string>[];
  warnings: string[];
  readyToImport: boolean;
  fileHeaders?: string[];
  columnMapping?: Record<string, string | null>;
}

interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  total: number;
  message: string;
  errors: string[];
}

type Status = 'idle' | 'analyzing' | 'preview' | 'importing' | 'complete' | 'error';

const SYSTEM_FIELDS = [
  { key: 'name',          label: 'Full Name',        required: false },
  { key: 'first_name',    label: 'First Name',       required: false },
  { key: 'last_name',     label: 'Last Name',        required: false },
  { key: 'reg_no',        label: 'Reg No / Adm No',  required: false },
  { key: 'class',         label: 'Class',             required: false },
  { key: 'section',       label: 'Section / Stream',  required: false },
  { key: 'gender',        label: 'Gender',            required: false },
  { key: 'date_of_birth', label: 'Date of Birth',     required: false },
  { key: 'phone',         label: 'Phone',             required: false },
  { key: 'address',       label: 'Address',           required: false },
  { key: 'photo_url',     label: 'Photo URL',         required: false },
  { key: 'biometric_id',  label: 'Biometric ID',      required: false },
];

const TEMPLATE_CSV = `name,reg_no,class,section,gender,date_of_birth,phone,address,photo_url,biometric_id
Ali Hassan,ADM-001,Senior One,,M,2010-05-14,0700000001,Kampala,,
Fatuma Nuru,ADM-002,Senior Two,,F,2009-08-22,0700000002,Entebbe,,
Ibrahim Sali,,Senior One,,M,2011-01-30,0700000003,,,`;

export default function BulkImportPage() {
  const [status, setStatus]         = useState<Status>('idle');
  const [file, setFile]             = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [progress, setProgress]     = useState({ done: 0, total: 0, current: '' });
  const [result, setResult]         = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg]     = useState('');
  const [showTemplate, setShowTemplate] = useState(false);
  const [showMapper, setShowMapper] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Template download ───────────────────────────────────────────────────
  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'drais_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Template downloaded');
  };

  // ── Error log download ──────────────────────────────────────────────────
  const downloadErrors = () => {
    if (!result?.errors.length) return;
    const content = result.errors.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import_errors_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Error log downloaded');
  };

  // ── File selection ──────────────────────────────────────────────────────
  const acceptFile = (f: File | null) => {
    if (!f) return;
    const valid = /\.(csv|xlsx|xls)$/i.test(f.name);
    if (!valid) { toast.error('Only .csv and .xlsx files are accepted'); return; }
    setFile(f);
    setStatus('idle');
    setPreviewData(null);
    setResult(null);
  };

  const onFileInput  = (e: React.ChangeEvent<HTMLInputElement>) => acceptFile(e.target.files?.[0] ?? null);
  const onDragOver   = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave  = () => setIsDragging(false);
  const onDrop       = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); acceptFile(e.dataTransfer.files?.[0] ?? null); };

  // ── Preview ─────────────────────────────────────────────────────────────
  const handlePreview = async () => {
    if (!file) return;
    setStatus('analyzing');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mode', 'preview');
      const res = await fetch('/api/students/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Preview failed');
      setPreviewData(data);
      setStatus('preview');
    } catch (err) {
      setErrorMsg((err as Error).message);
      setStatus('error');
    }
  };

  // ── Import with SSE progress ─────────────────────────────────────────────
  const handleImport = async () => {
    if (!file) return;
    setStatus('importing');
    setProgress({ done: 0, total: previewData?.total ?? 0, current: 'Starting...' });

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mode', 'import');

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
              setProgress({ done: event.imported, total: event.total, current: event.current_name ?? '' });
            } else if (event.type === 'complete') {
              setResult(event as ImportResult);
              setStatus('complete');
              toast.success(`Import complete: ${event.imported} added, ${event.updated} updated`);
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

  const reset = () => {
    setStatus('idle');
    setFile(null);
    setPreviewData(null);
    setResult(null);
    setErrorMsg('');
    setProgress({ done: 0, total: 0, current: '' });
    setShowMapper(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const mapping = previewData?.columnMapping ?? {};
  const fileHeaders = previewData?.fileHeaders ?? [];
  const hasNameMapping = mapping.name || (mapping.first_name && mapping.last_name);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Users className="text-blue-600" size={26} />
              Bulk Import Students
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Upload CSV or Excel. Supports 10,000+ rows with live progress.
            </p>
          </div>
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-sm"
          >
            <Download size={16} />
            Download Template
          </button>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">

          {/* ── IDLE / FILE SELECT ── */}
          {(status === 'idle' || status === 'analyzing') && (
            <>
              {/* Drop zone */}
              <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
                }`}
              >
                <Upload className="mx-auto mb-3 text-gray-400" size={36} />
                <p className="font-semibold text-gray-700 dark:text-gray-200">Drop file here or click to browse</p>
                <p className="text-sm text-gray-400 mt-1">.csv or .xlsx — up to 10,000 rows</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={onFileInput}
                  className="hidden"
                />
              </div>

              {/* Selected file badge */}
              {file && (
                <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg">
                  <FileText size={18} className="text-green-600" />
                  <span className="text-sm font-medium text-green-800 dark:text-green-300 flex-1 truncate">{file.name}</span>
                  <button onClick={reset} className="text-gray-400 hover:text-red-500 transition-colors">
                    <XCircle size={18} />
                  </button>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={handlePreview}
                  disabled={!file || status === 'analyzing'}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {status === 'analyzing'
                    ? <><RefreshCw size={16} className="animate-spin" /> Analyzing...</>
                    : <><Eye size={16} /> Preview File</>
                  }
                </button>
                <button
                  onClick={() => setShowTemplate(s => !s)}
                  className="px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-1"
                >
                  Template <ChevronDown size={14} className={showTemplate ? 'rotate-180 transition-transform' : 'transition-transform'} />
                </button>
              </div>

              {/* CSV template */}
              {showTemplate && (
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">CSV Column Headers</p>
                    <button onClick={downloadTemplate} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                      <Download size={12} /> Download .csv
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Required: <strong>name</strong> (or first_name + last_name). Case insensitive.</p>
                  <pre className="text-xs bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-600 overflow-x-auto text-gray-700 dark:text-gray-300">
{TEMPLATE_CSV}
                  </pre>
                </div>
              )}
            </>
          )}

          {/* ── PREVIEW ── */}
          {status === 'preview' && previewData && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                <CheckCircle2 size={18} className="text-blue-600 flex-shrink-0" />
                <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                  {previewData.total.toLocaleString()} student{previewData.total !== 1 ? 's' : ''} ready to import
                </p>
              </div>

              {/* ── Column Mapper ── */}
              {fileHeaders.length > 0 && (
                <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setShowMapper(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Columns size={16} className="text-blue-500" />
                      Column Mapping
                      {!hasNameMapping && <span className="text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded-full">Name unmapped</span>}
                    </span>
                    <ChevronDown size={14} className={showMapper ? 'rotate-180 transition-transform' : 'transition-transform'} />
                  </button>

                  {showMapper && (
                    <div className="p-4 space-y-2 max-h-72 overflow-y-auto">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        Your file headers: <span className="font-mono text-gray-700 dark:text-gray-300">{fileHeaders.join(', ')}</span>
                      </p>
                      {SYSTEM_FIELDS.map(field => {
                        const mapped = mapping[field.key];
                        return (
                          <div key={field.key} className="flex items-center gap-3 py-1.5">
                            <span className="w-36 text-xs font-medium text-gray-600 dark:text-gray-300 truncate">{field.label}</span>
                            <ArrowRight size={12} className="text-gray-400 flex-shrink-0" />
                            {mapped ? (
                              <span className="text-xs font-mono px-2 py-1 rounded bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-700">
                                {mapped}
                              </span>
                            ) : (
                              <span className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-400 italic">
                                not found
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

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

              {previewData.preview.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">First 5 rows:</p>
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
                            {Object.values(row).map((v, j) => (
                              <td key={j} className="px-3 py-2 text-gray-700 dark:text-gray-300">{String(v)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={reset} className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 transition-colors">
                  ← Back
                </button>
                <button
                  onClick={handleImport}
                  disabled={!previewData.readyToImport}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  <Play size={16} />
                  Import {previewData.total.toLocaleString()} Students
                </button>
              </div>
            </div>
          )}

          {/* ── IMPORTING — real-time progress ── */}
          {status === 'importing' && (
            <div className="py-4 space-y-5">
              <div className="text-center">
                <RefreshCw size={32} className="animate-spin text-blue-600 mx-auto mb-3" />
                <p className="font-semibold text-gray-800 dark:text-white">
                  Importing {progress.done.toLocaleString()} / {progress.total.toLocaleString()}
                </p>
                <p className="text-sm text-gray-400 mt-1 truncate max-w-xs mx-auto">
                  {progress.current || 'Processing...'}
                </p>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-center text-sm font-semibold text-blue-600">{pct}%</p>
              <p className="text-xs text-center text-gray-400">
                Do not close this tab — import is running server-side in chunks of 50
              </p>
            </div>
          )}

          {/* ── COMPLETE ── */}
          {status === 'complete' && result && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-xl">
                <CheckCircle2 size={22} className="text-green-600 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-green-800 dark:text-green-300">{result.message}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'New', value: result.imported, color: 'text-green-700' },
                  { label: 'Updated', value: result.updated, color: 'text-blue-700' },
                  { label: 'Skipped', value: result.skipped, color: 'text-gray-500' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 text-center">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                    <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  </div>
                ))}
              </div>

              {result.errors.length > 0 && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-red-800 dark:text-red-400">
                      {result.errors.length} row error{result.errors.length > 1 ? 's' : ''}:
                    </p>
                    <button
                      onClick={downloadErrors}
                      className="text-xs text-red-600 dark:text-red-400 hover:underline flex items-center gap-1"
                    >
                      <Download size={12} /> Download log
                    </button>
                  </div>
                  <ul className="text-xs text-red-700 dark:text-red-300 space-y-0.5 max-h-32 overflow-y-auto">
                    {result.errors.map((e, i) => <li key={i}>• {e}</li>)}
                  </ul>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={reset} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
                  <RotateCcw size={16} /> Import Another File
                </button>
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
              <button onClick={reset} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
                <RotateCcw size={16} /> Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
