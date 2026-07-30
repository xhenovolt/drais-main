'use client';
import React from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '@/contexts/AuthContext';

// DashboardAnalytics pulls in recharts across 4 sub-components (Enrollment/
// StudentPerformance/Finance/Attendance) — a heavy chart lib with no reason
// to be in this page's static/server compile pass. Loaded client-only.
const DashboardAnalytics = dynamic(() => import('@/components/analytics/DashboardAnalytics'), {
  ssr: false,
  loading: () => <div className="animate-pulse text-sm text-gray-400 p-6">Loading analytics…</div>,
});

export default function AnalyticsPage() {
  const { user } = useAuth();
  const schoolId = user?.schoolId?.toString() ?? '';

  return (
    <div className="p-6">
      <DashboardAnalytics
        schoolId={schoolId}
        termId={undefined}
        classId={undefined}
      />
    </div>
  );
}
