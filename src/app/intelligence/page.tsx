"use client";
import React, { useState, useMemo } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/utils/fetcher';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import {
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  BarChart3,
  Users,
  BookOpen,
  GraduationCap,
  Brain,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Search,
  Activity,
  Fingerprint,
  Calendar,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  LineChart,
  Line,
  Legend,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  ZAxis,
} from 'recharts';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Tab = 'overview' | 'risk' | 'patterns' | 'classes' | 'subjects' | 'trends' | 'attendance';

interface Signal { type: string; icon: string; label: string; detail: string; value: number; action: string }
interface OverviewData { signals: Signal[]; meta: { currentTerm: { id: number; name: string } | null; previousTerm: { id: number; name: string } | null; totalStudents: number; currentTermAvg: number; previousTermAvg: number | null } }
interface PatternStudent { student_id: number; name: string; class_name: string | null; archetype: string; current_avg: number; previous_avg: number | null; delta: number | null; subjects_at_risk: string[]; confidence: number }
interface PatternSummary { at_risk: number; silent_struggler: number; inconsistent: number; stable: number; top_improver: number; high_performer: number; total: number }
interface PatternData { patterns: PatternStudent[]; total: number; summary: PatternSummary; meta: { currentTerm: { id: number; name: string } | null; previousTerm: { id: number; name: string } | null } }
interface ClassInsight { class_id: number; class_name: string; current_avg: number; previous_avg: number | null; delta: number | null; trend: string; student_count: number; at_risk_count: number; pass_rate: number; hardest_subjects: { subject_id: number; subject_name: string; avg_score: number }[] }
interface ClassData { classes: ClassInsight[]; school_subjects: { subject_id: number; subject_name: string; avg_score: number; student_count: number }[]; meta: { currentTerm: { id: number; name: string } | null; previousTerm: { id: number; name: string } | null; total_classes: number; declining_classes: number; improving_classes: number } }
interface RiskStudent { student_id: number; name: string; class_name: string | null; admission_no: string | null; risk_level: string; risk_reasons: string[]; current_avg: number; previous_avg: number | null; delta: number | null; weak_subjects: { subject_name: string; avg_score: number }[] }
interface RiskData { students: RiskStudent[]; total: number; summary: { critical: number; high: number; medium: number; total: number }; meta: { currentTerm: { id: number; name: string } | null } }

interface TermPoint { term_id: number; term_name: string; avg_score: number | null; student_count?: number; at_risk_count?: number; pass_rate?: number | null }
interface ClassTrend { class_id: number; class_name: string; delta: number | null; trend: TermPoint[] }
interface SubjectTrend { subject_id: number; subject_name: string; variance: number; latest_avg: number | null; trend: TermPoint[] }
interface ClassificationPoint { term_id: number; term_name: string; at_risk: number; struggling: number; stable: number; performing: number; high: number }
interface TermComparisonData { terms: { id: number; name: string }[]; school_trend: TermPoint[]; class_trends: ClassTrend[]; subject_trends: SubjectTrend[]; classification_trend: ClassificationPoint[] }

// Attendance intelligence types
interface AttendanceOverview {
  tracked_days: number; total_enrolled: number; total_scanned_students: number;
  never_scanned: number; avg_daily_attendance: number; scan_rate_pct: number;
  today_scans: number; week_avg: number; prev_week_avg: number;
  week_trend: string; week_delta_pct: number | null;
  first_day: string | null; last_day: string | null;
  data_source: string; data_note: string;
}
interface AttendanceDailyPoint {
  date: string; day: string; distinct_students: number; total_scans: number; attendance_pct: number;
}
interface AttendanceTrendsData {
  daily: AttendanceDailyPoint[];
  weekly: { week_start: string; label: string; school_days: number; avg_daily_students: number; attendance_pct: number }[];
  trend: string; trend_confidence: number; total_enrolled: number;
}
interface AttendanceRiskStudent {
  student_id: number; name: string; admission_no: string | null; class_name: string | null;
  risk: string; reasons: string[]; days_present: number; tracked_days: number;
  attendance_pct: number; last_seen: string | null; first_seen: string | null;
}
interface AttendanceRiskData {
  summary: { recently_absent: number; sparse: number; total_at_risk: number };
  students: AttendanceRiskStudent[];
  tracked_days: number; cutoff_date: string | null;
}
interface AttendanceCorrelationData {
  data_available: boolean; data_note?: string;
  student_count?: number; tracked_days?: number;
  quartiles?: { tier: string; label: string; count: number; avg_score: number | null }[];
  scatter?: { student_id: number; name: string; class_name: string | null; attendance_pct: number; avg_score: number }[];
  correlation?: string; pearson_r?: number; insight?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────
function n(v: unknown): number { return Number(v) || 0; }

const ARCHETYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  at_risk:          { label: 'At Risk',          color: 'text-red-700 dark:text-red-300',     bg: 'bg-red-100 dark:bg-red-900/30' },
  silent_struggler: { label: 'Silent Struggler',  color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-100 dark:bg-orange-900/30' },
  inconsistent:     { label: 'Inconsistent',      color: 'text-amber-700 dark:text-amber-300',  bg: 'bg-amber-100 dark:bg-amber-900/30' },
  stable:           { label: 'Stable',             color: 'text-slate-700 dark:text-slate-300',  bg: 'bg-slate-100 dark:bg-slate-800' },
  top_improver:     { label: 'Top Improver',       color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  high_performer:   { label: 'High Performer',     color: 'text-indigo-700 dark:text-indigo-300', bg: 'bg-indigo-100 dark:bg-indigo-900/30' },
};

const RISK_LABELS: Record<string, { label: string; color: string; dot: string }> = {
  critical: { label: 'Critical', color: 'text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-300', dot: 'bg-red-500' },
  high:     { label: 'High',     color: 'text-orange-700 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-300', dot: 'bg-orange-500' },
  medium:   { label: 'Medium',   color: 'text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300', dot: 'bg-amber-500' },
};

const RISK_REASON_LABELS: Record<string, string> = {
  low_score: 'Low score (<40%)',
  sudden_drop: 'Sudden drop (>20pts)',
  multi_term_decline: 'Multi-term decline',
  multiple_weak_subjects: '3+ weak subjects',
};

function ScoreBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = value < 40 ? 'bg-red-500' : value < 55 ? 'bg-amber-500' : value < 70 ? 'bg-yellow-400' : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-slate-600 dark:text-slate-400 w-9 text-right">{value}%</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Overview
// ─────────────────────────────────────────────────────────────────────────────
function OverviewTab({ schoolId }: { schoolId: number | null }) {
  const { data, isLoading } = useSWR<{ ok: boolean } & OverviewData>(
    schoolId ? '/api/intelligence/overview' : null,
    fetcher,
    { refreshInterval: 120_000 }
  );
  const { data: classData } = useSWR<{ ok: boolean } & ClassData>(
    schoolId ? '/api/intelligence/class-insights' : null,
    fetcher
  );

  if (isLoading) return <LoadingGrid />;

  const signals = data?.signals ?? [];
  const meta = data?.meta;
  const subjects = classData?.school_subjects ?? [];

  const chartData = subjects.slice(0, 10).map(s => ({
    name: s.subject_name.length > 14 ? s.subject_name.slice(0, 14) + '…' : s.subject_name,
    avg: s.avg_score,
  }));

  return (
    <div className="space-y-6">
      {/* Meta bar */}
      {meta?.currentTerm && (
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full font-medium">
            Current: {meta.currentTerm.name}
          </span>
          {meta.previousTerm && (
            <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full">
              vs {meta.previousTerm.name}
            </span>
          )}
          {n(meta.totalStudents) > 0 && (
            <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full">
              {meta.totalStudents} students
            </span>
          )}
          {n(meta.currentTermAvg) > 0 && (
            <span className={`px-3 py-1 rounded-full font-medium ${n(meta.currentTermAvg) >= 60 ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'}`}>
              School avg: {Math.round(n(meta.currentTermAvg) * 10) / 10}%
            </span>
          )}
        </div>
      )}

      {/* Signals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {signals.length === 0 && (
          <div className="col-span-full text-center py-10 text-slate-400">
            No intelligence signals available for this term yet.
          </div>
        )}
        {signals.map((s, i) => {
          const styles: Record<string, string> = {
            warning: 'border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-600',
            decline: 'border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-600',
            positive: 'border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-600',
            info: 'border-blue-300 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-600',
          };
          return (
            <Link key={i} href={s.action} className={`p-4 rounded-xl border ${styles[s.type] ?? styles.info} hover:opacity-90 transition-opacity block`}>
              <div className="text-2xl mb-2">{s.icon}</div>
              <p className="font-semibold text-slate-800 dark:text-slate-100">{s.label}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{s.detail}</p>
            </Link>
          );
        })}
      </div>

      {/* Subject performance bar chart */}
      {chartData.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">Subject Performance (Current Term)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
              <Tooltip formatter={(v: number) => `${v}%`} />
              <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.avg < 50 ? '#ef4444' : entry.avg < 65 ? '#f59e0b' : '#10b981'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Risk Analysis
// ─────────────────────────────────────────────────────────────────────────────
function RiskTab({ schoolId }: { schoolId: number | null }) {
  const [filter, setFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const url = schoolId
    ? `/api/intelligence/risk-analysis?limit=200${filter ? `&risk_level=${filter}` : ''}`
    : null;

  const { data, isLoading } = useSWR<{ ok: boolean } & RiskData>(url, fetcher);

  const students = useMemo(() => {
    if (!data?.students) return [];
    if (!search) return data.students;
    const q = search.toLowerCase();
    return data.students.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.class_name ?? '').toLowerCase().includes(q) ||
      (s.admission_no ?? '').toLowerCase().includes(q)
    );
  }, [data?.students, search]);

  if (isLoading) return <LoadingGrid />;

  const summary = data?.summary;

  return (
    <div className="space-y-5">
      {/* Summary pills */}
      {summary && (
        <div className="flex flex-wrap gap-2">
          {(['critical', 'high', 'medium'] as const).map(level => (
            <button
              key={level}
              onClick={() => setFilter(filter === level ? '' : level)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
                filter === level
                  ? 'ring-2 ring-offset-1 ring-slate-400'
                  : 'opacity-80 hover:opacity-100'
              } ${RISK_LABELS[level].color} border-transparent`}
            >
              <span className={`w-2 h-2 rounded-full ${RISK_LABELS[level].dot}`} />
              {RISK_LABELS[level].label}: {summary[level]}
            </button>
          ))}
          <button onClick={() => setFilter('')} className="px-3 py-1.5 rounded-full text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
            Show all ({summary.total})
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search student name, class, admission no…"
          className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Student list */}
      <div className="space-y-2">
        {students.length === 0 && (
          <div className="text-center py-10 text-slate-400 text-sm">
            {data ? 'No at-risk students found.' : 'No data yet.'}
          </div>
        )}
        {students.map(s => {
          const rl = RISK_LABELS[s.risk_level] ?? RISK_LABELS.medium;
          const isExp = expanded === s.student_id;
          return (
            <div key={s.student_id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <button
                className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                onClick={() => setExpanded(isExp ? null : s.student_id)}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${rl.dot}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{s.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{s.class_name ?? '–'} · {s.admission_no ?? '–'}</p>
                </div>
                <div className="text-right flex-shrink-0 mr-2">
                  <p className={`text-xs font-semibold px-2 py-0.5 rounded-full ${rl.color}`}>{rl.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.current_avg}%</p>
                </div>
                {isExp ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
              </button>
              {isExp && (
                <div className="px-4 pb-4 pt-1 space-y-3 bg-slate-50 dark:bg-slate-800/50">
                  <div className="flex flex-wrap gap-2">
                    {s.risk_reasons.map(r => (
                      <span key={r} className="text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full">
                        {RISK_REASON_LABELS[r] ?? r}
                      </span>
                    ))}
                  </div>
                  {s.previous_avg !== null && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Previous term avg: {s.previous_avg}%
                      {s.delta !== null && (
                        <span className={s.delta < 0 ? ' text-red-500' : ' text-emerald-500'}>
                          {' '}({s.delta > 0 ? '+' : ''}{s.delta}pts)
                        </span>
                      )}
                    </p>
                  )}
                  {s.weak_subjects.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Weak subjects:</p>
                      {s.weak_subjects.map(ws => (
                        <div key={ws.subject_name} className="flex items-center justify-between gap-2">
                          <span className="text-xs text-slate-600 dark:text-slate-400 truncate">{ws.subject_name}</span>
                          <ScoreBar value={ws.avg_score} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Student Patterns
// ─────────────────────────────────────────────────────────────────────────────
function PatternsTab({ schoolId }: { schoolId: number | null }) {
  const [archetypeFilter, setArchetypeFilter] = useState('');
  const [search, setSearch] = useState('');

  const url = schoolId
    ? `/api/intelligence/student-patterns?limit=300${archetypeFilter ? `&archetype=${archetypeFilter}` : ''}`
    : null;

  const { data, isLoading } = useSWR<{ ok: boolean } & PatternData>(url, fetcher);

  const students = useMemo(() => {
    if (!data?.patterns) return [];
    if (!search) return data.patterns;
    const q = search.toLowerCase();
    return data.patterns.filter(s =>
      s.name.toLowerCase().includes(q) || (s.class_name ?? '').toLowerCase().includes(q)
    );
  }, [data?.patterns, search]);

  const summary = data?.summary;

  if (isLoading) return <LoadingGrid />;

  const archetypeOrder = ['at_risk', 'silent_struggler', 'inconsistent', 'stable', 'top_improver', 'high_performer'] as const;

  // Donut-style distribution chart data
  const distChartData = summary
    ? archetypeOrder.map(k => ({
        name: ARCHETYPE_LABELS[k]?.label ?? k,
        value: summary[k],
        fill: ({ at_risk: '#ef4444', silent_struggler: '#f97316', inconsistent: '#f59e0b', stable: '#94a3b8', top_improver: '#10b981', high_performer: '#6366f1' } as Record<string, string>)[k] ?? '#94a3b8',
      })).filter(d => d.value > 0)
    : [];

  return (
    <div className="space-y-5">
      {/* Summary + chart */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Filter pills */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wide">Filter by archetype</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setArchetypeFilter('')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${!archetypeFilter ? 'bg-slate-800 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
              >
                All ({data?.total ?? 0})
              </button>
              {archetypeOrder.map(k => {
                const meta = ARCHETYPE_LABELS[k];
                const count = summary[k];
                if (!count) return null;
                return (
                  <button
                    key={k}
                    onClick={() => setArchetypeFilter(archetypeFilter === k ? '' : k)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${archetypeFilter === k ? `${meta.bg} ${meta.color} ring-2 ring-offset-1 ring-slate-300` : `${meta.bg} ${meta.color} opacity-80 hover:opacity-100`}`}
                  >
                    {meta.label} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bar chart */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wide">Distribution</p>
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={distChartData} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {distChartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or class…"
          className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Student table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Student</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Archetype</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Avg</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Delta</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase hidden md:table-cell">Weak Subjects</th>
              </tr>
            </thead>
            <tbody>
              {students.length === 0 && (
                <tr><td colSpan={5} className="text-center py-10 text-slate-400 text-sm">No students found.</td></tr>
              )}
              {students.slice(0, 200).map(s => {
                const meta = ARCHETYPE_LABELS[s.archetype];
                return (
                  <tr key={s.student_id} className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-slate-800 dark:text-slate-100 truncate max-w-[140px]">{s.name}</p>
                      <p className="text-xs text-slate-400">{s.class_name ?? '–'}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${meta?.bg ?? 'bg-slate-100'} ${meta?.color ?? 'text-slate-700'}`}>
                        {meta?.label ?? s.archetype}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm text-slate-700 dark:text-slate-300">{s.current_avg}%</td>
                    <td className="px-4 py-2.5 text-right text-xs">
                      {s.delta !== null ? (
                        <span className={s.delta >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                          {s.delta > 0 ? '+' : ''}{s.delta}
                        </span>
                      ) : <span className="text-slate-400">–</span>}
                    </td>
                    <td className="px-4 py-2.5 hidden md:table-cell">
                      <p className="text-xs text-slate-500 truncate max-w-[180px]">
                        {s.subjects_at_risk.slice(0, 3).join(', ') || '–'}
                      </p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Class Insights
// ─────────────────────────────────────────────────────────────────────────────
function ClassesTab({ schoolId }: { schoolId: number | null }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const { data, isLoading } = useSWR<{ ok: boolean } & ClassData>(
    schoolId ? '/api/intelligence/class-insights' : null,
    fetcher
  );

  if (isLoading) return <LoadingGrid />;

  const classes = data?.classes ?? [];
  const meta = data?.meta;

  const TREND_STYLE: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    improving:  { label: 'Improving',   color: 'text-emerald-700 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300', icon: <TrendingUp className="w-3 h-3" /> },
    declining:  { label: 'Declining',   color: 'text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-300',           icon: <TrendingDown className="w-3 h-3" /> },
    stable:     { label: 'Stable',      color: 'text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300',          icon: <BarChart3 className="w-3 h-3" /> },
    no_history: { label: 'No history',  color: 'text-slate-400 bg-slate-100 dark:bg-slate-800 dark:text-slate-500',          icon: <BarChart3 className="w-3 h-3" /> },
  };

  return (
    <div className="space-y-5">
      {/* Meta bar */}
      {meta && (
        <div className="flex flex-wrap gap-2 text-sm">
          {meta.declining_classes > 0 && (
            <span className="px-3 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-medium">
              {meta.declining_classes} declining
            </span>
          )}
          {meta.improving_classes > 0 && (
            <span className="px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-medium">
              {meta.improving_classes} improving
            </span>
          )}
          <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
            {meta.total_classes} classes total
          </span>
        </div>
      )}

      {/* Class cards */}
      <div className="space-y-2">
        {classes.length === 0 && (
          <div className="text-center py-10 text-slate-400 text-sm">No class data available.</div>
        )}
        {classes.map(c => {
          const ts = TREND_STYLE[c.trend] ?? TREND_STYLE.stable;
          const isExp = expanded === c.class_id;
          return (
            <div key={c.class_id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <button
                className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                onClick={() => setExpanded(isExp ? null : c.class_id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{c.class_name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{c.student_count} students · {c.pass_rate}% pass rate</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${ts.color}`}>
                    {ts.icon} {ts.label}
                    {c.delta !== null && <span>({c.delta > 0 ? '+' : ''}{c.delta})</span>}
                  </span>
                  <span className="font-mono text-sm text-slate-700 dark:text-slate-300">{c.current_avg}%</span>
                </div>
                {isExp ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>
              {isExp && (
                <div className="px-4 pb-4 bg-slate-50 dark:bg-slate-800/50 space-y-3">
                  {c.at_risk_count > 0 && (
                    <p className="text-xs text-red-600 dark:text-red-400">
                      ⚠️ {c.at_risk_count} scores below 40% in this class
                    </p>
                  )}
                  {c.previous_avg !== null && (
                    <p className="text-xs text-slate-500">Previous term avg: {c.previous_avg}%</p>
                  )}
                  {c.hardest_subjects.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Hardest subjects:</p>
                      {c.hardest_subjects.map(hs => (
                        <div key={hs.subject_id} className="flex items-center gap-2">
                          <span className="text-xs text-slate-600 dark:text-slate-400 w-28 truncate">{hs.subject_name}</span>
                          <ScoreBar value={hs.avg_score} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Subjects
// ─────────────────────────────────────────────────────────────────────────────
function SubjectsTab({ schoolId }: { schoolId: number | null }) {
  const { data, isLoading } = useSWR<{ ok: boolean } & ClassData>(
    schoolId ? '/api/intelligence/class-insights' : null,
    fetcher
  );

  if (isLoading) return <LoadingGrid />;

  const subjects = data?.school_subjects ?? [];

  const radarData = subjects.slice(0, 8).map(s => ({
    subject: s.subject_name.length > 12 ? s.subject_name.slice(0, 12) + '…' : s.subject_name,
    avg: s.avg_score,
  }));

  return (
    <div className="space-y-5">
      {/* Radar chart */}
      {radarData.length > 2 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">Subject Strength Map</h3>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
              <Radar name="Avg Score" dataKey="avg" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} />
              <Tooltip formatter={(v: number) => `${v}%`} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Ranked table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">All Subjects — Current Term</p>
        </div>
        <div className="divide-y divide-slate-50 dark:divide-slate-800">
          {subjects.length === 0 && (
            <p className="text-center py-8 text-slate-400 text-sm">No subject data.</p>
          )}
          {subjects.map((s, i) => (
            <div key={s.subject_id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-xs text-slate-400 w-5 text-right">{i + 1}</span>
              <span className="flex-1 text-sm text-slate-700 dark:text-slate-300 truncate">{s.subject_name}</span>
              <span className="text-xs text-slate-500">{s.student_count} students</span>
              <div className="w-28">
                <ScoreBar value={s.avg_score} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Term Comparison (multi-term trend engine)
// ─────────────────────────────────────────────────────────────────────────────
const CLASS_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16','#f97316','#14b8a6'];

function TermComparisonTab({ schoolId }: { schoolId: number | null }) {
  const { data, isLoading } = useSWR<{ ok: boolean } & TermComparisonData>(
    schoolId ? '/api/intelligence/term-comparison?limit_terms=6' : null,
    fetcher,
    { refreshInterval: 300_000 }
  );

  if (isLoading) return <LoadingGrid />;

  const schoolTrend = data?.school_trend ?? [];
  const classTrends = (data?.class_trends ?? []).slice(0, 8);
  const subjectTrends = (data?.subject_trends ?? []).slice(0, 10);
  const classificationTrend = data?.classification_trend ?? [];

  // Build multi-line class chart data: [{term_name, ClassName1: 72, ClassName2: 65, ...}]
  const classChartData = (data?.terms ?? []).map((t) => {
    const point: Record<string, string | number> = { term_name: t.name };
    classTrends.forEach(c => {
      const tp = c.trend.find(p => p.term_id === t.id);
      if (tp?.avg_score !== null && tp?.avg_score !== undefined) {
        point[c.class_name] = tp.avg_score;
      }
    });
    return point;
  });

  return (
    <div className="space-y-6">

      {/* ── School-wide trend line ────────────────────────────────────────── */}
      {schoolTrend.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">School-Wide Average — Term by Term</h3>
          <p className="text-xs text-slate-400 mb-4">Overall average score across all assessed students per term</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={schoolTrend} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="term_name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
              <Tooltip
                formatter={(v: number, name: string) => [`${v}%`, name]}
                labelFormatter={(l) => `Term: ${l}`}
              />
              <Line
                type="monotone"
                dataKey="avg_score"
                name="School Avg"
                stroke="#6366f1"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#6366f1' }}
                activeDot={{ r: 6 }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="pass_rate"
                name="Pass Rate %"
                stroke="#10b981"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
          {/* Summary row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
            {schoolTrend.slice(-1).map(latest => [
              { label: 'Latest Avg', value: `${latest.avg_score ?? '–'}%`, color: 'text-indigo-600 dark:text-indigo-400' },
              { label: 'Pass Rate', value: latest.pass_rate ? `${latest.pass_rate}%` : '–', color: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'At Risk', value: latest.at_risk_count ?? '–', color: 'text-red-600 dark:text-red-400' },
              { label: 'Students', value: latest.student_count ?? '–', color: 'text-slate-700 dark:text-slate-300' },
            ]).flat().map(stat => (
              <div key={stat.label} className="text-center px-2 py-2 rounded-xl bg-slate-50 dark:bg-slate-800">
                <p className={`text-base font-bold ${stat.color}`}>{String(stat.value)}</p>
                <p className="text-xs text-slate-400 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Per-class trend lines ─────────────────────────────────────────── */}
      {classChartData.length > 0 && classTrends.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Class Performance Trends</h3>
          <p className="text-xs text-slate-400 mb-4">Average score per class across terms</p>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={classChartData} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="term_name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
              <Tooltip formatter={(v: number, name: string) => [`${v}%`, name]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {classTrends.map((c, idx) => (
                <Line
                  key={c.class_id}
                  type="monotone"
                  dataKey={c.class_name}
                  stroke={CLASS_COLORS[idx % CLASS_COLORS.length]}
                  strokeWidth={1.5}
                  dot={{ r: 3 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          {/* Class delta table */}
          <div className="mt-4 space-y-1">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">First → Last term change</p>
            {classTrends.filter(c => c.delta !== null).map((c, idx) => (
              <div key={c.class_id} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: CLASS_COLORS[idx % CLASS_COLORS.length] }} />
                <span className="text-xs text-slate-600 dark:text-slate-400 flex-1 truncate">{c.class_name}</span>
                <span className={`text-xs font-mono font-semibold ${(c.delta ?? 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                  {(c.delta ?? 0) > 0 ? '+' : ''}{c.delta}pts
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Subject trend table ────────────────────────────────────────────── */}
      {subjectTrends.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Subject Averages — All Terms</p>
            <p className="text-xs text-slate-400 mt-0.5">Sorted by current average (weakest first)</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-50 dark:border-slate-800">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-slate-400 uppercase">Subject</th>
                  {(data?.terms ?? []).map(t => (
                    <th key={t.id} className="text-right px-3 py-2 text-xs font-semibold text-slate-400 uppercase whitespace-nowrap">{t.name}</th>
                  ))}
                  <th className="text-right px-4 py-2 text-xs font-semibold text-slate-400 uppercase">Swing</th>
                </tr>
              </thead>
              <tbody>
                {subjectTrends.map(s => (
                  <tr key={s.subject_id} className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 font-medium max-w-[120px] truncate">{s.subject_name}</td>
                    {(data?.terms ?? []).map(t => {
                      const tp = s.trend.find(p => p.term_id === t.id);
                      const score = tp?.avg_score;
                      const scoreColor = score === null || score === undefined ? 'text-slate-300' : score < 40 ? 'text-red-500' : score < 55 ? 'text-amber-500' : 'text-emerald-600';
                      return (
                        <td key={t.id} className={`text-right px-3 py-2 text-xs font-mono ${scoreColor}`}>
                          {score !== null && score !== undefined ? `${score}%` : '–'}
                        </td>
                      );
                    })}
                    <td className="text-right px-4 py-2 text-xs font-mono font-semibold text-slate-500">
                      {s.variance > 0 ? `±${s.variance}` : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Classification distribution per term ─────────────────────────── */}
      {classificationTrend.length > 1 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Student Classification — Term by Term</h3>
          <p className="text-xs text-slate-400 mb-4">How the student population distribution shifts across terms</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={classificationTrend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="term_name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="at_risk" name="At Risk" stackId="a" fill="#ef4444" />
              <Bar dataKey="struggling" name="Struggling" stackId="a" fill="#f97316" />
              <Bar dataKey="stable" name="Stable" stackId="a" fill="#94a3b8" />
              <Bar dataKey="performing" name="Performing" stackId="a" fill="#6366f1" />
              <Bar dataKey="high" name="High" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {(!schoolTrend.length && !isLoading) && (
        <div className="text-center py-12 text-slate-400 text-sm">
          No multi-term data yet. Needs at least one completed term with results.
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Attendance Intelligence (Phase 5+6)
// ─────────────────────────────────────────────────────────────────────────────
function AttendanceTab({ schoolId }: { schoolId: number | null }) {
  const [expandedRisk, setExpandedRisk] = useState<number | null>(null);

  const { data: overviewData, isLoading: ovLoading } = useSWR(
    schoolId ? '/api/intelligence/attendance-overview' : null, fetcher
  );
  const { data: trendsData,   isLoading: trLoading } = useSWR(
    schoolId ? '/api/intelligence/attendance-trends?days=21' : null, fetcher
  );
  const { data: riskData,     isLoading: rkLoading } = useSWR(
    schoolId ? '/api/intelligence/attendance-risk?limit=50' : null, fetcher
  );
  const { data: corrData,     isLoading: coLoading } = useSWR(
    schoolId ? '/api/intelligence/attendance-performance-correlation' : null, fetcher
  );

  const ov:   AttendanceOverview     | null = overviewData?.data ?? null;
  const tr:   AttendanceTrendsData   | null = trendsData?.data   ?? null;
  const rk:   AttendanceRiskData     | null = riskData?.data     ?? null;
  const corr: AttendanceCorrelationData | null = corrData?.data  ?? null;

  const isLoading = ovLoading || trLoading;

  const TREND_ICON: Record<string, React.ReactNode> = {
    improving: <TrendingUp  className="w-4 h-4 text-emerald-500" />,
    declining:  <TrendingDown className="w-4 h-4 text-red-500" />,
    stable:     <Activity    className="w-4 h-4 text-slate-400" />,
    no_data:    <Activity    className="w-4 h-4 text-slate-300" />,
  };

  const trend = ov?.week_trend ?? 'no_data';
  const trendColor =
    trend === 'improving' ? 'text-emerald-600 dark:text-emerald-400'
    : trend === 'declining' ? 'text-red-600 dark:text-red-400'
    : 'text-slate-500 dark:text-slate-400';

  // No-data state (school has no ZK device data)
  if (!isLoading && ov && ov.tracked_days === 0) {
    return (
      <div className="px-4 py-8 text-center space-y-3">
        <Fingerprint className="w-10 h-10 text-slate-300 mx-auto" />
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No biometric attendance data yet</p>
        <p className="text-xs text-slate-400 max-w-xs mx-auto">{ov.data_note}</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-5 space-y-5">

      {/* ── Overview cards ──────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-24 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />)}
        </div>
      ) : ov && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Tracked Days',    value: ov.tracked_days,           sub: `${ov.first_day ?? '–'} → ${ov.last_day ?? '–'}`, color: 'text-indigo-600' },
            { label: 'Today Scanned',   value: ov.today_scans,            sub: `of ${ov.total_enrolled} enrolled`,                color: 'text-slate-800 dark:text-slate-100' },
            { label: 'Biometric Cover', value: `${ov.scan_rate_pct}%`,    sub: `${ov.total_scanned_students} students scanned`,  color: ov.scan_rate_pct < 50 ? 'text-amber-600' : 'text-emerald-600' },
            { label: 'Avg Daily',       value: ov.avg_daily_attendance,   sub: `students per school day`,                        color: 'text-slate-800 dark:text-slate-100' },
          ].map(c => (
            <div key={c.label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 flex flex-col gap-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">{c.label}</span>
              <span className={`text-2xl font-bold ${c.color}`}>{c.value}</span>
              <span className="text-xs text-slate-400 truncate">{c.sub}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Week trend summary ──────────────────────────────────────────── */}
      {ov && ov.tracked_days > 0 && (
        <div className={`rounded-2xl border p-4 flex items-center gap-3 ${
          trend === 'improving' ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700'
          : trend === 'declining' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
          : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
        }`}>
          <div className="flex-shrink-0">{TREND_ICON[trend]}</div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${trendColor}`}>
              Attendance is {trend === 'no_data' ? 'not enough data yet' : trend}
              {ov.week_delta_pct !== null && ` (${ov.week_delta_pct > 0 ? '+' : ''}${ov.week_delta_pct}% vs last week)`}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              This week avg: {ov.week_avg} students/day &nbsp;·&nbsp; Prev week avg: {ov.prev_week_avg} students/day
            </p>
          </div>
        </div>
      )}

      {/* ── Daily trend chart ───────────────────────────────────────────── */}
      {trLoading ? (
        <div className="h-52 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
      ) : tr && tr.daily.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Daily Attendance (Last {tr.days_analysed} Days)</h3>
          <p className="text-xs text-slate-400 mb-4">Distinct students scanned per school day</p>
          {/* Mobile: horizontal scroll wrapper */}
          <div className="overflow-x-auto -mx-1 px-1">
            <div style={{ minWidth: Math.max(320, tr.daily.length * 36) }}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={tr.daily} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as AttendanceDailyPoint;
                      return (
                        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-xs shadow-lg">
                          <p className="font-semibold text-slate-700 dark:text-slate-200">{d.date}</p>
                          <p className="text-slate-500">{d.distinct_students} students · {d.total_scans} scans</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="distinct_students" name="Students" radius={[3, 3, 0, 0]}>
                    {tr.daily.map((entry, i) => (
                      <Cell key={i} fill={entry.distinct_students < (tr.total_enrolled * 0.4) ? '#f87171' : entry.distinct_students < (tr.total_enrolled * 0.7) ? '#fbbf24' : '#34d399'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          {tr.trend !== 'no_data' && (
            <p className="text-xs text-center text-slate-400 mt-2">
              Trend: <span className={`font-medium ${tr.trend === 'improving' ? 'text-emerald-600' : tr.trend === 'declining' ? 'text-red-500' : 'text-slate-500'}`}>{tr.trend}</span>
              {' '}&nbsp;·&nbsp; Confidence: {Math.round(tr.trend_confidence * 100)}%
            </p>
          )}
        </div>
      )}

      {/* ── At-Risk Students list ───────────────────────────────────────── */}
      {rkLoading ? (
        <div className="h-40 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
      ) : rk && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">At-Risk Students</h3>
              <p className="text-xs text-slate-400 mt-0.5">Students with irregular or absent attendance patterns</p>
            </div>
            {rk.summary.total_at_risk > 0 && (
              <span className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0">
                {rk.summary.total_at_risk} flagged
              </span>
            )}
          </div>

          {rk.summary.total_at_risk === 0 ? (
            <div className="py-6 text-center text-slate-400 text-sm">
              No at-risk students detected based on current data.
            </div>
          ) : (
            <>
              {/* Summary pills */}
              <div className="flex flex-wrap gap-2 mb-4">
                {rk.summary.recently_absent > 0 && (
                  <span className="flex items-center gap-1.5 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs px-2.5 py-1 rounded-full">
                    <AlertTriangle className="w-3 h-3" />
                    {rk.summary.recently_absent} recently absent
                  </span>
                )}
                {rk.summary.sparse > 0 && (
                  <span className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-xs px-2.5 py-1 rounded-full">
                    <Calendar className="w-3 h-3" />
                    {rk.summary.sparse} sparse attendance
                  </span>
                )}
              </div>

              {/* Student list — tap to expand on mobile */}
              <div className="space-y-2">
                {rk.students.map((s) => (
                  <div
                    key={s.student_id}
                    className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden"
                  >
                    <button
                      onClick={() => setExpandedRisk(expandedRisk === s.student_id ? null : s.student_id)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
                    >
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.risk === 'high' ? 'bg-red-500' : 'bg-amber-500'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{s.name}</p>
                        <p className="text-xs text-slate-500 truncate">{s.class_name ?? 'No class'} · {s.admission_no ?? '–'}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="text-right">
                          <p className={`text-sm font-bold ${s.attendance_pct < 50 ? 'text-red-600' : 'text-amber-600'}`}>{s.attendance_pct}%</p>
                          <p className="text-xs text-slate-400">{s.days_present}/{s.tracked_days} days</p>
                        </div>
                        {expandedRisk === s.student_id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </div>
                    </button>
                    {expandedRisk === s.student_id && (
                      <div className="px-4 pb-3 pt-1 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-700/50">
                        <div className="space-y-1">
                          {s.reasons.map((r, i) => (
                            <p key={i} className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                              <span className="w-1 h-1 rounded-full bg-slate-400 flex-shrink-0" />
                              {r}
                            </p>
                          ))}
                        </div>
                        {s.last_seen && (
                          <p className="text-xs text-slate-400 mt-2">Last seen: {s.last_seen}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Performance Correlation ─────────────────────────────────────── */}
      {coLoading ? (
        <div className="h-40 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
      ) : corr && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Attendance ↔ Performance Correlation</h3>
          <p className="text-xs text-slate-400 mb-4">Does attendance predict academic scores?</p>

          {!corr.data_available ? (
            <div className="py-4 space-y-2">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm font-medium">Correlation data not available yet</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{corr.data_note}</p>
            </div>
          ) : (
            <>
              {/* Insight banner */}
              <div className={`rounded-xl p-3 mb-4 text-sm ${
                corr.correlation === 'positive' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300'
                : corr.correlation === 'negative' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}>
                {corr.insight}
              </div>

              {/* Quartile bars — mobile scrollable */}
              {corr.quartiles && corr.quartiles.length > 0 && (
                <div className="overflow-x-auto -mx-1 px-1">
                  <div style={{ minWidth: 280 }}>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={corr.quartiles} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="tier" tick={{ fontSize: 10 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: any) => [`${v}%`, 'Avg Score']} />
                        <Bar dataKey="avg_score" name="Avg Score" radius={[4, 4, 0, 0]}>
                          {(corr.quartiles ?? []).map((q, i) => (
                            <Cell key={i} fill={['#f87171', '#fbbf24', '#60a5fa', '#34d399'][i] ?? '#94a3b8'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              <p className="text-xs text-center text-slate-400 mt-1">
                {corr.student_count} students · Pearson r = {corr.pearson_r}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading placeholder
// ─────────────────────────────────────────────────────────────────────────────
function LoadingGrid() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="h-16 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function IntelligencePage() {
  const { user } = useAuth();
  const schoolId = user?.schoolId ?? null;

  // Read initial tab from ?tab= query param (client side)
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (typeof window === 'undefined') return 'overview';
    const p = new URLSearchParams(window.location.search).get('tab') as Tab | null;
    return (['overview', 'risk', 'patterns', 'classes', 'subjects', 'trends', 'attendance'].includes(p ?? '')) ? p! : 'overview';
  });

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview',  label: 'Overview',        icon: <Brain className="w-4 h-4" /> },
    { id: 'risk',      label: 'Risk',             icon: <AlertTriangle className="w-4 h-4" /> },
    { id: 'patterns',  label: 'Patterns',         icon: <Users className="w-4 h-4" /> },
    { id: 'classes',   label: 'Classes',          icon: <GraduationCap className="w-4 h-4" /> },
    { id: 'subjects',  label: 'Subjects',         icon: <BookOpen className="w-4 h-4" /> },
    { id: 'trends',     label: 'Trends',      icon: <BarChart3   className="w-4 h-4" /> },
    { id: 'attendance', label: 'Attendance',  icon: <Activity    className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/dashboard" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <ArrowLeft className="w-4 h-4 text-slate-500" />
          </Link>
          <div className="flex items-center gap-2 flex-1">
            <Brain className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h1 className="text-base font-bold text-slate-900 dark:text-white">Intelligence Engine</h1>
          </div>
        </div>
        {/* Tab bar */}
        <div className="max-w-5xl mx-auto mt-3 flex gap-1 overflow-x-auto pb-px">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-5">
        {activeTab === 'overview'  && <OverviewTab         schoolId={schoolId} />}
        {activeTab === 'risk'      && <RiskTab             schoolId={schoolId} />}
        {activeTab === 'patterns'  && <PatternsTab         schoolId={schoolId} />}
        {activeTab === 'classes'   && <ClassesTab          schoolId={schoolId} />}
        {activeTab === 'subjects'    && <SubjectsTab          schoolId={schoolId} />}
        {activeTab === 'trends'      && <TermComparisonTab    schoolId={schoolId} />}
        {activeTab === 'attendance'  && <AttendanceTab        schoolId={schoolId} />}
      </div>
    </div>
  );
}
