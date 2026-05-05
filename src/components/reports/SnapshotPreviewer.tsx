'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Printer, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReportSnapshot } from '@/lib/snapshots/types';

export interface SnapshotPreviewerProps {
  snapshot: ReportSnapshot;
}

/**
 * Class-paginated snapshot preview.
 *
 * Embeds the deterministic emergency-template print route as an <iframe>.
 * DRCE-skinned rendering arrives in M7 — until then the preview matches
 * the print output exactly so what users see equals what they print.
 */
export function SnapshotPreviewer({ snapshot }: SnapshotPreviewerProps) {
  const [classIdx, setClassIdx] = useState<number>(0);
  const printBase = `/academics/report-cards/${snapshot.meta.type}/${snapshot.meta.snapshotId}/print`;

  const classes = snapshot.classes;
  const cls     = classes[classIdx];

  const previewSrc = useMemo(() => {
    if (!cls) return printBase;
    return `${printBase}?class_id=${classIdx}`;
  }, [printBase, classIdx, cls]);

  if (classes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm text-slate-500">
        This snapshot contains no classes.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-3 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setClassIdx(i => Math.max(0, i - 1))}
            disabled={classIdx === 0}
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30"
            aria-label="Previous class"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <select
            value={classIdx}
            onChange={e => setClassIdx(Number(e.target.value))}
            className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm"
          >
            {classes.map((c, i) => (
              <option key={c.classId} value={i}>
                {c.className} ({c.students.length} students)
              </option>
            ))}
          </select>
          <button
            onClick={() => setClassIdx(i => Math.min(classes.length - 1, i + 1))}
            disabled={classIdx === classes.length - 1}
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30"
            aria-label="Next class"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <Link
          href={`${printBase}?class_id=${classIdx}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm bg-blue-600 text-white hover:bg-blue-700"
        >
          <Printer className="w-4 h-4" /> Print this class
        </Link>
      </div>
      <iframe
        key={previewSrc}
        src={previewSrc}
        title={`Snapshot preview — ${cls?.className}`}
        className="w-full"
        style={{ height: '80vh', minHeight: 600, border: 0 }}
      />
    </div>
  );
}
