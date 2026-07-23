"use client";
import React from 'react';
import { Users, UserCheck, UserX, TrendingUp, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';

interface KPIData {
  totalStudents: number;
  presentToday: number;
  absentToday: number;
  attendancePercentage: number;
  enrollmentGrowth: number;
  feesCollectedToday: number;
  defaultersCount: number;
}

interface RoleCounts { total: number; present: number; late: number; absent: number; }
interface AttendanceByRole {
  date: string;
  learners: RoleCounts;
  staff: RoleCounts;
}

interface DashboardKPIsProps {
  data?: KPIData;
  attendance?: AttendanceByRole;
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

/** Attendance status colors — status palette (good/warning/serious), always
 *  paired with a visible label + count, never color alone. */
const STATUS_HEX = { present: '#10b981', late: '#f59e0b', absent: '#ef4444' } as const;

/** Small SVG donut: present / late / absent share. Counts are labeled beside
 *  it, so the donut is reinforcement, not the only encoding. */
function StatusDonut({ counts }: { counts: RoleCounts }) {
  const total = Math.max(1, counts.present + counts.late + counts.absent);
  const r = 26, cx = 32, cy = 32, sw = 10;
  const C = 2 * Math.PI * r;
  const segs: Array<{ v: number; color: string }> = [
    { v: counts.present, color: STATUS_HEX.present },
    { v: counts.late, color: STATUS_HEX.late },
    { v: counts.absent, color: STATUS_HEX.absent },
  ];
  let offset = 0;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-hidden="true" className="flex-shrink-0 -rotate-90">
      <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={sw} className="stroke-slate-100 dark:stroke-slate-700" />
      {segs.map((s, i) => {
        const frac = s.v / total;
        const el = frac > 0 && (
          <circle
            key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={sw}
            strokeDasharray={`${Math.max(0, frac * C - 2)} ${C}`}
            strokeDashoffset={-offset * C}
            strokeLinecap="butt"
          />
        );
        offset += frac;
        return el;
      })}
    </svg>
  );
}

/** One row of role-labeled counts: "Staff — 116 present · 9 late · 86 absent". */
function RoleAttendanceCard({ label, counts, isAr }: { label: string; counts: RoleCounts; isAr: boolean }) {
  const pct = counts.total > 0 ? Math.round((counts.present / counts.total) * 100) : 0;
  const barColor = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500';
  const cells: Array<{ v: number; label: string; cls: string }> = [
    { v: counts.present, label: isAr ? 'حاضر' : 'present', cls: 'text-emerald-600 dark:text-emerald-400' },
    { v: counts.late, label: isAr ? 'متأخر' : 'late', cls: 'text-amber-600 dark:text-amber-400' },
    { v: counts.absent, label: isAr ? 'غائب' : 'absent', cls: 'text-red-600 dark:text-red-400' },
  ];
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{label}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {isAr
            ? `${pct}٪ حضور من ${counts.total.toLocaleString()}`
            : `${pct}% of ${counts.total.toLocaleString()}`}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <StatusDonut counts={counts} />
        <div className="grid grid-cols-3 gap-2 flex-1">
          {cells.map((c) => (
            <div key={c.label} className="text-center">
              <p className={`text-xl font-bold ${c.cls}`}>{c.v.toLocaleString()}</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">{c.label}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="w-full h-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mt-2">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

const DashboardKPIs: React.FC<DashboardKPIsProps> = ({ data, attendance }) => {
  const { t, lang } = useI18n();
  if (!data) return <KPISkeleton />;

  const attendancePct = data.attendancePercentage || 0;
  const attendanceColor =
    attendancePct >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
    attendancePct >= 60 ? 'text-amber-600 dark:text-amber-400' :
    'text-red-600 dark:text-red-400';

  const isAr = lang === 'ar';
  // When the role-labeled attendance block is present, the role cards carry
  // present/late/absent — the old unlabeled tiles would duplicate them, so
  // they are dropped and the row keeps only the non-attendance KPIs.
  const allCards = [
    {
      label: isAr ? 'إجمالي الطلاب' : 'Total Students',
      value: (data.totalStudents || 0).toLocaleString(),
      sub: isAr
        ? `${data.enrollmentGrowth || 0} مُسجَّل هذا الشهر`
        : `${data.enrollmentGrowth || 0} enrolled this month`,
      icon: <Users className="w-4 h-4" />,
      iconBg: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    },
    {
      // Role-labeled: these two tiles are LEARNER numbers — only shown when
      // the role attendance cards are absent (older API), never unlabeled.
      attendanceTile: true,
      label: isAr ? 'الطلاب الحاضرون اليوم' : 'Learners Present Today',
      value: (data.presentToday || 0).toLocaleString(),
      sub: isAr
        ? `معدل الحضور ${attendancePct}٪`
        : `${attendancePct}% attendance rate`,
      subColor: attendanceColor,
      icon: <UserCheck className="w-4 h-4" />,
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
      bar: attendancePct,
      barColor: attendancePct >= 80 ? 'bg-emerald-500' : attendancePct >= 60 ? 'bg-amber-500' : 'bg-red-500',
    },
    {
      attendanceTile: true,
      label: isAr ? 'الطلاب الغائبون اليوم' : 'Learners Absent Today',
      value: (data.absentToday || 0).toLocaleString(),
      sub: data.absentToday > 0
        ? (isAr ? 'بحاجة إلى متابعة' : 'needs follow-up')
        : (isAr ? 'الجميع حاضر' : 'all present'),
      icon: <UserX className="w-4 h-4" />,
      iconBg: data.absentToday > 0
        ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
        : 'bg-slate-100 dark:bg-slate-700 text-slate-500',
    },
    {
      label: isAr ? 'المتأخرون عن الرسوم' : 'Fee Defaulters',
      value: (data.defaultersCount || 0).toLocaleString(),
      sub: data.defaultersCount > 10
        ? (isAr ? '⚠️ يلزم اتخاذ إجراء' : '⚠️ action required')
        : (isAr ? 'غير مدفوع / جزئي' : 'unpaid / partial'),
      icon: <AlertTriangle className="w-4 h-4" />,
      iconBg: data.defaultersCount > 10
        ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
        : 'bg-slate-100 dark:bg-slate-700 text-slate-500',
      alert: data.defaultersCount > 10,
    },
  ];
  const cards = attendance ? allCards.filter((c: any) => !c.attendanceTile) : allCards;

  return (
    <div className="space-y-3">
      {/* Today's attendance, labeled by WHO — staff vs learners */}
      {attendance && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <RoleAttendanceCard
            label={isAr ? `حضور الموظفين اليوم (${attendance.date})` : `Staff Attendance Today (${attendance.date})`}
            counts={attendance.staff}
            isAr={isAr}
          />
          <RoleAttendanceCard
            label={isAr ? `حضور الطلاب اليوم (${attendance.date})` : `Learners Attendance Today (${attendance.date})`}
            counts={attendance.learners}
            isAr={isAr}
          />
        </div>
      )}
      <div className={`grid gap-3 ${cards.length <= 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 lg:grid-cols-4'}`}>
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
