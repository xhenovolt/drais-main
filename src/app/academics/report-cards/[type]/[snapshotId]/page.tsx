'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
import { SnapshotSummaryCard } from '@/components/reports/SnapshotSummaryCard';
import { SnapshotPreviewer } from '@/components/reports/SnapshotPreviewer';
import type { ReportSnapshot, SnapshotType } from '@/lib/snapshots/types';
import { useI18n } from '@/components/i18n/I18nProvider';
import { uiIsArabic, isEnglishText } from '@/lib/toast';

interface PageProps {
  params: Promise<{ type: string; snapshotId: string }>;
}

const VALID_TYPES: SnapshotType[] = ['theology', 'secular', 'mixed'];

export default function SnapshotPreviewPage({ params }: PageProps) {
  const { type, snapshotId } = use(params);
  const { t, rich } = useI18n();
  const [reloadKey, setReloadKey] = useState(0);
  const isValidType = VALID_TYPES.includes(type as SnapshotType);

  const [snapshot, setSnapshot] = useState<ReportSnapshot | null>(null);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    if (!isValidType) {
      setError(t('academicsPages.snapshotView.invalidType', { type }));
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
          setError(t('academicsPages.snapshotView.payloadMissing', "Snapshot payload missing"));
          return;
        }
        setSnapshot(json.snapshot as ReportSnapshot);
      })
      .catch(e => {
        if (cancelled) return;
        const m = e?.message;
        setError(m && !(uiIsArabic() && isEnglishText(m)) ? m : t('academicsPages.snapshotView.loadFailed', "Failed to load snapshot"));
      });
    return () => { cancelled = true; };
  }, [snapshotId, isValidType, type, reloadKey]);

  const backHref = isValidType ? `/academics/report-cards/${type}` : '/academics/report-cards';

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="w-4 h-4 rtl:-scale-x-100" /> {t('academicsPages.snapshotView.back', "Back")}
      </Link>

      {!snapshot && !error && (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-12">
          <Loader2 className="w-4 h-4 animate-spin" /> {t('academicsPages.snapshotView.loading', "Loading snapshot…")}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-900 p-4 flex items-start gap-2 text-sm text-rose-700 dark:text-rose-300">
          <AlertTriangle className="w-4 h-4 mt-0.5" />
          <div>
            <div className="font-semibold">{t('academicsPages.snapshotView.couldNotLoad', "Could not load snapshot")}</div>
            <div>{error}</div>
          </div>
        </div>
      )}

      {snapshot && snapshot.meta.type !== type && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-200">
          {rich('academicsPages.snapshotView.typeMismatch', { actual: <b>{t(`academicsPages.snapshotView.type.${snapshot.meta.type}`, String(snapshot.meta.type))}</b>, wanted: <b>{t(`academicsPages.snapshotView.type.${type}`, String(type))}</b> })}
        </div>
      )}

      {snapshot && (
        <>
          <SnapshotSummaryCard snapshot={snapshot} />
          <SnapshotPreviewer snapshot={snapshot} onSnapshotChanged={() => setReloadKey(k => k + 1)} />
        </>
      )}
    </div>
  );
}
