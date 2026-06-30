'use client';

/**
 * Finance → Import Fees. Upload an Excel/CSV of per-learner fees
 * (admission_no, item, amount) → preview → apply. Existing (learner, term, item)
 * fees are UPDATED, never duplicated.
 */
import React, { useCallback, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, CheckCircle, AlertTriangle, Loader2, ArrowRight } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';

type Step = 'upload' | 'map' | 'preview' | 'done';
const FIELDS = ['admission_no', 'item', 'amount'] as const;
type Field = typeof FIELDS[number];

function guessMap(headers: string[]): Record<Field, string> {
  const find = (...keys: string[]) => headers.find((h) => keys.some((k) => h.toLowerCase().replace(/[^a-z0-9]/g, '').includes(k))) || '';
  return {
    admission_no: find('admission', 'regno', 'studentno', 'pupilno'),
    item: find('item', 'fee', 'feename', 'description', 'particular'),
    amount: find('amount', 'fees', 'value', 'charge'),
  };
}

const TONE: Record<string, string> = {
  insert: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  update: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  not_found: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  invalid: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

export default function ImportFeesPage() {
  const { format } = useCurrency();
  const [step, setStep] = useState<Step>('upload');
  const [filename, setFilename] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileRows, setFileRows] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<Record<Field, string>>({} as any);
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
        const json = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        if (!json.length) { setError('No rows found in file'); return; }
        const hdrs = Object.keys(json[0]);
        setHeaders(hdrs); setFileRows(json); setMapping(guessMap(hdrs)); setFilename(file.name); setStep('map');
      } catch { setError('Could not parse file. Use .xlsx or .csv'); }
    };
    reader.readAsBinaryString(file);
  }, []);

  const buildRows = useCallback(() => fileRows.map((r) => ({
    admission_no: mapping.admission_no ? String(r[mapping.admission_no] ?? '').trim() : '',
    item: mapping.item ? String(r[mapping.item] ?? '').trim() : '',
    amount: mapping.amount ? Number(String(r[mapping.amount]).replace(/[^\d.-]/g, '')) : NaN,
  })), [fileRows, mapping]);

  const run = useCallback(async (commit: boolean) => {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/finance/import/fees', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rows: buildRows(), commit }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error || 'Failed'); return; }
      if (commit) { setResult(j); setStep('done'); } else { setPreview(j); setStep('preview'); }
    } finally { setBusy(false); }
  }, [buildRows]);

  const applicable = useMemo(() => (preview ? preview.inserted + preview.updated : 0), [preview]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><FileSpreadsheet className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Import Fees</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Upload per-learner fees (admission no · item · amount). Existing fees for the same learner & item this term are updated, not duplicated.</p>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 text-sm"><AlertTriangle className="w-4 h-4" />{error}</div>}

      {step === 'upload' && (
        <label className="block border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-10 text-center cursor-pointer hover:border-indigo-400">
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
          <p className="text-sm text-gray-600 dark:text-gray-300">Click to upload an .xlsx or .csv (columns: admission_no, item, amount)</p>
        </label>
      )}

      {step === 'map' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
          <p className="text-sm text-gray-500">{fileRows.length} rows in <span className="font-medium">{filename}</span></p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {FIELDS.map((f) => (
              <div key={f}>
                <label className="block text-xs text-gray-500 capitalize mb-1">{f.replace('_', ' ')}</label>
                <select value={mapping[f] || ''} onChange={(e) => setMapping((m) => ({ ...m, [f]: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm">
                  <option value="">—</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <button onClick={() => run(false)} disabled={busy || !mapping.admission_no || !mapping.item || !mapping.amount} className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />} Preview
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && preview && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {([['inserted', 'New'], ['updated', 'Updated'], ['notFound', 'Not found'], ['invalid', 'Invalid']] as const).map(([k, label]) => (
              <div key={k} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-center">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{preview[k]}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            ))}
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto max-h-[55vh]">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-500 sticky top-0"><tr><th className="px-3 py-2 text-left">Admission</th><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-left">Action</th></tr></thead>
              <tbody>
                {preview.preview.map((r: any, i: number) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-gray-700/50">
                    <td className="px-3 py-1.5 font-mono text-xs">{r.admission_no || '—'}</td>
                    <td className="px-3 py-1.5">{r.item || '—'}</td>
                    <td className="px-3 py-1.5 text-right">{Number.isFinite(r.amount) ? format(r.amount) : '—'}{r.old_amount != null && <span className="text-[11px] text-gray-400 ml-1">(was {format(r.old_amount)})</span>}</td>
                    <td className="px-3 py-1.5"><span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${TONE[r.action]}`}>{r.action}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between">
            <button onClick={() => setStep('map')} className="text-sm text-gray-500 hover:underline">← Back</button>
            <button onClick={() => run(true)} disabled={busy || applicable === 0} className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Apply {applicable} row{applicable === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 text-center space-y-3">
          <CheckCircle className="w-10 h-10 mx-auto text-green-500" />
          <p className="text-lg font-semibold text-gray-900 dark:text-white">{result.inserted} added · {result.updated} updated</p>
          {(result.notFound > 0 || result.invalid > 0) && <p className="text-sm text-amber-600">{result.notFound} not found · {result.invalid} invalid (skipped)</p>}
          <button onClick={() => { setStep('upload'); setPreview(null); setResult(null); setFileRows([]); }} className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold">Import another file</button>
        </div>
      )}
    </div>
  );
}
