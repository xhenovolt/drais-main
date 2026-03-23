"use client";
import React, { useState } from 'react';
import EnrolledStudentTable from '@/components/students/EnrolledStudentTable';
import AdmittedStudentTable from '@/components/students/AdmittedStudentTable';
import ModuleIntroCard from '@/components/onboarding/ModuleIntroCard';
import { UserCheck, Users } from 'lucide-react';
import clsx from 'clsx';

const TABS = [
  { key: 'enrolled', label: 'Enrolled',  icon: UserCheck,  desc: 'Students enrolled in the current term' },
  { key: 'admitted', label: 'Admitted',  icon: Users,      desc: 'Students admitted but not yet enrolled this term' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const StudentsListPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('enrolled');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900">
      <div className="container mx-auto px-4 pt-6">
        <ModuleIntroCard
          moduleId="students"
          icon="👩‍🎓"
          title="Students Module"
          description="Manage students by term. Admit new students, enroll them into classes each term, track their history, and promote them at year-end."
          actions={[
            { label: 'Admit Student', href: '/students/admit', primary: true },
            { label: 'Enroll Student', href: '/students/enroll', primary: false },
          ]}
          learnMoreHref="/documentation/admitting-students"
          tip="Admit a student once, then enroll them each term."
        />
      </div>

      {/* Tab bar */}
      <div className="container mx-auto px-4 mt-4">
        <div className="flex items-center gap-1 p-1 bg-white/70 dark:bg-slate-800/70 backdrop-blur rounded-xl w-fit shadow-sm border border-slate-200/60 dark:border-slate-700/60">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all',
                  active
                    ? 'bg-[var(--color-primary)] text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 ml-1">
          {TABS.find(t => t.key === activeTab)?.desc}
        </p>
      </div>

      {/* Tab panels */}
      <div className={activeTab === 'enrolled' ? 'block' : 'hidden'}>
        <EnrolledStudentTable />
      </div>
      <div className={activeTab === 'admitted' ? 'block' : 'hidden'}>
        <AdmittedStudentTable />
      </div>
    </div>
  );
};

export default StudentsListPage;

