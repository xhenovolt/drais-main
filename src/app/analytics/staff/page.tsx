'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Briefcase } from 'lucide-react';

// recharts is heavy and has no business in this route's server compile pass —
// same treatment as /dashboard/analytics.
const StaffAnalytics = dynamic(() => import('@/components/analytics/StaffAnalytics'), {
  ssr: false,
  loading: () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
    </div>
  ),
});

export default function AnalyticsStaffPage() {
  return (
    <div className="p-6 space-y-6">
      <header className="flex items-start gap-3">
        <span className="rounded-xl bg-blue-50 p-2 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
          <Briefcase className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Staff analytics
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Headcount by position, salary payments, and who is owed.
          </p>
        </div>
      </header>

      <StaffAnalytics />
    </div>
  );
}
