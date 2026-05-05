'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
import { SnapshotSummaryCard } from '@/components/reports/SnapshotSummaryCard';
import { SnapshotPreviewer } from '@/components/reports/SnapshotPreviewer';
import type { ReportSnapshot, SnapshotType } from '@/lib/snapshots/types';

interface PageProps {
  params: Promise<{ type: string; snapshotId: string }>;
}

const VALID_TYPES: SnapshotType[] = ['theology', 'secular', 'mixed'];

export default function SnapshotPreviewPage({ params }: PageProps) {
  const { type, snapshotId } = use(params);
  const isValidType = VALID_TYPES.includes(type as SnapshotType);

  const [snapshot, setSnapshot] = useState<ReportSnapshot | null>(null);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    if (!isValidType) {
      setError(`Invalid type "${type}"`);
      return;
    }
    let cancelled = false;
    fetch(`/api/snapshots/${encodeURIComponent(snapshotId)}`)
      .then(async r => {
        const json = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(json?.error || `HTTP ${r.status}`);
        return json;
      })
      .then(json => {
        if (cancelled) return;
        if (!json?.snapshot) {
          setError('Snapshot payload missing');
          return;
        }
        setSnapshot(json.snapshot as ReportSnapshot);
      })
      .catch(e => {
        if (cancelled) return;
        setError(e?.message || 'Failed to load snapshot');
      });
    return () => { cancelled = true; };
  }, [snapshotId, isValidType, type]);

  const backHref = isValidType ? `/academics/report-cards/${type}` : '/academics/report-cards';

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      {!snapshot && !error && (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-12">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading snapshot…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-900 p-4 flex items-start gap-2 text-sm text-rose-700 dark:text-rose-300">
          <AlertTriangle className="w-4 h-4 mt-0.5" />
          <div>
            <div className="font-semibold">Could not load snapshot</div>
            <div>{error}</div>
          </div>
        </div>
      )}

      {snapshot && snapshot.meta.type !== type && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-200">
          This snapshot was generated as <b>{snapshot.meta.type}</b>, not <b>{type}</b>.
        </div>
      )}

      {snapshot && (
        <>
          <SnapshotSummaryCard snapshot={snapshot} />
          <SnapshotPreviewer snapshot={snapshot} />
        </>
      )}
    </div>
  );
}
