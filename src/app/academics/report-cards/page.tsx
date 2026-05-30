'use client';

import Link from 'next/link';
import { FileText, GraduationCap, BookOpen, Settings2 } from 'lucide-react';
import { SnapshotListTable } from '@/components/reports/SnapshotListTable';
import { useI18n } from '@/components/i18n/I18nProvider';

export default function ReportCardsLandingPage() {
  const { t } = useI18n();
  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <FileText className="w-6 h-6" /> {t('snapshot.reportCards')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {`${t('snapshot.snapshots')} · ${t('academicTime.term')}`}
          </p>
        </div>
        <Link
          href="/academics/report-cards/manage"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <Settings2 className="w-4 h-4" /> {`${t('actions.edit')} — ${t('snapshot.snapshots')}`}
        </Link>
      </header>

      <div className="grid sm:grid-cols-2 gap-4">
        <Link
          href="/academics/report-cards/secular"
          className="block rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 hover:shadow-md hover:border-blue-400 transition"
        >
          <GraduationCap className="w-7 h-7 text-blue-600 mb-2" />
          <div className="font-semibold text-lg">{`${t('reportCard.academicReport')}`}</div>
          <div className="text-sm text-slate-500 mt-1">
            {`${t('academic.subjects')} · ${t('academic.grade')} · ${t('academic.position')}`}
          </div>
        </Link>

        <Link
          href="/academics/report-cards/theology"
          className="block rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 hover:shadow-md hover:border-emerald-400 transition"
        >
          <BookOpen className="w-7 h-7 text-emerald-600 mb-2" />
          <div className="font-semibold text-lg">{`${t('subjects.ire')} — ${t('snapshot.reportCards')}`}</div>
          <div className="text-sm text-slate-500 mt-1">
            {`${t('subjects.tahfiz')} · ${t('subjects.quran')}`}
          </div>
        </Link>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{`${t('drce.recent')} — ${t('snapshot.snapshots')}`}</h2>
        <SnapshotListTable type="secular" />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{`${t('drce.recent')} — ${t('subjects.ire')}`}</h2>
        <SnapshotListTable type="theology" />
      </section>
    </div>
  );
}
