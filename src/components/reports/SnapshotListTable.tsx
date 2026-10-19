'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, XCircle, FileText, ArrowRight } from 'lucide-react';
import type { SnapshotRow, SnapshotType } from '@/lib/snapshots/types';
import { useI18n } from '@/components/i18n/I18nProvider';
import { uiIsArabic, isEnglishText } from '@/lib/toast';

export interface SnapshotListTableProps {
  type: SnapshotType;
}

export function SnapshotListTable({ type }: SnapshotListTableProps) {
  const { t, rich, digits, formatDate } = useI18n();
  const when = (s: string) => { const d = new Date(s); return isNaN(d.getTime()) ? s : formatDate(d, 'datetime'); };
  const [rows, setRows]   = useState<SnapshotRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/snapshots/list?type=${encodeURIComponent(type)}`)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return;
        if (!json?.success) {
          const m = json?.error;
          setError(m && !(uiIsArabic() && isEnglishText(m)) ? m : t('academicsPages.reportCards.loadFailed', "Failed to load snapshots"));
          setRows([]);
          return;
        }
        setRows(json.data || []);
      })
      .catch(e => {
        if (cancelled) return;
        setError(t('academicsPages.reportCards.network', "Network error"));
        setRows([]);
      });
    return () => { cancelled = true; };
  }, [type]);

  if (rows === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-6">
        <Loader2 className="w-4 h-4 animate-spin" /> {t('academicsPages.reportCards.loading', "Loading snapshots…")}
      </div>
    );
  }
  if (error) {
    return <div className="text-sm text-rose-600 py-4">{error}</div>;
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm text-slate-500">
        {rich(type === 'theology' ? 'academicsPages.reportCards.empty.theology' : 'academicsPages.reportCards.empty.secular', { btn: <b>{t('academicsPages.results.snapshot', 'Generate Report Snapshot')}</b> })}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
          <tr>
            <th className="text-start px-3 py-2">{t('academicsPages.reportCards.col.snapshot', "Snapshot")}</th>
            <th className="text-start px-3 py-2">{t('academicsPages.reportCards.col.status', "Status")}</th>
            <th className="text-start px-3 py-2">{t('academicsPages.reportCards.col.term', "Term & assessment")}</th>
            <th className="text-start px-3 py-2">{t('academicsPages.reportCards.col.classes', "Classes")}</th>
            <th className="text-end px-3 py-2">{t('academicsPages.reportCards.col.students', "Students")}</th>
            <th className="text-end px-3 py-2">{t('academicsPages.reportCards.col.results', "Results")}</th>
            <th className="text-start px-3 py-2">{t('academicsPages.reportCards.col.generated', "Generated")}</th>
            <th className="text-start px-3 py-2">{t('academicsPages.reportCards.col.open', "Open")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.snapshotId} className="border-t border-slate-200 dark:border-slate-700">
              <td className="px-3 py-2 font-mono text-xs">
                <FileText className="inline w-3.5 h-3.5 me-1 text-slate-400" />
                {r.snapshotId.slice(0, 8)}…
                {r.isLegacyFallback && <span className="ms-2 inline-block px-1.5 py-0.5 text-[10px] rounded bg-amber-100 text-amber-800">{t('academicsPages.reportCards.legacy', "legacy")}</span>}
              </td>
              <td className="px-3 py-2"><StatusBadge status={r.status} t={t} /></td>
              {/* Term + assessment. Without these, every ALBAYAN snapshot in
                  this table reads "secular · ready" with no way to tell Term II
                  Mid Term from Term III End of Term — different documents, both
                  of which go home to parents. */}
              <td className="px-3 py-2">
                <div>{r.termName ?? t('academicsPages.reportCards.termN', { id: r.termId })}</div>
                <div className="text-xs text-slate-500">
                  {r.resultTypeName ?? (r.resultTypeId ? t('academicsPages.reportCards.typeN', { id: r.resultTypeId }) : t('academicsPages.reportCards.allAssessments', "All assessments"))}
                  {r.yearName ? ` · ${digits(String(r.yearName))}` : ''}
                </div>
              </td>
              {/* The NAMES, not just the count. Five ALBAYAN snapshots read
                  identically as "secular · ready · 1" while being PRIMARY ONE
                  through SIX — and the actions on this row (flush, regenerate,
                  publish) are destructive or parent-visible. */}
              <td className="px-3 py-2">
                {r.classNames?.length ? (
                  <span title={r.classNames.join(', ')}>
                    {r.classNames.slice(0, 2).join(', ')}
                    {r.classNames.length > 2 && (
                      <span className="text-slate-500"> {t('academicsPages.reportCards.more', { n: r.classNames.length - 2 })}</span>
                    )}
                  </span>
                ) : (
                  <span className="text-slate-400">{t('academicsPages.reportCards.classes', { count: r.classCount ?? 0 })}</span>
                )}
              </td>
              <td className="px-3 py-2 text-end">{digits(r.studentCount ?? 0)}</td>
              <td className="px-3 py-2 text-end">{digits(r.resultCount ?? 0)}</td>
              <td className="px-3 py-2 text-slate-500">{when(r.generatedAt)}</td>
              <td className="px-3 py-2">
                {r.status === 'ready' ? (
                  <Link
                    href={`/academics/report-cards/${type}/${r.snapshotId}`}
                    className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                  >
                    {t('academicsPages.reportCards.view', "View")} <ArrowRight className="w-3.5 h-3.5 rtl:-scale-x-100" />
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

function StatusBadge({ status, t }: { status: SnapshotRow['status']; t: (k: string, f?: string) => string }) {
  if (status === 'ready') {
    return <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> {t('academicsPages.reportCards.st.ready', 'ready')}</span>;
  }
  if (status === 'failed') {
    return <span className="inline-flex items-center gap-1 text-xs text-rose-600"><XCircle className="w-3.5 h-3.5" /> {t('academicsPages.reportCards.st.failed', 'failed')}</span>;
  }
  return <span className="inline-flex items-center gap-1 text-xs text-amber-600"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('academicsPages.reportCards.st.generating', 'generating')}</span>;
}
