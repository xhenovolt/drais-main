"use client";
import React from 'react';
import { Users, UserCheck, UserX, TrendingUp, AlertTriangle } from 'lucide-react';

interface KPIData {
  totalStudents: number;
  presentToday: number;
  absentToday: number;
  attendancePercentage: number;
  enrollmentGrowth: number;
  feesCollectedToday: number;
  defaultersCount: number;
}

interface DashboardKPIsProps {
  data?: KPIData;
}

// Compact skeleton for loading state
function KPISkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="h-20 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
      ))}
    </div>
  );
}

const DashboardKPIs: React.FC<DashboardKPIsProps> = ({ data }) => {
  if (!data) return <KPISkeleton />;

  const attendancePct = data.attendancePercentage || 0;
  const attendanceColor =
    attendancePct >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
    attendancePct >= 60 ? 'text-amber-600 dark:text-amber-400' :
    'text-red-600 dark:text-red-400';

  const cards = [
    {
      label: 'Total Students',
      value: (data.totalStudents || 0).toLocaleString(),
      sub: `${data.enrollmentGrowth || 0} enrolled this month`,
      icon: <Users className="w-4 h-4" />,
      iconBg: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    },
    {
      label: 'Present Today',
      value: (data.presentToday || 0).toLocaleString(),
      sub: `${attendancePct}% attendance rate`,
      subColor: attendanceColor,
      icon: <UserCheck className="w-4 h-4" />,
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
      bar: attendancePct,
      barColor: attendancePct >= 80 ? 'bg-emerald-500' : attendancePct >= 60 ? 'bg-amber-500' : 'bg-red-500',
    },
    {
      label: 'Absent Today',
      value: (data.absentToday || 0).toLocaleString(),
      sub: data.absentToday > 0 ? 'needs follow-up' : 'all present',
      icon: <UserX className="w-4 h-4" />,
      iconBg: data.absentToday > 0
        ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
        : 'bg-slate-100 dark:bg-slate-700 text-slate-500',
    },
    {
      label: 'Fee Defaulters',
      value: (data.defaultersCount || 0).toLocaleString(),
      sub: data.defaultersCount > 10 ? '⚠️ action required' : 'unpaid / partial',
      icon: <AlertTriangle className="w-4 h-4" />,
      iconBg: data.defaultersCount > 10
        ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
        : 'bg-slate-100 dark:bg-slate-700 text-slate-500',
      alert: data.defaultersCount > 10,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 ${
            card.alert ? 'ring-1 ring-orange-400 dark:ring-orange-500' : ''
          }`}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-tight">{card.label}</p>
            <div className={`p-1.5 rounded-lg flex-shrink-0 ${card.iconBg}`}>{card.icon}</div>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mb-0.5">{card.value}</p>
          {card.bar !== undefined && (
            <div className="w-full h-1 bg-slate-100 dark:bg-slate-700 rounded-full mb-1 overflow-hidden">
              <div className={`h-full rounded-full ${card.barColor}`} style={{ width: `${Math.min(100, card.bar)}%` }} />
            </div>
          )}
          <p className={`text-xs ${card.subColor ?? 'text-slate-400 dark:text-slate-500'} truncate`}>{card.sub}</p>
        </div>
      ))}
    </div>
  );
};

export default DashboardKPIs;

// ── Removed: ──────────────────────────────────────────────────────────────────
// ❌ Fake change strings ("+5% this month", "+2% vs yesterday") 
// ❌ 6-column xl grid that breaks on medium screens
// ❌ framer-motion animations on every card load
// ❌ xl:grid-cols-6 (too wide)
// ✅ Real data only: actual attendance %, real counts
// ✅ 4 focused KPIs (students / attendance / absent / defaulters)
// ✅ Compact 2-col mobile, 4-col desktop
// ✅ Attendance bar uses real percentage
// ✅ Alert ring only when genuinely needed (defaulters > 10)
//
// Note: 'Fees Today' removed — field was always 0 (no real-time payment data yet)
// Note: 'Enrollment Growth' merged into Total Students subtitle
