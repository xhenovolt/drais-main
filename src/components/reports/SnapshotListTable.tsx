'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, XCircle, FileText, ArrowRight } from 'lucide-react';
import type { SnapshotRow, SnapshotType } from '@/lib/snapshots/types';

export interface SnapshotListTableProps {
  type: SnapshotType;
}

export function SnapshotListTable({ type }: SnapshotListTableProps) {
  const [rows, setRows]   = useState<SnapshotRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/snapshots/list?type=${encodeURIComponent(type)}`)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return;
        if (!json?.success) {
          setError(json?.error || 'Failed to load snapshots');
          setRows([]);
          return;
        }
        setRows(json.data || []);
      })
      .catch(e => {
        if (cancelled) return;
        setError(e?.message || 'Network error');
        setRows([]);
      });
    return () => { cancelled = true; };
  }, [type]);

  if (rows === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading snapshots…
      </div>
    );
  }
  if (error) {
    return <div className="text-sm text-rose-600 py-4">{error}</div>;
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm text-slate-500">
        No {type} snapshots yet. Click <b>Generate Report Snapshot</b> to create one.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
          <tr>
            <th className="text-left px-3 py-2">Snapshot</th>
            <th className="text-left px-3 py-2">Status</th>
            <th className="text-right px-3 py-2">Classes</th>
            <th className="text-right px-3 py-2">Students</th>
            <th className="text-right px-3 py-2">Results</th>
            <th className="text-left px-3 py-2">Generated</th>
            <th className="text-left px-3 py-2">Open</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.snapshotId} className="border-t border-slate-200 dark:border-slate-700">
              <td className="px-3 py-2 font-mono text-xs">
                <FileText className="inline w-3.5 h-3.5 mr-1 text-slate-400" />
                {r.snapshotId.slice(0, 8)}…
                {r.isLegacyFallback && <span className="ml-2 inline-block px-1.5 py-0.5 text-[10px] rounded bg-amber-100 text-amber-800">legacy</span>}
              </td>
              <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
              <td className="px-3 py-2 text-right">{r.classCount}</td>
              <td className="px-3 py-2 text-right">{r.studentCount}</td>
              <td className="px-3 py-2 text-right">{r.resultCount}</td>
              <td className="px-3 py-2 text-slate-500">{formatDate(r.generatedAt)}</td>
              <td className="px-3 py-2">
                {r.status === 'ready' ? (
                  <Link
                    href={`/academics/report-cards/${type}/${r.snapshotId}`}
                    className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                  >
                    View <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                ) : <span className="text-xs text-slate-400">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: SnapshotRow['status'] }) {
  if (status === 'ready') {
    return <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> ready</span>;
  }
  if (status === 'failed') {
    return <span className="inline-flex items-center gap-1 text-xs text-rose-600"><XCircle className="w-3.5 h-3.5" /> failed</span>;
  }
  return <span className="inline-flex items-center gap-1 text-xs text-amber-600"><Loader2 className="w-3.5 h-3.5 animate-spin" /> generating</span>;
}

function formatDate(s: string): string {
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}
