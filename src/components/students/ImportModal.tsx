"use client";
import React, { useState, useRef, useCallback } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { X, Upload, FileText, AlertCircle, CheckCircle, Download, FileSpreadsheet, Loader2, ArrowRight, Eye } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useDropzone } from 'react-dropzone';

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onImportSuccess?: () => void;
}

type Phase = 'select' | 'preview' | 'importing' | 'complete';

interface PreviewData {
  total: number;
  preview: Array<Record<string, string>>;
  warnings: string[];
  columnMapping: Record<string, string | null>;
  fileHeaders: string[];
}

interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
  total: number;
  message: string;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  open,
  onClose,
  onImportSuccess
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>('select');
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, currentName: '' });
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setSelectedFile(file);
      setPhase('select');
      setPreviewData(null);
      setResult(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    multiple: false,
    maxSize: 20 * 1024 * 1024, // 20MB
    disabled: phase === 'importing',
  });

  // ── Preview ─────────────────────────────────────────────────────────────
  const handlePreview = async () => {
    if (!selectedFile) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('mode', 'preview');

      const res = await fetch('/api/students/import', { method: 'POST', body: formData });
      const data = await res.json();

      if (!data.success) {
        toast.error(data.error || 'Preview failed');
        return;
      }

      setPreviewData(data);
      setPhase('preview');
    } catch (err: any) {
      toast.error(`Preview error: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // ── Import (SSE) ───────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!selectedFile) return;
    setPhase('importing');
    setProgress({ current: 0, total: previewData?.total || 0, currentName: '' });

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('mode', 'import');

      const res = await fetch('/api/students/import', {
        method: 'POST',
        body: formData,
        signal: ac.signal,
      });

      if (!res.body) {
        toast.error('Import failed: no response stream');
        setPhase('select');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const match = line.match(/^data:\s*(.+)$/m);
          if (!match) continue;
          try {
            const evt = JSON.parse(match[1]);
            if (evt.type === 'progress') {
              setProgress({ current: evt.imported, total: evt.total, currentName: evt.current_name || '' });
            } else if (evt.type === 'complete') {
              setResult(evt as ImportResult);
              setPhase('complete');
              toast.success(evt.message || 'Import complete');
              onImportSuccess?.();
            } else if (evt.type === 'error') {
              toast.error(evt.message || 'Import failed');
              setPhase('select');
            }
          } catch { /* ignore malformed events */ }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        toast.error(`Import error: ${err.message || 'Unknown error'}`);
        setPhase('select');
      }
    } finally {
      abortRef.current = null;
    }
  };

  // ── Download error log ──────────────────────────────────────────────────
  const downloadErrorLog = () => {
    if (!result?.errors?.length) return;
    const csv = ['Row,Error', ...result.errors.map(e => `"${e.replace(/"/g, '""')}"`)] .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import_errors_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Template download ──────────────────────────────────────────────────
  const downloadTemplate = () => {
    const csvContent = `name,reg_no,class,stream,gender,date_of_birth,phone,address
John Doe,ADM/001/2026,Form 1,A,M,2010-03-15,+256700000000,Kampala
Jane Smith,ADM/002/2026,Form 2,B,F,2009-07-22,+256700000001,Entebbe`;
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'students_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Template downloaded');
  };

  const reset = () => {
    setSelectedFile(null);
    setPhase('select');
    setPreviewData(null);
    setResult(null);
    setProgress({ current: 0, total: 0, currentName: '' });
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
  };

  const handleClose = () => {
    if (phase === 'importing') return; // block close during import
    reset();
    onClose();
  };

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <Transition show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child as={Fragment}
          enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100"
          leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0">
          <div className="fixed inset-0 bg-black/50" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child as={Fragment}
              enter="ease-out duration-300" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100"
              leave="ease-in duration-200" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white dark:bg-slate-800 p-6 text-left shadow-xl transition-all">
                <div className="flex items-center justify-between mb-5">
                  <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Upload className="w-5 h-5" />
                    Bulk Import Students
                  </Dialog.Title>
                  {phase !== 'importing' && (
                    <button onClick={handleClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700">
                      <X className="w-5 h-5 text-gray-500" />
                    </button>
                  )}
                </div>

                {/* ─── PHASE: SELECT FILE ────────────────────────────── */}
                {phase === 'select' && (
                  <div className="space-y-5">
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                      <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Import Instructions</h3>
                      <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                        <li>• <strong>Formats:</strong> CSV (.csv) or Excel (.xlsx)</li>
                        <li>• <strong>Required:</strong> name (or first_name + last_name)</li>
                        <li>• <strong>Optional:</strong> reg_no, class, stream, gender, date_of_birth, phone, address</li>
                        <li>• Duplicates matched by reg_no — existing students are updated</li>
                        <li>• Rows are processed in batches of 50 with progress tracking</li>
                      </ul>
                    </div>

                    <div className="flex justify-center">
                      <button onClick={downloadTemplate}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors text-sm">
                        <Download className="w-4 h-4" /> Download Template
                      </button>
                    </div>

                    <div
                      {...getRootProps()}
                      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
                        isDragActive
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                      }`}
                    >
                      <input {...getInputProps()} />
                      <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      {isDragActive ? (
                        <p className="text-blue-600 font-medium">Drop the file here...</p>
                      ) : (
                        <div>
                          <span className="text-blue-600 font-medium">Click to upload</span>
                          <span className="text-gray-500"> or drag and drop</span>
                          <p className="text-xs text-gray-400 mt-1">CSV or Excel files up to 20MB</p>
                        </div>
                      )}
                    </div>

                    {selectedFile && (
                      <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-blue-500" />
                          <div>
                            <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{selectedFile.name}</p>
                            <p className="text-xs text-gray-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                          </div>
                        </div>
                        <button onClick={() => setSelectedFile(null)} className="text-red-500 hover:text-red-600">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    <div className="flex justify-end gap-3">
                      <button onClick={handleClose}
                        className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-slate-600 rounded-lg hover:bg-gray-300 dark:hover:bg-slate-500 text-sm">
                        Cancel
                      </button>
                      <button onClick={handlePreview} disabled={!selectedFile || loading}
                        className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm flex items-center gap-2">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                        Preview
                      </button>
                    </div>
                  </div>
                )}

                {/* ─── PHASE: PREVIEW ────────────────────────────────── */}
                {phase === 'preview' && previewData && (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        <strong>{previewData.total.toLocaleString()}</strong> rows detected — showing first {previewData.preview.length}:
                      </p>
                    </div>

                    {previewData.warnings.length > 0 && (
                      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                        {previewData.warnings.map((w, i) => (
                          <p key={i} className="text-xs text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {w}
                          </p>
                        ))}
                      </div>
                    )}

                    {/* Column mapping display */}
                    <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-3">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">Column Mapping</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(previewData.columnMapping).map(([sys, file]) => (
                          <span key={sys} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                            file ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                                 : 'bg-gray-200 dark:bg-slate-600 text-gray-500 dark:text-gray-400'
                          }`}>
                            {sys} {file ? `→ ${file}` : '(unmapped)'}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Preview table */}
                    <div className="border rounded-lg overflow-auto max-h-60">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-100 dark:bg-slate-700 sticky top-0">
                          <tr>
                            {Object.keys(previewData.preview[0] || {}).map(col => (
                              <th key={col} className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                          {previewData.preview.map((row, i) => (
                            <tr key={i} className="hover:bg-gray-50 dark:hover:bg-slate-600/50">
                              {Object.values(row).map((val, j) => (
                                <td key={j} className="px-3 py-1.5 text-gray-800 dark:text-gray-200 whitespace-nowrap">{String(val)}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex justify-between">
                      <button onClick={() => setPhase('select')}
                        className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-slate-600 rounded-lg hover:bg-gray-300 dark:hover:bg-slate-500 text-sm">
                        Back
                      </button>
                      <button onClick={handleImport}
                        className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm flex items-center gap-2 font-semibold">
                        <Upload className="w-4 h-4" />
                        Import {previewData.total.toLocaleString()} Students
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* ─── PHASE: IMPORTING (Progress) ───────────────────── */}
                {phase === 'importing' && (
                  <div className="space-y-6 py-4">
                    <div className="text-center">
                      <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto mb-3" />
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                        Importing {progress.current.toLocaleString()} / {progress.total.toLocaleString()} ...
                      </p>
                      {progress.currentName && (
                        <p className="text-xs text-gray-500 mt-1 truncate max-w-sm mx-auto">{progress.currentName}</p>
                      )}
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-3">
                      <div
                        className="bg-indigo-600 h-3 rounded-full transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-center text-xs text-gray-500">{pct}% complete</p>
                  </div>
                )}

                {/* ─── PHASE: COMPLETE ─────────────────────────────────── */}
                {phase === 'complete' && result && (
                  <div className="space-y-5">
                    <div className="text-center">
                      <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                        <CheckCircle className="w-7 h-7 text-green-600" />
                      </div>
                      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Import Complete</h3>
                      <p className="text-xs text-gray-500 mt-1">{result.message}</p>
                    </div>

                    <div className="grid grid-cols-4 gap-3 text-center">
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                        <div className="text-xl font-bold text-blue-600">{result.total}</div>
                        <div className="text-[10px] text-blue-700 dark:text-blue-300 uppercase font-semibold">Total</div>
                      </div>
                      <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                        <div className="text-xl font-bold text-green-600">{result.imported}</div>
                        <div className="text-[10px] text-green-700 dark:text-green-300 uppercase font-semibold">Added</div>
                      </div>
                      <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
                        <div className="text-xl font-bold text-amber-600">{result.updated}</div>
                        <div className="text-[10px] text-amber-700 dark:text-amber-300 uppercase font-semibold">Updated</div>
                      </div>
                      <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                        <div className="text-xl font-bold text-red-600">{result.skipped}</div>
                        <div className="text-[10px] text-red-700 dark:text-red-300 uppercase font-semibold">Skipped</div>
                      </div>
                    </div>

                    {result.errors.length > 0 && (
                      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-red-900 dark:text-red-100 text-sm flex items-center gap-1.5">
                            <AlertCircle className="w-4 h-4" /> Errors ({result.errors.length})
                          </h4>
                          <button onClick={downloadErrorLog}
                            className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 font-medium">
                            <Download className="w-3.5 h-3.5" /> Download Log
                          </button>
                        </div>
                        <div className="max-h-32 overflow-y-auto space-y-0.5">
                          {result.errors.slice(0, 20).map((e, i) => (
                            <p key={i} className="text-xs text-red-700 dark:text-red-300">{e}</p>
                          ))}
                          {result.errors.length > 20 && (
                            <p className="text-xs text-red-500 italic">... and {result.errors.length - 20} more (download full log)</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Post-import actions */}
                    {(result.imported > 0 || result.updated > 0) && (
                      <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-3 text-center">
                        <p className="text-sm text-indigo-800 dark:text-indigo-200 font-medium">
                          {result.imported + result.updated} students imported. Sync to biometric device?
                        </p>
                        <button className="mt-2 px-4 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700 font-semibold">
                          Sync to Device
                        </button>
                      </div>
                    )}

                    <div className="flex justify-end gap-3">
                      <button onClick={reset}
                        className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-slate-600 rounded-lg hover:bg-gray-300 dark:hover:bg-slate-500 text-sm">
                        Import Another
                      </button>
                      <button onClick={handleClose}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};
