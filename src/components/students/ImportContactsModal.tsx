'use client';

import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, Download, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useI18n } from '@/components/i18n/I18nProvider';

type ImportStep = 'select' | 'review' | 'complete';
interface ImportRow { row: { rowNumber: number; contactFirstName: string; contactLastName: string; phone: string; admissionNo: string; }; status: string; reason?: string; }
interface ImportSummary { total: number; ready: number; imported: number; duplicateFile: number; duplicateExisting: number; invalid: number; }

interface ImportContactsModalProps { open: boolean; onClose: () => void; onSuccess: () => void; }

export default function ImportContactsModal({ open, onClose, onSuccess }: ImportContactsModalProps) {
  const { t, rich, digits } = useI18n();
  const [step, setStep] = useState<ImportStep>('select');
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const invalidRows = useMemo(() => rows.filter((row) => row.status === 'invalid'), [rows]);
  const duplicateRows = useMemo(() => rows.filter((row) => row.status === 'duplicate_file' || row.status === 'duplicate_existing'), [rows]);

  function reset() {
    setStep('select'); setFile(null); setRows([]); setSummary(null); setError(''); setLoading(false);
  }

  function close() { if (!loading) { reset(); onClose(); } }

  async function downloadTemplate() {
    const response = await fetch('/api/students/contacts?mode=template');
    if (!response.ok) { toast.error(t('students.contacts.import.templateFailed')); return; }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'drais_contacts_import_template.xlsx'; anchor.click();
    URL.revokeObjectURL(url);
  }

  async function preview() {
    if (!file) return;
    setLoading(true); setError('');
    try {
      const form = new FormData(); form.append('file', file); form.append('mode', 'preview');
      const response = await fetch('/api/students/contacts', { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || t('students.contacts.import.validateFailed'));
      setRows(data.rows || []); setSummary(data.summary); setStep('review');
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('students.contacts.import.validateFailed')); }
    finally { setLoading(false); }
  }

  async function importRows() {
    if (!file || !summary || summary.ready === 0) return;
    setLoading(true); setError('');
    try {
      const form = new FormData(); form.append('file', file); form.append('mode', 'import');
      const response = await fetch('/api/students/contacts', { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || t('students.contacts.import.failed'));
      setRows(data.rows || []); setSummary(data.summary); setStep('complete'); onSuccess();
      toast.success(t('students.contacts.import.imported', { count: data.summary.imported }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('students.contacts.import.failed')); }
    finally { setLoading(false); }
  }

  function downloadFailedRows() {
    const failed = rows.filter((row) => row.status === 'invalid');
    const content = ['row,admission_no,phone,reason', ...failed.map((item) => `${item.row.rowNumber},${item.row.admissionNo},${item.row.phone},"${(item.reason || '').replace(/"/g, '""')}"`)].join('\n');
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'contact_import_failed_rows.csv'; anchor.click(); URL.revokeObjectURL(url);
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800">
        <div className="mb-5 flex items-center justify-between">
          <div><h2 className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white"><FileSpreadsheet className="h-5 w-5 text-emerald-600" /> {t('students.contacts.import.title')}</h2><p className="mt-1 text-sm text-gray-500">{t('students.contacts.import.subtitle')}</p></div>
          <button onClick={close} className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-slate-700"><X className="h-5 w-5" /></button>
        </div>

        {step === 'select' && <div className="space-y-5">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-100">
            {rich('students.contacts.import.columns', { ids: <strong>{t('students.contacts.import.columnsIds')}</strong>, phone: <strong>phone</strong> })}
          </div>
          <button onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300"><Download className="h-4 w-4" /> {t('students.contacts.import.downloadTemplate')}</button>
          <label className="block cursor-pointer rounded-xl border-2 border-dashed border-gray-300 p-10 text-center hover:border-emerald-400 dark:border-gray-600">
            <Upload className="mx-auto mb-3 h-9 w-9 text-gray-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('students.contacts.import.chooseFile')}</span>
            <p className="mt-1 text-xs text-gray-500">{t('students.contacts.import.fileHint')}</p>
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          </label>
          {file && <p className="text-sm text-emerald-700 dark:text-emerald-300">{t('students.contacts.import.selected', { name: file.name })}</p>}
          {error && <ErrorBox message={error} />}
          <div className="flex justify-end gap-3"><button onClick={close} className="rounded-lg bg-gray-100 px-4 py-2 text-sm dark:bg-slate-700">{t('students.contacts.cancel')}</button><button onClick={preview} disabled={!file || loading} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading && <Loader2 className="h-4 w-4 animate-spin" />} {t('students.contacts.import.validate')}</button></div>
        </div>}

        {(step === 'review' || step === 'complete') && summary && <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{[[t('students.contacts.import.stat.total'), summary.total], [t('students.contacts.import.stat.ready'), summary.ready], [t('students.contacts.import.stat.imported'), summary.imported], [t('students.contacts.import.stat.duplicates'), summary.duplicateFile + summary.duplicateExisting], [t('students.contacts.import.stat.invalid'), summary.invalid]].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-gray-50 p-3 text-center dark:bg-slate-700"><div className="text-xl font-bold text-gray-900 dark:text-white">{digits(value)}</div><div className="text-xs text-gray-500">{label}</div></div>)}</div>
          {step === 'review' && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">{t('students.contacts.import.reviewNote')}</div>}
          <div className="max-h-72 overflow-auto rounded-lg border dark:border-slate-600"><table className="w-full text-start text-xs"><thead className="sticky top-0 bg-gray-100 dark:bg-slate-700"><tr><th className="p-2">{t('students.contacts.import.col.row')}</th><th className="p-2">{t('students.contacts.import.col.learner')}</th><th className="p-2">{t('students.contacts.import.col.phone')}</th><th className="p-2">{t('students.contacts.import.col.status')}</th><th className="p-2">{t('students.contacts.import.col.reason')}</th></tr></thead><tbody>{rows.map((item) => <tr key={item.row.rowNumber} className="border-t dark:border-slate-700"><td className="p-2">{digits(item.row.rowNumber)}</td><td className="p-2">{item.row.contactFirstName} {item.row.contactLastName}</td><td className="p-2 font-mono">{digits(item.row.phone)}</td><td className="p-2 font-semibold">{t(`students.contacts.import.rowStatus.${item.status}`, String(item.status))}</td><td className="p-2 text-gray-500">{item.reason || t('students.contacts.import.readyToImport')}</td></tr>)}</tbody></table></div>
          {(invalidRows.length > 0 || duplicateRows.length > 0) && <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">{invalidRows.length > 0 && <button onClick={downloadFailedRows} className="inline-flex items-center gap-1 text-blue-600 hover:underline"><Download className="h-4 w-4" /> {t('students.contacts.import.downloadInvalid')}</button>}<span>{t('students.contacts.import.duplicatesSkipped', { count: duplicateRows.length })}</span></div>}
          {error && <ErrorBox message={error} />}
          <div className="flex justify-end gap-3"><button onClick={reset} disabled={loading} className="rounded-lg bg-gray-100 px-4 py-2 text-sm dark:bg-slate-700">{t('students.contacts.import.startOver')}</button>{step === 'review' ? <button onClick={importRows} disabled={summary.ready === 0 || loading} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading && <Loader2 className="h-4 w-4 animate-spin" />} {t('students.contacts.import.importN', { count: summary.ready })}</button> : <button onClick={close} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white"><CheckCircle className="h-4 w-4" /> {t('students.contacts.import.done')}</button>}</div>
        </div>}
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) { return <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{message}</div>; }
