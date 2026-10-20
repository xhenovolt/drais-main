'use client';

import Link from 'next/link';
import { CalendarClock, Hash, Users, BookMarked, GraduationCap, Printer, FileJson, ExternalLink } from 'lucide-react';
import type { ReportSnapshot } from '@/lib/snapshots/types';
import { useI18n } from '@/components/i18n/I18nProvider';

export interface SnapshotSummaryCardProps {
  snapshot: ReportSnapshot;
}

export function SnapshotSummaryCard({ snapshot }: SnapshotSummaryCardProps) {
  const m = snapshot.meta;
  const { t, digits, formatDate } = useI18n();
  const when = (s: string) => { const d = new Date(s); return isNaN(d.getTime()) ? s : formatDate(d, 'datetime'); };
  const printBase = `/academics/report-cards/${m.type}/${m.snapshotId}/print`;
  const jsonHref  = `/api/snapshots/${m.snapshotId}`;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">{t('academicsPages.snapshotView.sum.kind', { type: t(`academicsPages.snapshotView.type.${m.type}`, String(m.type)) })}</div>
          <div className="text-lg font-semibold">
            {m.schoolName} — {m.termName} {digits(String(m.yearName ?? ''))}
          </div>
          {m.resultTypeName && (
            <div className="text-sm text-slate-500">{m.resultTypeName}</div>
          )}
        </div>
        <div dir="ltr" className="text-xs font-mono text-slate-400 break-all">{m.snapshotId}</div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat icon={<GraduationCap className="w-4 h-4" />} label={t('academicsPages.snapshotView.sum.classes', "Classes")}  value={m.sourceCounts.classes} />
        <Stat icon={<Users className="w-4 h-4" />}         label={t('academicsPages.snapshotView.sum.students', "Students")} value={m.sourceCounts.students} />
        <Stat icon={<BookMarked className="w-4 h-4" />}    label={t('academicsPages.snapshotView.sum.subjects', "Subjects")} value={m.sourceCounts.subjects} />
        <Stat icon={<Hash className="w-4 h-4" />}          label={t('academicsPages.snapshotView.sum.results', "Results")}  value={m.sourceCounts.results} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
        <div className="text-xs text-slate-500 flex items-center gap-1">
          <CalendarClock className="w-3.5 h-3.5" />
          {t('academicsPages.snapshotView.sum.generated', { when: when(m.generatedAt), ms: m.generationDurationMs ?? 0, hash: String(m.dataHash ?? '').slice(0, 12) })}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={printBase}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm bg-blue-600 text-white hover:bg-blue-700"
            target="_blank"
            rel="noreferrer"
          >
            <Printer className="w-4 h-4" /> {t('academicsPages.snapshotView.sum.printAll', "Print all")}
          </Link>
          <Link
            href={jsonHref}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100"
            target="_blank"
            rel="noreferrer"
          >
            <FileJson className="w-4 h-4" /> {t('academicsPages.snapshotView.sum.json', "Open JSON")}
          </Link>
          <Link
            href={printBase}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100"
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="w-4 h-4" /> {t('academicsPages.snapshotView.sum.printView', "Open print view")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  const { digits } = useI18n();
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
      <div className="text-xs text-slate-500 flex items-center gap-1">{icon}{label}</div>
      <div className="text-xl font-semibold">{digits(value ?? 0)}</div>
    </div>
  );
}

