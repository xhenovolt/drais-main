'use client';
import { useState } from 'react';
import Link from 'next/link';
import { History, Grid3x3, Users, ShieldAlert } from 'lucide-react';
import { SubjectAllocationsManager } from '@/components/academics/SubjectAllocationsManager';
import { MultiTeacherPanel } from '@/components/academics/MultiTeacherPanel';
import { AllocationWarnings } from '@/components/academics/AllocationWarnings';
import { Tabs } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';

export default function SubjectAllocationsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<'matrix' | 'teachers' | 'warnings'>('matrix');
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

      <Tabs
        activeTab={tab}
        onTabChange={(id) => setTab(id as typeof tab)}
        tabs={[
          { id: 'matrix', label: 'Class matrix', icon: Grid3x3 },
          { id: 'teachers', label: 'Multiple teachers', icon: Users },
          { id: 'warnings', label: 'Warnings', icon: ShieldAlert },
        ]}
      />

      {tab === 'matrix' && <SubjectAllocationsManager />}
      {tab === 'teachers' && <MultiTeacherPanel />}
      {tab === 'warnings' && <AllocationWarnings />}
    </div>
  );
}
