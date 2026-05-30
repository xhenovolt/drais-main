'use client';
import Link from 'next/link';
import { History } from 'lucide-react';
import { SubjectAllocationsManager } from '@/components/academics/SubjectAllocationsManager';
import { useI18n } from '@/components/i18n/I18nProvider';

export default function SubjectAllocationsPage() {
  const { t } = useI18n();
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{`${t('people.teachers')} — ${t('academic.subjects')}`}</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {`${t('academic.teacherInitials')} · ${t('snapshot.reportCard')}`}
          </p>
        </div>
        <Link
          href="/academics/allocations/history"
          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <History className="w-3.5 h-3.5" /> {t('nav.students.history')}
        </Link>
      </div>
      <SubjectAllocationsManager />
    </div>
  );
}
