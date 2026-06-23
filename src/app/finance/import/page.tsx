'use client';

/**
 * Finance import / reconciliation wizard.
 * Upload Excel/CSV → pick source + type → map columns → preview (match/dedup)
 * → commit. Parsing is client-side; matching/dedup/commit are server-side
 * through /api/finance/import/* (canonical payment path).
 */
import React, { useCallback, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, CheckCircle, AlertTriangle, Loader2, ArrowRight } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';

type Step = 'upload' | 'map' | 'preview' | 'done';
const FIELDS = ['admission_no', 'student_name', 'amount', 'reference', 'payment_date', 'method'] as const;
type Field = typeof FIELDS[number];

const SOURCES = [
  { id: 'manual_excel', label: 'Manual Excel' },
  { id: 'schoolpay', label: 'School Pay' },
  { id: 'surepay', label: 'SurePay' },
  { id: 'bank', label: 'Bank statement' },
  { id: 'mobile_money', label: 'Mobile money' },
  { id: 'custom', label: 'Custom' },
];

function guessMap(headers: string[]): Record<Field, string> {
  const m = {} as Record<Field, string>;
  const find = (...keys: string[]) =>
    headers.find((h) => keys.some((k) => h.toLowerCase().replace(/[^a-z0-9]/g, '').includes(k))) || '';
  m.admission_no = find('admission', 'regno', 'studentno', 'pupilno');
  m.student_name = find('name', 'student', 'pupil');
  m.amount = find('amount', 'amountpaid', 'paid', 'credit', 'value');
  m.reference = find('reference', 'ref', 'txnid', 'transactionid', 'receipt');
  m.payment_date = find('date', 'paymentdate', 'txndate');
  m.method = find('method', 'channel', 'mode', 'paymentmethod');
  return m;
}

const STATUS_TONE: Record<string, string> = {
  matched: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  ambiguous: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  unmatched: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  duplicate: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

export default function FinanceImportPage() {
  const { format } = useCurrency();
  const [step, setStep] = useState<Step>('upload');
  const [filename, setFilename] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileRows, setFileRows] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<Record<Field, string>>({} as any);
  const [sourceSystem, setSourceSystem] = useState('manual_excel');
  const [importType, setImportType] = useState<'payments' | 'opening_balances'>('payments');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [result, setResult] = useState<any>(null);

  const onFile = useCallback((file: File) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
        if (!json.length) { setError('No rows found in file'); return; }
        const hdrs = Object.keys(json[0]);
        setHeaders(hdrs);
        setFileRows(json);
        setMapping(guessMap(hdrs));
        setFilename(file.name);
        setStep('map');
      } catch {
        setError('Could not parse file. Use .xlsx or .csv');
      }
    };
    reader.readAsBinaryString(file);
  }, []);

  const buildRows = useCallback(() => {
    return fileRows.map((r, i) => ({
      row_no: i + 1,
      admission_no: mapping.admission_no ? String(r[mapping.admission_no] ?? '').trim() : null,
      student_name: mapping.student_name ? String(r[mapping.student_name] ?? '').trim() : null,
      amount: mapping.amount ? Number(String(r[mapping.amount]).replace(/[^\d.-]/g, '')) : null,
      reference: mapping.reference ? String(r[mapping.reference] ?? '').trim() : null,
      payment_date: mapping.payment_date ? String(r[mapping.payment_date] ?? '').trim() || null : null,
      method: mapping.method ? String(r[mapping.method] ?? '').trim() : null,
      raw: r,
    }));
  }, [fileRows, mapping]);

  const doPreview = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/finance/import/preview', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceSystem, importType, filename, rows: buildRows() }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error || 'Preview failed'); return; }
      setPreview(j); setStep('preview');
    } finally { setBusy(false); }
  }, [sourceSystem, importType, filename, buildRows]);

  const patchRow = useCallback(async (rowId: number, patch: any, idx: number) => {
    await fetch(`/api/finance/import/${preview.batchId}?row=${rowId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch),
    });
    setPreview((p: any) => {
      const rows = [...p.rows];
      rows[idx] = { ...rows[idx], ...patch };
      return { ...p, rows };
    });
  }, [preview]);

  const doCommit = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/finance/import/commit', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ batchId: preview.batchId }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error || 'Commit failed'); return; }
      setResult(j); setStep('done');
    } finally { setBusy(false); }
  }, [preview]);

  const importable = useMemo(
    () => preview?.rows?.filter((r: any) => r.action === 'import' && r.matched_student_id).length ?? 0,
    [preview],
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><FileSpreadsheet className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Finance Import</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Import payments or opening balances from Excel / School Pay / SurePay / bank / mobile money.</p>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 text-sm"><AlertTriangle className="w-4 h-4" />{error}</div>}

      {/* STEP: upload */}
      {step === 'upload' && (
        <label className="block border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-10 text-center cursor-pointer hover:border-indigo-400">
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
          <p className="text-sm text-gray-600 dark:text-gray-300">Click to upload an .xlsx or .csv file</p>
        </label>
      )}

      {/* STEP: map */}
      {step === 'map' && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
            <p className="text-sm text-gray-500">{fileRows.length} rows in <span className="font-medium">{filename}</span></p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Source system</label>
                <select value={sourceSystem} onChange={(e) => setSourceSystem(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm">
                  {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Import type</label>
                <select value={importType} onChange={(e) => setImportType(e.target.value as any)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm">
                  <option value="payments">Payment history</option>
                  <option value="opening_balances">Opening balances</option>
                </select>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Map columns</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {FIELDS.map((f) => (
                  <div key={f} className="flex items-center gap-2">
                    <span className="text-xs w-28 text-gray-500 capitalize">{f.replace('_', ' ')}</span>
                    <select value={mapping[f] || ''} onChange={(e) => setMapping((m) => ({ ...m, [f]: e.target.value }))} className="flex-1 px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm">
                      <option value="">—</option>
                      {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">Learners are matched by admission number first; name matches always require review.</p>
            </div>
            <div className="flex justify-end">
              <button onClick={doPreview} disabled={busy || (!mapping.admission_no && !mapping.student_name)} className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />} Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP: preview */}
      {step === 'preview' && preview && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {(['total', 'matched', 'ambiguous', 'unmatched', 'duplicate'] as const).map((k) => (
              <div key={k} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-center">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{preview.summary[k]}</p>
                <p className="text-xs text-gray-500 capitalize">{k}</p>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-500">
                <tr><th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Admission</th><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-left">Ref</th><th className="px-3 py-2 text-left">Match</th><th className="px-3 py-2 text-left">Action</th></tr>
              </thead>
              <tbody>
                {preview.rows.map((r: any, idx: number) => {
                  const matched = r.matched_student_id ? preview.studentsById?.[r.matched_student_id] : null;
                  const cands: number[] = r.candidates_json || [];
                  return (
                    <tr key={idx} className="border-t border-gray-100 dark:border-gray-700/50">
                      <td className="px-3 py-2">{r.row_no}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.admission_no || '—'}</td>
                      <td className="px-3 py-2">{matched?.name || r.student_name || '—'}{r.error && <span className="block text-[11px] text-red-500">{r.error}</span>}</td>
                      <td className="px-3 py-2 text-right">{r.amount != null ? format(r.amount) : '—'}</td>
                      <td className="px-3 py-2 text-xs">{r.reference || '—'}</td>
                      <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_TONE[r.match_status]}`}>{r.match_status}</span></td>
                      <td className="px-3 py-2">
                        {r.match_status === 'duplicate' ? <span className="text-xs text-gray-400">skipped</span> : (
                          <div className="flex items-center gap-1">
                            {r.match_status === 'ambiguous' && cands.length > 1 && (
                              <select defaultValue="" onChange={(e) => patchRow(r.id, { matched_student_id: Number(e.target.value), action: 'import' }, idx)} className="px-1 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs">
                                <option value="" disabled>pick…</option>
                                {cands.map((c) => <option key={c} value={c}>{preview.studentsById?.[c]?.name || `#${c}`}</option>)}
                              </select>
                            )}
                            <button onClick={() => patchRow(r.id, { action: r.action === 'import' ? 'skip' : 'import' }, idx)} disabled={!r.matched_student_id} className={`px-2 py-1 rounded text-xs font-medium disabled:opacity-40 ${r.action === 'import' ? 'bg-green-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
                              {r.action === 'import' ? 'import' : 'skip'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <button onClick={() => setStep('map')} className="text-sm text-gray-500 hover:underline">← Back to mapping</button>
            <button onClick={doCommit} disabled={busy || importable === 0} className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Commit {importable} row{importable === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}

      {/* STEP: done */}
      {step === 'done' && result && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 text-center space-y-3">
          <CheckCircle className="w-10 h-10 mx-auto text-green-500" />
          <p className="text-lg font-semibold text-gray-900 dark:text-white">Imported {result.committed} payment{result.committed === 1 ? '' : 's'}</p>
          {result.errors?.length > 0 && <p className="text-sm text-red-600">{result.errors.length} row(s) failed — see batch detail.</p>}
          <button onClick={() => { setStep('upload'); setPreview(null); setResult(null); setFileRows([]); }} className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold">Import another file</button>
        </div>
      )}
    </div>
  );
}
