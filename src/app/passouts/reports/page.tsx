'use client';

/** Pass-out & visitation reports — tabbed datasets with Excel + PDF export. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
// xlsx dynamically imported in exportExcel (below) — keeps it out of the eager graph.
import { BarChart3, Loader2, Download, Printer } from 'lucide-react';

const TABS: { key: string; label: string }[] = [
  { key: 'out_today', label: 'Out today' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'by_reason', label: 'By reason' },
  { key: 'by_officer', label: 'By officer' },
  { key: 'denied', label: 'Denied attempts' },
  { key: 'visitation', label: 'Visitation logs' },
  { key: 'unknown_cards', label: 'Unknown cards' },
];

export default function PassoutReportsPage() {
  const [tab, setTab] = useState('out_today');
  const [data, setData] = useState<{ columns: string[]; rows: any[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch(`/api/passouts/reports?type=${tab}`, { cache: 'no-store' }); const j = await r.json(); setData({ columns: j.columns || [], rows: j.rows || [] }); }
    finally { setLoading(false); }
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  const label = useMemo(() => TABS.find((t) => t.key === tab)?.label || tab, [tab]);

  const exportExcel = useCallback(async () => {
    if (!data?.rows.length) return;
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(data.rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, label.slice(0, 28));
    XLSX.writeFile(wb, `passouts-${tab}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }, [data, tab, label]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><BarChart3 className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
          <div><h1 className="text-xl font-bold text-gray-900 dark:text-white">Pass-out Reports</h1><p className="text-sm text-gray-500">{label} · {data?.rows.length ?? 0} rows</p></div>
        </div>
        <div className="flex items-center gap-2 no-print">
          <button onClick={exportExcel} disabled={!data?.rows.length} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm disabled:opacity-50"><Download className="w-4 h-4" /> Excel</button>
          <button onClick={() => window.print()} disabled={!data?.rows.length} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm disabled:opacity-50"><Printer className="w-4 h-4" /> PDF</button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-print">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap font-medium ${tab === t.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>{t.label}</button>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
        {loading ? <div className="py-12 text-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin inline" /></div> : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-500"><tr>{(data?.columns || []).map((c) => <th key={c} className="px-3 py-2 text-left capitalize whitespace-nowrap">{c.replace(/_/g, ' ')}</th>)}</tr></thead>
            <tbody>
              {(!data?.rows.length) && <tr><td colSpan={data?.columns.length || 1} className="px-3 py-8 text-center text-gray-400">No data.</td></tr>}
              {data?.rows.map((r, i) => (
                <tr key={i} className="border-t border-gray-100 dark:border-gray-700/50">
                  {data.columns.map((c) => <td key={c} className="px-3 py-1.5 whitespace-nowrap">{fmtCell(r[c])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function fmtCell(v: any): string {
  if (v == null) return '—';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString();
  return String(v);
}
