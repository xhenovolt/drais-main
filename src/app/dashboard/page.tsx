"use client";
import React from 'react';
import {
  Users,
  GraduationCap,
  UserCheck,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  BarChart3,
  ArrowRight,
  Brain,
  BookOpen,
  Wifi,
} from 'lucide-react';
import useSWR from 'swr';
import { fetcher } from '@/utils/fetcher';
import Link from 'next/link';
import DashboardKPIs from '@/components/dashboard/DashboardKPIs';
import AttendanceToday from '@/components/dashboard/AttendanceToday';
import DeviceStatusWidget from '@/components/dashboard/DeviceStatusWidget';
import { useAuth } from '@/contexts/AuthContext';

// ─── Signal type helpers ──────────────────────────────────────────────────
const SIGNAL_STYLES: Record<string, { bg: string; border: string; text: string; icon: React.ReactNode }> = {
  warning:  { bg: 'bg-amber-50 dark:bg-amber-900/20',  border: 'border-amber-300 dark:border-amber-600',  text: 'text-amber-800 dark:text-amber-200',  icon: <AlertTriangle className="w-4 h-4 text-amber-500" /> },
  decline:  { bg: 'bg-red-50 dark:bg-red-900/20',      border: 'border-red-300 dark:border-red-600',      text: 'text-red-800 dark:text-red-200',      icon: <TrendingDown className="w-4 h-4 text-red-500" /> },
  positive: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-300 dark:border-emerald-600', text: 'text-emerald-800 dark:text-emerald-200', icon: <TrendingUp className="w-4 h-4 text-emerald-500" /> },
  info:     { bg: 'bg-blue-50 dark:bg-blue-900/20',    border: 'border-blue-300 dark:border-blue-600',    text: 'text-blue-800 dark:text-blue-200',    icon: <BarChart3 className="w-4 h-4 text-blue-500" /> },
};

interface Signal {
  type: string;
  icon: string;
  label: string;
  detail: string;
  value: number;
  action: string;
}

function SignalCard({ signal }: { signal: Signal }) {
  const style = SIGNAL_STYLES[signal.type] ?? SIGNAL_STYLES.info;
  return (
    <Link href={signal.action} className={`flex items-start gap-3 p-3.5 rounded-xl border ${style.bg} ${style.border} hover:opacity-90 transition-opacity`}>
      <div className="mt-0.5 flex-shrink-0">{style.icon}</div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${style.text} truncate`}>{signal.label}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{signal.detail}</p>
      </div>
      <ArrowRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-1" />
    </Link>
  );
}

function IntelligenceSummary({ schoolId }: { schoolId: number | null }) {
  const { data, isLoading } = useSWR(
    schoolId ? '/api/intelligence/overview' : null,
    fetcher,
    { refreshInterval: 120_000 }
  );

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-2.5">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="w-4 h-4 text-indigo-500" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Intelligence Signals</span>
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} className="h-14 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
        ))}
      </div>
    );
  }

  const signals: Signal[] = data?.signals ?? [];
  const meta = data?.meta ?? {};

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-indigo-500" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Intelligence Signals</span>
          {meta.currentTerm && (
            <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full">
              {meta.currentTerm.name}
            </span>
          )}
        </div>
        <Link href="/intelligence" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 flex-shrink-0">
          Full analysis <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {signals.length === 0 ? (
        <div className="text-center py-6 text-slate-400 text-sm">
          {data ? 'No signals this term — all clear.' : 'No data yet for this term.'}
        </div>
      ) : (
        <div className="space-y-2">
          {signals.slice(0, 6).map((s, i) => <SignalCard key={i} signal={s} />)}
        </div>
      )}

      {signals.length > 0 && (
        <Link
          href="/intelligence"
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
        >
          <BookOpen className="w-3.5 h-3.5" />
          View Full Intelligence Report
        </Link>
      )}
    </div>
  );
}

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const schoolId = user?.schoolId ?? null;

  // Overview KPIs
  const { data: overviewData, isLoading } = useSWR(
    schoolId ? `/api/dashboard/overview` : null,
    fetcher,
    { refreshInterval: 60_000 }
  );
  const overview = overviewData?.data;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="text-xl font-bold text-slate-900 dark:text-white">Dashboard</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/intelligence"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-sm font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
            >
              <Brain className="w-3.5 h-3.5" />
              Intelligence
            </Link>
            <Link
              href="/students/list"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <Users className="w-3.5 h-3.5" />
              Students
            </Link>
          </div>
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 py-5 space-y-5">

        {/* KPIs — always visible */}
        <DashboardKPIs data={overview?.kpis} />

        {/* Two-column grid: signals left, widgets right */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* Intelligence signals — spans 1 col on md, 2 on lg */}
          <div className="md:col-span-1 lg:col-span-2">
            <IntelligenceSummary schoolId={schoolId} />
          </div>

          {/* Right column: attendance + device */}
          <div className="space-y-4">
            <AttendanceToday schoolId={schoolId} />
            <DeviceStatusWidget />
          </div>
        </div>

        {/* Quick nav links */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {[
            { href: '/intelligence?tab=risk', icon: <AlertTriangle className="w-4 h-4" />, label: 'At-Risk Students', color: 'text-red-600 bg-red-50 dark:bg-red-900/20' },
            { href: '/intelligence?tab=classes', icon: <GraduationCap className="w-4 h-4" />, label: 'Class Insights', color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/20' },
            { href: '/intelligence?tab=patterns', icon: <UserCheck className="w-4 h-4" />, label: 'Student Patterns', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' },
            { href: '/intelligence?tab=subjects', icon: <BookOpen className="w-4 h-4" />, label: 'Subject Analysis', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' },
            { href: '/intelligence?tab=trends', icon: <TrendingUp className="w-4 h-4" />, label: 'Term Trends', color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' },
          ].map(({ href, icon, label, color }) => (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-2 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:shadow-md active:scale-[0.98] transition-all"
            >
              <div className={`p-2.5 rounded-xl ${color}`}>{icon}</div>
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300 text-center leading-tight">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
