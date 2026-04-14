"use client";
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, UserCheck, UserX, Clock, TrendingUp, TrendingDown,
  AlertTriangle, AlertCircle, CheckCircle2, Wifi, WifiOff,
  RefreshCw, ChevronDown, ChevronUp, ShieldAlert,
} from 'lucide-react';
import useSWR from 'swr';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { fetcher } from '@/utils/fetcher';
import RecommendationEngine from '@/components/dashboard/RecommendationEngine';
import NarrativeSummary from '@/components/dashboard/NarrativeSummary';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface RiskStudent {
  student_id: number;
  name: string;
  class_name: string;
  gender: string;
  last_attendance_date: string | null;
  absences_7d: number;
  present_7d: number;
  total_marked_7d: number;
  risk_score: number;
  risk_level: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
}

interface Alert {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
}

interface IntelData {
  today: {
    total_students: number;
    present: number;
    absent: number;
    late: number;
    rate: number;
    yesterday_present: number;
    change_pct: number;
  };
  weekly_trend: { date: string; present: number; absent: number }[];
  monthly_trend: { date: string; present: number; absent: number }[];
  risk: {
    total: number;
    high: number;
    medium: number;
    low: number;
    students: RiskStudent[];
  };
  class_breakdown: { class_name: string; total: number; present: number; absent: number; late: number; rate: number }[];
  gender_breakdown: { gender: string; total: number; present: number; rate: number }[];
  devices: { total: number; online: number; offline: number };
  alerts: Alert[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const RISK_COLORS: Record<string, string> = {
  HIGH:   '#ef4444',
  MEDIUM: '#f59e0b',
  LOW:    '#3b82f6',
};

const GENDER_COLORS = ['#6366f1', '#ec4899', '#94a3b8'];

function fmtDate(d: string) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

function RateBadge({ rate }: { rate: number }) {
  const color = rate >= 80 ? 'bg-emerald-100 text-emerald-700' : rate >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>{rate}%</span>;
}

function RiskBadge({ level }: { level: string }) {
  const cls =
    level === 'HIGH'   ? 'bg-red-100 text-red-700 border border-red-200' :
    level === 'MEDIUM' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                         'bg-blue-100 text-blue-700 border border-blue-200';
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${cls}`}>{level}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

// Alert banner
function AlertBanner({ alerts }: { alerts: Alert[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!alerts.length) return null;

  const critical = alerts.filter(a => a.severity === 'critical').length;
  const warning  = alerts.filter(a => a.severity === 'warning').length;

  const bannerClass = critical > 0
    ? 'bg-red-50 border-red-300 dark:bg-red-950/40 dark:border-red-700'
    : 'bg-amber-50 border-amber-300 dark:bg-amber-950/40 dark:border-amber-700';
  const iconClass = critical > 0 ? 'text-red-600' : 'text-amber-600';

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border ${bannerClass} overflow-hidden`}
    >
      <button
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
        onClick={() => setExpanded(x => !x)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${iconClass}`} />
          <span className={`font-semibold text-sm ${iconClass}`}>
            {critical > 0 ? `${critical} critical` : ''}{critical > 0 && warning > 0 ? ', ' : ''}{warning > 0 ? `${warning} warning${warning > 1 ? 's' : ''}` : ''} detected today
          </span>
          {/* preview of first alert on mobile */}
          <span className="hidden sm:block text-xs text-gray-500 dark:text-gray-400 truncate ml-2">
            — {alerts[0].message}
          </span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 flex-shrink-0 text-gray-500" /> : <ChevronDown className="w-4 h-4 flex-shrink-0 text-gray-500" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-inherit overflow-hidden"
          >
            {alerts.map((a, i) => (
              <li key={i} className="flex items-start gap-3 px-4 py-3 border-b border-inherit last:border-b-0">
                {a.severity === 'critical'
                  ? <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-500" />
                  : <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" />
                }
                <span className="text-sm text-gray-800 dark:text-gray-200">{a.message}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Summary KPI cards
function SummaryCards({ today }: { today: IntelData['today'] }) {
  const changePct = today.change_pct;
  const changeColor = changePct >= 0 ? 'text-emerald-600' : 'text-red-500';
  const ChangeIcon  = changePct >= 0 ? TrendingUp : TrendingDown;

  const cards = [
    {
      label: 'Total Learners',
      value: today.total_students.toLocaleString(),
      icon: Users,
      iconBg: 'from-blue-500 to-indigo-600',
      sub: 'Enrolled & active',
    },
    {
      label: 'Present Today',
      value: today.present.toLocaleString(),
      icon: UserCheck,
      iconBg: 'from-emerald-500 to-teal-600',
      sub: (
        <span className={`flex items-center gap-1 text-xs ${changeColor}`}>
          <ChangeIcon className="w-3 h-3" />
          {changePct >= 0 ? '+' : ''}{changePct}% vs yesterday
        </span>
      ),
    },
    {
      label: 'Absent Today',
      value: today.absent.toLocaleString(),
      icon: UserX,
      iconBg: 'from-red-500 to-rose-600',
      sub: today.total_students > 0
        ? `${Math.round((today.absent / today.total_students) * 100)}% of learners`
        : '—',
    },
    {
      label: 'Attendance Rate',
      value: `${today.rate}%`,
      icon: TrendingUp,
      iconBg:
        today.rate >= 80 ? 'from-emerald-500 to-green-600' :
        today.rate >= 60 ? 'from-amber-500 to-orange-600' :
                           'from-red-500 to-rose-600',
      sub: today.late > 0 ? `${today.late} late arrivals` : 'No late arrivals',
    },
  ];

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
      {cards.map((c, i) => (
        <motion.div
          key={c.label}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.07 }}
          className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm border border-gray-100 dark:border-slate-700 hover:shadow-md transition-shadow"
        >
          <div className="flex items-start justify-between gap-2 mb-3">
            <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 leading-tight">{c.label}</p>
            <div className={`p-2 rounded-xl bg-gradient-to-br ${c.iconBg} flex-shrink-0`}>
              <c.icon className="w-4 h-4 text-white" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">{c.value}</p>
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{c.sub}</div>
        </motion.div>
      ))}
    </div>
  );
}

// Trend chart (7-day or 30-day)
function TrendChart({
  data,
  title,
  subtitle,
}: {
  data: { date: string; present: number; absent: number }[];
  title: string;
  subtitle: string;
}) {
  const formatted = data.map(d => ({ ...d, label: fmtDate(d.date) }));
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm border border-gray-100 dark:border-slate-700">
      <div className="mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">{title}</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
      </div>
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-36 text-gray-400 text-sm">No attendance data in this period</div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={formatted} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id="gradPresent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradAbsent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              formatter={(val: number, name: string) => [val, name === 'present' ? 'Present' : 'Absent']}
            />
            <Area type="monotone" dataKey="present" stroke="#10b981" strokeWidth={2} fill="url(#gradPresent)" dot={false} />
            <Area type="monotone" dataKey="absent"  stroke="#ef4444" strokeWidth={2} fill="url(#gradAbsent)"  dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
      <div className="flex items-center gap-4 mt-2">
        <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-3 h-1 rounded bg-emerald-500 inline-block" />Present</span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-3 h-1 rounded bg-red-500 inline-block" />Absent</span>
      </div>
    </div>
  );
}

// Risk panel
function RiskPanel({ risk }: { risk: IntelData['risk'] }) {
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? risk.students : risk.students.slice(0, 8);

  const pieData = [
    { name: 'High Risk',   value: risk.high,   color: '#ef4444' },
    { name: 'Medium Risk', value: risk.medium, color: '#f59e0b' },
    { name: 'Low Risk',    value: risk.low,    color: '#3b82f6' },
  ].filter(d => d.value > 0);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-red-50 dark:bg-red-950/40">
            <ShieldAlert className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">Behavioral Risk Engine</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Students silently drifting out of the system</p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{risk.total}</p>
          <p className="text-xs text-gray-500">at risk</p>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {/* Risk summary pills */}
        <div className="flex flex-wrap gap-2 mb-4">
          {risk.high > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
              {risk.high} High Risk
            </span>
          )}
          {risk.medium > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
              {risk.medium} Medium Risk
            </span>
          )}
          {risk.low > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
              {risk.low} Low Risk
            </span>
          )}
          {risk.total === 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">
              <CheckCircle2 className="w-3 h-3" /> All learners on track
            </span>
          )}
        </div>

        {risk.total > 0 && (
          <>
            {/* Pie + table layout */}
            <div className="flex flex-col lg:flex-row gap-4">
              {/* Donut chart */}
              {pieData.length > 0 && (
                <div className="flex-shrink-0 flex items-center justify-center">
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} dataKey="value" paddingAngle={3}>
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Table */}
              <div className="flex-1 min-w-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-slate-700">
                      <th className="text-left pb-2 pr-3 font-medium">Name</th>
                      <th className="text-left pb-2 pr-3 font-medium hidden sm:table-cell">Class</th>
                      <th className="text-left pb-2 pr-3 font-medium">Risk</th>
                      <th className="text-left pb-2 font-medium hidden md:table-cell">Signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayed.map(s => (
                      <tr key={s.student_id} className="border-b border-gray-50 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                        <td className="py-2 pr-3 font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">{s.name}</td>
                        <td className="py-2 pr-3 text-gray-500 dark:text-gray-400 hidden sm:table-cell whitespace-nowrap">{s.class_name}</td>
                        <td className="py-2 pr-3 whitespace-nowrap"><RiskBadge level={s.risk_level} /></td>
                        <td className="py-2 text-xs text-gray-500 dark:text-gray-400 hidden md:table-cell">{s.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {risk.students.length > 8 && (
                  <button
                    onClick={() => setShowAll(x => !x)}
                    className="mt-3 text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                  >
                    {showAll ? <><ChevronUp className="w-3.5 h-3.5" />Show less</> : <><ChevronDown className="w-3.5 h-3.5" />Show all {risk.students.length} students</>}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Class breakdown
function ClassBreakdown({ classes }: { classes: IntelData['class_breakdown'] }) {
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? classes : classes.slice(0, 8);
  if (classes.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
      <div className="px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-slate-700">
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">Attendance by Class</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">Today&lsquo;s presence per class</p>
      </div>
      <div className="p-4 sm:p-5">
        <div className="space-y-3">
          {displayed.map(cls => (
            <div key={cls.class_name}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{cls.class_name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{cls.present}/{cls.total}</span>
                  <RateBadge rate={cls.rate} />
                </div>
              </div>
              <div className="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${
                    cls.rate >= 80 ? 'bg-emerald-500' : cls.rate >= 60 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${cls.rate}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        {classes.length > 8 && (
          <button
            onClick={() => setShowAll(x => !x)}
            className="mt-4 text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
          >
            {showAll ? <><ChevronUp className="w-3.5 h-3.5" />Show less</> : <><ChevronDown className="w-3.5 h-3.5" />Show all {classes.length} classes</>}
          </button>
        )}
      </div>
    </div>
  );
}

// Gender & Device row
function GenderAndDevices({
  genders,
  devices,
}: {
  genders: IntelData['gender_breakdown'];
  devices: IntelData['devices'];
}) {
  const genderChartData = genders.map((g, i) => ({
    name:    g.gender === 'M' ? 'Male' : g.gender === 'F' ? 'Female' : g.gender,
    total:   g.total,
    present: g.present,
    color:   GENDER_COLORS[i] ?? '#94a3b8',
  }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Gender */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-4 sm:p-5">
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base mb-4">Attendance by Gender</h3>
        {genderChartData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={genderChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Bar dataKey="total"   name="Total"   fill="#e2e8f0" radius={[4,4,0,0]} />
                <Bar dataKey="present" name="Present" radius={[4,4,0,0]}>
                  {genderChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 flex flex-wrap gap-3">
              {genderChartData.map(g => (
                <span key={g.name} className="text-xs text-gray-500">
                  <span className="font-medium text-gray-700 dark:text-gray-300">{g.name}:</span> {g.present}/{g.total} ({g.total > 0 ? Math.round(g.present / g.total * 100) : 0}%)
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-400 py-6 text-center">No gender data available</p>
        )}
      </div>

      {/* Devices */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4">
          <Wifi className="w-4 h-4 text-gray-500" />
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">Biometric Device Status</h3>
        </div>
        {devices.total === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">No devices registered</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Online</span>
              </div>
              <span className="text-sm font-bold text-emerald-600">{devices.online}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Offline</span>
              </div>
              <span className="text-sm font-bold text-red-600">{devices.offline}</span>
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 dark:border-slate-700 pt-3">
              <span className="text-sm text-gray-500">Total</span>
              <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{devices.total}</span>
            </div>
            <div className="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-2 mt-1">
              <div
                className="h-2 rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${devices.total > 0 ? Math.round((devices.online / devices.total) * 100) : 0}%` }}
              />
            </div>
            <p className="text-xs text-gray-400">
              {devices.total > 0 ? Math.round((devices.online / devices.total) * 100) : 0}% devices online
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main CommandCenter Component
// ─────────────────────────────────────────────────────────────────────────────
interface CommandCenterProps {
  schoolId: number | null;
}

const CommandCenter: React.FC<CommandCenterProps> = ({ schoolId }) => {
  const { data, isLoading, error, mutate } = useSWR<{ success: boolean; data: IntelData }>(
    schoolId ? `/api/dashboard/intelligence` : null,
    fetcher,
    {
      refreshInterval: 60_000,      // auto-refresh every 60s
      revalidateOnFocus: true,
    },
  );

  const intel = data?.data;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {/* Skeleton */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-700 animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded mb-3 w-3/4" />
              <div className="h-8 bg-gray-200 dark:bg-slate-700 rounded mb-2 w-1/2" />
              <div className="h-3 bg-gray-100 dark:bg-slate-700 rounded w-2/3" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1].map(i => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-700 animate-pulse h-52" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !intel) {
    return (
      <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl p-6 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-red-700 dark:text-red-400">Failed to load intelligence data</p>
          <p className="text-sm text-red-600 dark:text-red-500 mt-1">{error?.message ?? 'Check your connection and try again.'}</p>
          <button onClick={() => mutate()} className="mt-3 text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Refresh indicator */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-white">School Command Center</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
            <Clock className="w-3 h-3" />
            Live data · refreshes every 60s
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

      {/* ── SECTION 1: DECISION ENGINE ─────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-4 sm:p-5">
        <RecommendationEngine schoolId={schoolId} />
      </div>

      {/* ── SECTION 2: ALERTS ────────────────────── */}
      {intel.alerts.length > 0 && <AlertBanner alerts={intel.alerts} />}

      {/* ── SECTION 2B: ATTENDANCE NARRATIVE ─────── */}
      <NarrativeSummary
        totalStudents={intel.today.total_students}
        present={intel.today.present}
        absent={intel.today.absent}
        late={intel.today.late}
        rate={intel.today.rate}
        yesterdayPresent={intel.today.yesterday_present}
        changePct={intel.today.change_pct}
        hasRecords={intel.today.present > 0 || intel.today.absent > 0}
        weeklyTrend={intel.weekly_trend}
      />

      {/* ── SECTION 3: SUMMARY CARDS ─────────────── */}
      <SummaryCards today={intel.today} />

      {/* ── SECTION 4: TREND CHARTS ───────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TrendChart
          data={intel.weekly_trend}
          title="7-Day Attendance Trend"
          subtitle="Present vs absent per day this week"
        />
        <TrendChart
          data={intel.monthly_trend}
          title="30-Day Attendance Trend"
          subtitle="Monthly pattern — spot recurring drops"
        />
      </div>

      {/* ── SECTION 5: RISK ENGINE ────────────────── */}
      <RiskPanel risk={intel.risk} />

      {/* ── SECTION 6: BREAKDOWNS ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ClassBreakdown classes={intel.class_breakdown} />
        <GenderAndDevices genders={intel.gender_breakdown} devices={intel.devices} />
      </div>
    </div>
  );
};

export default CommandCenter;
