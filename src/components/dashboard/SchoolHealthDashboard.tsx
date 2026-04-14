"use client";
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Minus,
  Award, AlertTriangle, Users, BookOpen,
  BadgeCheck, Banknote, RefreshCw, AlertCircle,
  ChevronDown, ChevronUp, Activity,
} from 'lucide-react';
import useSWR from 'swr';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell,
} from 'recharts';
import { fetcher } from '@/utils/fetcher';
import type { SchoolHealthScore } from '@/lib/narrativeEngine';

// ─────────────────────────────────────────────────────────────────────────────
// Types (mirrors /api/dashboard/health response shape)
// ─────────────────────────────────────────────────────────────────────────────
interface StudentRow   { name: string; class_name: string; avg_score: number; grade: string }
interface AttendRow    { name: string; class_name: string; rate?: number; present_days?: number; absent_days?: number; absence_rate?: number }
interface ClassRow     { class_name: string; total: number; present: number; rate: number }
interface GenderRow    { gender: string; total: number; present: number; rate: number }
interface ChronicRow   { name: string; class_name: string; absent_days: number; rate: number }
interface Forecast {
  currentRate: number;
  forecastRate14d: number | null;
  forecastDirection: 'up' | 'down' | 'stable';
  forecastSentence: string;
}

interface HealthData {
  health_score:    SchoolHealthScore;
  top_students:    StudentRow[];
  bottom_students: StudentRow[];
  most_consistent: AttendRow[];
  most_absent:     AttendRow[];
  class_best:      ClassRow[];
  class_worst:     ClassRow[];
  genders:         GenderRow[];
  gender_insight:  string;
  fee_compliance:  { total: number; compliant: number; in_arrears: number; pct: number; outstanding: number };
  academic:        { avg_score: number; students_with_results: number; has_data: boolean };
  chronic_absent:  ChronicRow[];
  forecast:        Forecast;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const GRADE_COLOR: Record<string, string> = {
  A: 'text-emerald-600', B: 'text-blue-600', C: 'text-amber-500', D: 'text-orange-500', F: 'text-red-600',
};
const GRADE_BG: Record<string, string> = {
  A: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
  B: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',
  C: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800',
  D: 'bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800',
  F: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800',
};

function RateBadge({ rate }: { rate: number }) {
  const cls = rate >= 80 ? 'bg-emerald-100 text-emerald-700' : rate >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{rate}%</span>;
}

function ProgressBar({ rate, max = 100 }: { rate: number; max?: number }) {
  const pct = Math.min(100, Math.round((rate / max) * 100));
  const color = rate >= 80 ? 'bg-emerald-500' : rate >= 60 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-1.5 mt-1">
      <div className={`h-1.5 rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function SectionCard({ title, icon: Icon, iconBg, children }: {
  title: string; icon: React.ElementType; iconBg: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
      <div className="flex items-center gap-3 px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-slate-700">
        <div className={`p-2 rounded-xl ${iconBg}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">{title}</h3>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// School Health Score gauge
// ─────────────────────────────────────────────────────────────────────────────
function HealthScoreGauge({ hs }: { hs: SchoolHealthScore }) {
  const grade = hs.grade;
  const bgCls = GRADE_BG[grade] ?? GRADE_BG['C'];
  const txtCls = GRADE_COLOR[grade] ?? 'text-amber-500';

  return (
    <div className={`rounded-2xl border p-4 sm:p-6 ${bgCls}`}>
      <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
        {/* Score circle */}
        <div className="relative flex-shrink-0">
          <svg viewBox="0 0 120 120" className="w-28 h-28 sm:w-32 sm:h-32">
            {/* Track */}
            <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" strokeWidth="10"
              className="text-gray-200 dark:text-slate-700" />
            {/* Arc */}
            <circle
              cx="60" cy="60" r="50" fill="none" strokeWidth="10"
              strokeDasharray={`${(hs.score / 100) * 314.16} 314.16`}
              strokeLinecap="round"
              transform="rotate(-90 60 60)"
              className={
                grade === 'A' ? 'stroke-emerald-500'
                : grade === 'B' ? 'stroke-blue-500'
                : grade === 'C' ? 'stroke-amber-500'
                : grade === 'D' ? 'stroke-orange-500'
                : 'stroke-red-500'
              }
            />
            <text x="50%" y="45%" textAnchor="middle" dominantBaseline="middle"
              fontSize="26" fontWeight="700"
              className={`fill-current ${txtCls}`}
            >
              {hs.score}
            </text>
            <text x="50%" y="62%" textAnchor="middle" dominantBaseline="middle"
              fontSize="13" fontWeight="500"
              className="fill-current text-gray-500"
            >
              /100
            </text>
          </svg>
        </div>

        {/* Label + breakdown */}
        <div className="flex-1 min-w-0 text-center sm:text-left">
          <div className="flex items-center gap-2 justify-center sm:justify-start">
            <span className={`text-3xl font-extrabold ${txtCls}`}>{grade}</span>
            <span className="text-base font-semibold text-gray-700 dark:text-gray-300">{hs.label}</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-3">Composite school health rating</p>
          <div className="space-y-1.5">
            {hs.breakdown.map(b => (
              <div key={b.label} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 w-28 flex-shrink-0">{b.label}</span>
                <div className="flex-1 bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      b.score >= 80 ? 'bg-emerald-500' : b.score >= 60 ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${b.score}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 w-8 text-right">{b.score}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Students table (top/bottom academic performers)
// ─────────────────────────────────────────────────────────────────────────────
function StudentsTable({ rows, label, emptyMsg }: { rows: StudentRow[]; label: string; emptyMsg: string }) {
  if (rows.length === 0) return <p className="text-sm text-gray-400 text-center py-4">{emptyMsg}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-slate-700">
            <th className="text-left pb-2 pr-3 font-medium">Name</th>
            <th className="text-left pb-2 pr-3 font-medium hidden sm:table-cell">Class</th>
            <th className="text-left pb-2 pr-2 font-medium">Score</th>
            <th className="text-left pb-2 font-medium">Grade</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s, i) => (
            <tr key={i} className="border-b border-gray-50 dark:border-slate-700/50">
              <td className="py-2 pr-3 font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">{s.name}</td>
              <td className="py-2 pr-3 text-gray-500 dark:text-gray-400 hidden sm:table-cell">{s.class_name}</td>
              <td className="py-2 pr-2">{s.avg_score > 0 ? s.avg_score : '—'}</td>
              <td className="py-2">
                <span className={`font-bold ${GRADE_COLOR[s.grade] ?? 'text-gray-500'}`}>{s.grade || '—'}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Attendance list (consistent / absent)
// ─────────────────────────────────────────────────────────────────────────────
function AttendList({
  rows,
  mode,
  emptyMsg,
}: {
  rows: AttendRow[];
  mode: 'consistent' | 'absent';
  emptyMsg: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-gray-400 text-center py-4">{emptyMsg}</p>;
  return (
    <ul className="space-y-2">
      {rows.map((s, i) => {
        const pct = mode === 'consistent' ? (s.rate ?? 0) : (100 - (s.absence_rate ?? 0));
        const label = mode === 'consistent'
          ? `${s.rate ?? 0}% present (${s.present_days ?? 0} days)`
          : `${s.absent_days ?? 0} absences · ${s.absence_rate ?? 0}% absent`;
        return (
          <li key={i}>
            <div className="flex items-center justify-between mb-0.5">
              <div>
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{s.name}</span>
                <span className="ml-2 text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">{s.class_name}</span>
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap ml-2">{label}</span>
            </div>
            <ProgressBar rate={pct} />
          </li>
        );
      })}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Forecast panel
// ─────────────────────────────────────────────────────────────────────────────
function ForecastPanel({ forecast }: { forecast: Forecast }) {
  const ForecastIcon =
    forecast.forecastDirection === 'up'   ? TrendingUp
    : forecast.forecastDirection === 'down' ? TrendingDown
    : Minus;

  const bannerCls =
    forecast.forecastDirection === 'up'
      ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
      : forecast.forecastDirection === 'down'
        ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
        : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-400';

  return (
    <div className={`rounded-xl border p-4 ${bannerCls}`}>
      <div className="flex items-start gap-3">
        <ForecastIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold">
            14-Day Forecast: {forecast.forecastRate14d !== null ? `${forecast.forecastRate14d}%` : 'insufficient data'}
          </p>
          <p className="text-xs mt-1 opacity-80">{forecast.forecastSentence}</p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
interface SchoolHealthDashboardProps {
  schoolId: number | null;
}

const SchoolHealthDashboard: React.FC<SchoolHealthDashboardProps> = ({ schoolId }) => {
  const [showAllChronic, setShowAllChronic] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'academic' | 'attendance' | 'risk'>('overview');

  const { data, isLoading, error, mutate } = useSWR<{ success: boolean; data: HealthData }>(
    schoolId ? `/api/dashboard/health` : null,
    fetcher,
    { refreshInterval: 120_000, revalidateOnFocus: true },
  );

  const h = data?.data;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-700 animate-pulse h-40" />
        ))}
      </div>
    );
  }

  if (error || !h) {
    return (
      <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl p-6 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-red-700 dark:text-red-400">Failed to load school health data</p>
          <p className="text-sm text-red-600 dark:text-red-500 mt-1">{error?.message ?? 'Please check your connection.'}</p>
          <button onClick={() => mutate()} className="mt-3 text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const classChartData = [
    ...h.class_best.map(c => ({ ...c, type: 'best' as const })),
    ...h.class_worst.filter(c => !h.class_best.some(b => b.class_name === c.class_name)).map(c => ({ ...c, type: 'worst' as const })),
  ].sort((a, b) => b.rate - a.rate);

  const genderChartData = h.genders.map((g, i) => ({
    name:    g.gender,
    total:   g.total,
    present: g.present,
    rate:    g.rate,
    color:   i === 0 ? '#6366f1' : '#ec4899',
  }));

  const TABS = [
    { id: 'overview',    label: 'Overview'  },
    { id: 'academic',    label: 'Academic'  },
    { id: 'attendance',  label: 'Attendance'},
    { id: 'risk',        label: 'Risk'      },
  ] as const;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-white">School Health Dashboard</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1">
            <Activity className="w-3 h-3" />
            Composite school-wide intelligence · refreshes every 2 min
          </p>
        </div>
        <button
          onClick={() => mutate()}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* ── HEALTH SCORE GAUGE ──────────────────────────────────── */}
      <HealthScoreGauge hs={h.health_score} />

      {/* ── FORECAST ────────────────────────────────────────────── */}
      <ForecastPanel forecast={h.forecast} />

      {/* ── TABS ─────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-gray-100 dark:bg-slate-800 rounded-xl p-1 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 min-w-max px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ──────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {/* Fee compliance + academic summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-4">
              <div className="flex items-start gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-green-100 dark:bg-green-950/40">
                  <Banknote className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Fee Compliance</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{h.fee_compliance.pct}%</p>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                {h.fee_compliance.in_arrears} students in arrears
                {h.fee_compliance.outstanding > 0 && ` · ${h.fee_compliance.outstanding.toLocaleString()} outstanding`}
              </p>
              <ProgressBar rate={h.fee_compliance.pct} />
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-4">
              <div className="flex items-start gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-purple-100 dark:bg-purple-950/40">
                  <BookOpen className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Avg Academic Score</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {h.academic.has_data ? `${h.academic.avg_score}%` : '—'}
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                {h.academic.has_data
                  ? `Based on ${h.academic.students_with_results} student results`
                  : 'No results recorded yet'}
              </p>
              {h.academic.has_data && <ProgressBar rate={h.academic.avg_score} />}
            </div>
          </div>

          {/* Class performance chart */}
          {classChartData.length > 0 && (
            <SectionCard title="Class Attendance Today" icon={Users} iconBg="bg-gradient-to-br from-blue-500 to-indigo-600">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={classChartData} margin={{ top: 4, right: 4, left: -20, bottom: 24 }} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                    tickFormatter={v => `${v}%`} />
                  <YAxis type="category" dataKey="class_name" tick={{ fontSize: 10 }} width={80} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8 }}
                    formatter={(v: number, name: string, props: any) => [
                      `${v}% (${props?.payload?.present ?? 0}/${props?.payload?.total ?? 0})`,
                      'Attendance',
                    ]}
                  />
                  <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                    {classChartData.map((entry, i) => (
                      <Cell key={i} fill={
                        entry.rate >= 80 ? '#10b981' : entry.rate >= 60 ? '#f59e0b' : '#ef4444'
                      } />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </SectionCard>
          )}

          {/* Gender breakdown */}
          {genderChartData.length > 0 && (
            <SectionCard title="Attendance by Gender" icon={Users} iconBg="bg-gradient-to-br from-pink-500 to-rose-600">
              <div className="space-y-3">
                {genderChartData.map(g => (
                  <div key={g.name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{g.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{g.present}/{g.total}</span>
                        <RateBadge rate={g.rate} />
                      </div>
                    </div>
                    <ProgressBar rate={g.rate} />
                  </div>
                ))}
                <p className="text-xs text-gray-500 dark:text-gray-400 pt-1 italic">{h.gender_insight}</p>
              </div>
            </SectionCard>
          )}
        </motion.div>
      )}

      {/* ── ACADEMIC TAB ──────────────────────────────────────────── */}
      {activeTab === 'academic' && (
        <motion.div key="academic" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {h.academic.has_data ? (
            <>
              <SectionCard title="Top 5 Performers" icon={Award} iconBg="bg-gradient-to-br from-amber-500 to-yellow-600">
                <StudentsTable rows={h.top_students} label="Top 5" emptyMsg="No report card data available" />
              </SectionCard>
              <SectionCard title="Students Needing Support" icon={AlertTriangle} iconBg="bg-gradient-to-br from-red-500 to-rose-600">
                <StudentsTable rows={h.bottom_students} label="Bottom 5" emptyMsg="No report card data available" />
              </SectionCard>
            </>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 p-8 text-center">
              <BookOpen className="w-10 h-10 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-500">No academic results found</p>
              <p className="text-xs text-gray-400 mt-1">Report cards and grades will appear here once captured</p>
            </div>
          )}
        </motion.div>
      )}

      {/* ── ATTENDANCE TAB ────────────────────────────────────────── */}
      {activeTab === 'attendance' && (
        <motion.div key="attendance" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <SectionCard title="Most Consistent Attendees (30 days)" icon={BadgeCheck} iconBg="bg-gradient-to-br from-emerald-500 to-teal-600">
            <AttendList rows={h.most_consistent} mode="consistent" emptyMsg="No attendance data in the last 30 days" />
          </SectionCard>
          <SectionCard title="Most Absent Learners (30 days)" icon={AlertTriangle} iconBg="bg-gradient-to-br from-red-500 to-rose-600">
            <AttendList rows={h.most_absent} mode="absent" emptyMsg="No significant absenteeism detected" />
          </SectionCard>
        </motion.div>
      )}

      {/* ── RISK TAB ──────────────────────────────────────────────── */}
      {activeTab === 'risk' && (
        <motion.div key="risk" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <SectionCard
            title={`Chronic Absentees (${h.chronic_absent.length})`}
            icon={AlertTriangle}
            iconBg="bg-gradient-to-br from-red-600 to-rose-700"
          >
            {h.chronic_absent.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-emerald-600 font-medium">No chronic absentees in the last 14 days</p>
                <p className="text-xs text-gray-400 mt-1">Learners with &lt;60% attendance over 14 days appear here</p>
              </div>
            ) : (
              <>
                <ul className="space-y-2">
                  {(showAllChronic ? h.chronic_absent : h.chronic_absent.slice(0, 5)).map((s, i) => (
                    <li key={i}>
                      <div className="flex items-center justify-between mb-0.5">
                        <div>
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{s.name}</span>
                          <span className="ml-2 text-xs text-gray-500 hidden sm:inline">{s.class_name}</span>
                        </div>
                        <span className="text-xs text-red-500 font-semibold ml-2">{s.absent_days} absences · {s.rate}%</span>
                      </div>
                      <ProgressBar rate={s.rate} />
                    </li>
                  ))}
                </ul>
                {h.chronic_absent.length > 5 && (
                  <button
                    onClick={() => setShowAllChronic(x => !x)}
                    className="mt-3 text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                  >
                    {showAllChronic
                      ? <><ChevronUp className="w-3.5 h-3.5" />Show less</>
                      : <><ChevronDown className="w-3.5 h-3.5" />Show all {h.chronic_absent.length}</>}
                  </button>
                )}
              </>
            )}
          </SectionCard>
        </motion.div>
      )}
    </div>
  );
};

export default SchoolHealthDashboard;
