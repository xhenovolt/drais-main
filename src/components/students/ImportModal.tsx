"use client";
import React, { useState, useRef, useCallback } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { X, Upload, FileText, AlertCircle, CheckCircle, Download, FileSpreadsheet, Loader2, ArrowRight, Eye, Plus, Users, UserPlus, UserCheck, UserX } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useDropzone } from 'react-dropzone';
import { useI18n } from '@/components/i18n/I18nProvider';

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
  const { t } = useI18n();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>('select');
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, currentName: '' });
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  /** Persists the server-side error so the modal can SHOW it (rather than
   *  flash a toast and clear). Cleared when the user clicks "Try again". */
  const [importError, setImportError] = useState<string | null>(null);
  /** The session_id the server returned on `type:'session'`. Needed to
   *  POST mode=cancel so the SSE loop on the server stops, not just the
   *  client-side fetch. */
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);
  /** Live per-row counters during the import. Drives the 4-pill display
   *  in the importing phase so the user sees in real time which rows
   *  are landing as new vs updates vs skipped vs failed. */
  const [liveStats, setLiveStats] = useState({ imported: 0, updated: 0, skipped: 0, failed: 0 });
  /** Per-import-attempt list of missing classes detected at preview.
   *  When non-empty the preview UI surfaces a "Create N classes" CTA
   *  rather than letting the user import learners that would land
   *  without enrolment. */
  const [missingClasses, setMissingClasses] = useState<string[]>([]);
  const [creatingClasses, setCreatingClasses] = useState(false);

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
      // Capture missing classes detected at preview so the next phase
      // can offer the user a one-click batch-create button.
      setMissingClasses(Array.isArray(data.missingClasses) ? data.missingClasses : []);
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
    setLiveStats({ imported: 0, updated: 0, skipped: 0, failed: 0 });
    setImportError(null);
    setSessionId(null);

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
            if (evt.type === 'session') {
              if (typeof evt.session_id === 'number') setSessionId(evt.session_id);
            } else if (evt.type === 'progress') {
              // Every server event = one real DB row processed (inserted,
              // updated, skipped, or failed). The bar moves on the SUM so
              // an import that's mostly updates doesn't look frozen.
              const processed = (evt.imported || 0) + (evt.updated || 0)
                              + (evt.skipped || 0)  + (evt.failed  || 0);
              setProgress({ current: processed, total: evt.total, currentName: evt.current_name || '' });
              setLiveStats({
                imported: evt.imported || 0,
                updated:  evt.updated  || 0,
                skipped:  evt.skipped  || 0,
                failed:   evt.failed   || 0,
              });
            } else if (evt.type === 'complete') {
              setResult(evt as ImportResult);
              setPhase('complete');
              toast.success(evt.message || 'Import complete');
              onImportSuccess?.();
            } else if (evt.type === 'cancelled') {
              setImportError(evt.message || 'Import cancelled');
              setPhase('select');
              toast(evt.message || 'Import cancelled', { icon: '⏸️' });
            } else if (evt.type === 'error') {
              // Persist so the modal shows the actual reason rather than
              // a transient toast that disappears in 4s.
              setImportError(evt.message || 'Import failed');
              setPhase('select');
              toast.error(evt.message || 'Import failed');
            }
          } catch { /* ignore malformed events */ }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setImportError(err.message || 'Unknown error');
        toast.error(`Import error: ${err.message || 'Unknown error'}`);
        setPhase('select');
      }
    } finally {
      abortRef.current = null;
    }
  };

  // ── Cancel a running import ────────────────────────────────────────────
  // Two-step: (1) abort the SSE fetch on the client; (2) POST mode=cancel
  // so the server-side loop checks the import_sessions table and stops.
  // The server's tryCheckCancelled() polls each chunk, so cancellation
  // takes effect within ~CHUNK_SIZE rows.
  const handleCancelImport = useCallback(async () => {
    if (phase !== 'importing') return;
    setCancelling(true);
    try {
      // 1. Abort the client-side stream reader.
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      // 2. Tell the server to stop. Only meaningful if we got a session_id.
      if (sessionId != null) {
        const fd = new FormData();
        fd.append('mode', 'cancel');
        fd.append('session_id', String(sessionId));
        await fetch('/api/students/import', { method: 'POST', body: fd })
          .catch(() => { /* server side might already be done */ });
      }
      setPhase('select');
      setImportError('Import cancelled by user.');
      toast('Import cancelled', { icon: '⏸️' });
    } finally {
      setCancelling(false);
    }
  }, [phase, sessionId]);

  // ── Batch-create missing classes ───────────────────────────────────────
  // When the preview surfaces classes the file references but the school
  // doesn't have yet, this fires create-class for each in sequence,
  // then re-previews the file so the missingClasses list shrinks. One
  // click, no per-class dialogs.
  const handleCreateMissingClasses = useCallback(async () => {
    if (missingClasses.length === 0 || !selectedFile) return;
    setCreatingClasses(true);
    let created = 0;
    let failed = 0;
    try {
      for (const name of missingClasses) {
        try {
          const fd = new FormData();
          fd.append('mode', 'create-class');
          fd.append('name', name);
          const res = await fetch('/api/students/import', { method: 'POST', body: fd });
          const data = await res.json();
          if (res.ok && data.success) created++;
          else failed++;
        } catch { failed++; }
      }
      toast.success(`Created ${created} class${created === 1 ? '' : 'es'}${failed > 0 ? ` (${failed} failed)` : ''}`);
      // Re-preview so the user sees the updated missingClasses list (should
      // now be empty if every create succeeded).
      await handlePreview();
    } finally {
      setCreatingClasses(false);
    }
  }, [missingClasses, selectedFile]);

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
                    {/* Persisted error from the last attempt — shows the
                        actual reason instead of a 4-second toast that
                        disappears before the user can read it. */}
                    {importError && (
                      <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg p-4 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-rose-800 dark:text-rose-100 mb-1">
                            Last import attempt failed
                          </p>
                          <p className="text-xs text-rose-700 dark:text-rose-200 break-words">
                            {importError}
                          </p>
                        </div>
                        <button
                          onClick={() => setImportError(null)}
                          className="text-rose-400 hover:text-rose-600 flex-shrink-0"
                          aria-label="Dismiss error"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                      <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-2">{t('actions.import')}</h3>
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

                    {/* Missing-classes batch CTA — fires before any of the
                        existing per-row warnings, because no learner can
                        actually enrol until their class exists. One-click
                        batch create + auto re-preview. */}
                    {missingClasses.length > 0 && (
                      <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-700 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-orange-900 dark:text-orange-100 mb-1">
                              {missingClasses.length} class{missingClasses.length === 1 ? '' : 'es'} referenced in your file {missingClasses.length === 1 ? 'does' : 'do'} not exist yet
                            </p>
                            <p className="text-xs text-orange-800 dark:text-orange-200 mb-2">
                              Create {missingClasses.length === 1 ? 'it' : 'them'} first so each learner lands in the right class. Without classes, learners will import but have no enrolment.
                            </p>
                            <div className="flex flex-wrap gap-1.5 mb-3">
                              {missingClasses.map(c => (
                                <span key={c} className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200">
                                  {c}
                                </span>
                              ))}
                            </div>
                            <button
                              onClick={handleCreateMissingClasses}
                              disabled={creatingClasses}
                              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-60"
                            >
                              {creatingClasses ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                              {creatingClasses
                                ? 'Creating classes…'
                                : `Create ${missingClasses.length} class${missingClasses.length === 1 ? '' : 'es'} now`}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

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
                      <button
                        onClick={handleImport}
                        disabled={missingClasses.length > 0}
                        title={missingClasses.length > 0
                          ? `Create the ${missingClasses.length} missing class${missingClasses.length === 1 ? '' : 'es'} first`
                          : undefined}
                        className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2 font-semibold"
                      >
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

                    {/* Live per-row stats — every move of these numbers is
                        one row that just landed (or was skipped) in the
                        DB. Replaces the user's "nothing is happening"
                        confusion when the bar moved slowly on
                        update-heavy imports. */}
                    <div className="grid grid-cols-4 gap-2">
                      <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-2 text-center">
                        <div className="text-lg font-bold text-green-600 dark:text-green-400">{liveStats.imported}</div>
                        <div className="text-[10px] text-green-700 dark:text-green-300 uppercase font-semibold flex items-center justify-center gap-1">
                          <UserPlus className="w-3 h-3" /> Added
                        </div>
                      </div>
                      <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2 text-center">
                        <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{liveStats.updated}</div>
                        <div className="text-[10px] text-amber-700 dark:text-amber-300 uppercase font-semibold flex items-center justify-center gap-1">
                          <UserCheck className="w-3 h-3" /> Updated
                        </div>
                      </div>
                      <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-2 text-center">
                        <div className="text-lg font-bold text-slate-600 dark:text-slate-300">{liveStats.skipped}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Skipped</div>
                      </div>
                      <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-2 text-center">
                        <div className="text-lg font-bold text-red-600 dark:text-red-400">{liveStats.failed}</div>
                        <div className="text-[10px] text-red-700 dark:text-red-300 uppercase font-semibold flex items-center justify-center gap-1">
                          <UserX className="w-3 h-3" /> Failed
                        </div>
                      </div>
                    </div>

                    {/* Cancel button — was previously missing entirely. The
                        abort infrastructure existed (abortRef) but had no UI. */}
                    <div className="flex justify-center pt-2">
                      <button
                        onClick={handleCancelImport}
                        disabled={cancelling}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:text-white bg-white dark:bg-slate-700 border border-red-300 hover:bg-red-600 rounded-lg transition-colors disabled:opacity-60"
                      >
                        {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                        {cancelling ? 'Cancelling…' : 'Cancel import'}
                      </button>
                    </div>
                  </div>
                )}

                {/* ─── PHASE: COMPLETE ─────────────────────────────────── */}
                {phase === 'complete' && result && (
                  <div className="space-y-6">
                    {/* Hero — large celebration banner. The previous compact
                        version was easy to miss; this one fills the modal
                        the way a success page should. */}
                    <div className="text-center py-6 px-4 bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 dark:from-green-900/20 dark:via-emerald-900/20 dark:to-teal-900/20 rounded-2xl border border-green-200 dark:border-green-800">
                      <div className="relative inline-block mb-4">
                        <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg">
                          <CheckCircle className="w-12 h-12 text-white" strokeWidth={2.5} />
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                        Import Successful
                      </h3>
                      <p className="text-base text-gray-700 dark:text-gray-300 mb-1">
                        <span className="font-bold text-green-700 dark:text-green-300">{(result.imported + result.updated).toLocaleString()}</span> learner{(result.imported + result.updated) === 1 ? '' : 's'} written to DRAIS
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{result.message}</p>
                    </div>

                    {/* Bigger stat grid — same numbers, more room to breathe. */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-100 dark:border-blue-900/40">
                        <Users className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                        <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{result.total.toLocaleString()}</div>
                        <div className="text-[11px] text-blue-700 dark:text-blue-300 uppercase tracking-wide font-semibold mt-1">Total</div>
                      </div>
                      <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border border-green-100 dark:border-green-900/40">
                        <UserPlus className="w-5 h-5 text-green-500 mx-auto mb-1" />
                        <div className="text-3xl font-bold text-green-600 dark:text-green-400">{result.imported.toLocaleString()}</div>
                        <div className="text-[11px] text-green-700 dark:text-green-300 uppercase tracking-wide font-semibold mt-1">Added</div>
                      </div>
                      <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-100 dark:border-amber-900/40">
                        <UserCheck className="w-5 h-5 text-amber-500 mx-auto mb-1" />
                        <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">{result.updated.toLocaleString()}</div>
                        <div className="text-[11px] text-amber-700 dark:text-amber-300 uppercase tracking-wide font-semibold mt-1">Updated</div>
                      </div>
                      <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                        <UserX className="w-5 h-5 text-slate-500 mx-auto mb-1" />
                        <div className="text-3xl font-bold text-slate-600 dark:text-slate-300">{result.skipped.toLocaleString()}</div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 uppercase tracking-wide font-semibold mt-1">Skipped</div>
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

                    <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-slate-700">
                      <button onClick={reset}
                        className="px-5 py-2.5 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 text-sm font-medium">
                        Import Another File
                      </button>
                      <button onClick={handleClose}
                        className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-semibold flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" />
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
