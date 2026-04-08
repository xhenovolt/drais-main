'use client';
import React from 'react';
import DashboardAnalytics from '@/components/analytics/DashboardAnalytics';
import { useAuth } from '@/contexts/AuthContext';

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
