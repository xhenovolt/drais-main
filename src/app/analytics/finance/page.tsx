'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Scale } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

// FinanceAnalytics already existed in full (320 lines of charts against
// /api/analytics/finance) but nothing rendered it — this page was a stub.
const FinanceAnalytics = dynamic(() => import('@/components/analytics/FinanceAnalytics'), {
  ssr: false,
  loading: () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
    </div>
  ),
});

export default function AnalyticsFinancePage() {
  const { user } = useAuth();
  const schoolId = user?.schoolId?.toString() ?? '';

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-start gap-3">
        <span className="rounded-xl bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
          <Scale className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Finance analytics
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Collection rates by class, payment trends, outstanding balances and wallet positions.
          </p>
        </div>
      </header>

      {/* The API derives school_id from the session and ignores this prop; it is
          passed because the component's signature requires it. */}
      <FinanceAnalytics schoolId={schoolId} />
    </div>
  );
}
