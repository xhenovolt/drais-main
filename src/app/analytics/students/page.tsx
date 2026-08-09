'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { Users, BarChart3, UserPlus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

// Both components existed already and were rendered nowhere. Loaded client-only
// so recharts stays out of this route's compile pass.
const skeleton = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
      ))}
    </div>
    <div className="h-80 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
  </div>
);

const EnrollmentAnalytics = dynamic(
  () => import('@/components/analytics/EnrollmentAnalytics'),
  { ssr: false, loading: skeleton },
);
const StudentPerformanceAnalytics = dynamic(
  () => import('@/components/analytics/StudentPerformanceAnalytics'),
  { ssr: false, loading: skeleton },
);

type Tab = 'enrollment' | 'performance';

const TABS: { id: Tab; label: string; icon: React.ComponentType<any>; hint: string }[] = [
  { id: 'enrollment', label: 'Enrolment', icon: UserPlus, hint: 'Intake, retention, age and location' },
  { id: 'performance', label: 'Performance', icon: BarChart3, hint: 'Results, subjects and learners at risk' },
];

export default function AnalyticsStudentsPage() {
  const { user } = useAuth();
  const schoolId = user?.schoolId?.toString() ?? '';
  const [tab, setTab] = useState<Tab>('enrollment');

  const active = TABS.find((t) => t.id === tab)!;

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-start gap-3">
        <span className="rounded-xl bg-violet-50 p-2 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400">
          <Users className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Student analytics
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{active.hint}</p>
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Student analytics views"
        className="inline-flex gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = t.id === tab;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300'
                  : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'enrollment' ? (
        <EnrollmentAnalytics schoolId={schoolId} />
      ) : (
        <StudentPerformanceAnalytics schoolId={schoolId} />
      )}
    </div>
  );
}
