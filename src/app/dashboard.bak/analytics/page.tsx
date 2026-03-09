import React from 'react';
import DashboardAnalytics from '@/components/analytics/DashboardAnalytics';
import { loadDictionary } from '@/lib/i18nServer';

export default async function AnalyticsPage() {
  const { dict } = await loadDictionary();
  
  return (
    <div className="p-6">
      <DashboardAnalytics 
        schoolId="1" 
        termId={undefined} 
        classId={undefined} 
      />
    </div>
  );
}
