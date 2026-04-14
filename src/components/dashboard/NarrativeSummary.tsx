"use client";
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2, Info, BookOpen } from 'lucide-react';
import {
  generateAttendanceNarrative,
  generateTrendNarrative,
  type AttendanceNarrative,
  type TrendNarrative,
} from '@/lib/narrativeEngine';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────
interface NarrativeSummaryProps {
  totalStudents: number;
  present: number;
  absent: number;
  late: number;
  rate: number;
  yesterdayPresent: number;
  changePct: number;
  hasRecords: boolean;
  weeklyTrend: { date: string; present: number; absent: number }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Tone → colour / icon / banner mapping
// ─────────────────────────────────────────────────────────────────────────────
const TONE_CONFIG: Record<
  AttendanceNarrative['tone'],
  {
    outer: string;
    header: string;
    bullet: string;
    icon: React.ElementType;
    iconColor: string;
  }
> = {
  positive: {
    outer:  'border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/30 dark:border-emerald-800',
    header: 'text-emerald-800 dark:text-emerald-300',
    bullet: 'text-emerald-700 dark:text-emerald-400',
    icon:   CheckCircle2,
    iconColor: 'text-emerald-600',
  },
  neutral: {
    outer:  'border-blue-200 bg-blue-50/50 dark:bg-blue-950/30 dark:border-blue-800',
    header: 'text-blue-800 dark:text-blue-300',
    bullet: 'text-blue-700 dark:text-blue-400',
    icon:   Info,
    iconColor: 'text-blue-500',
  },
  warning: {
    outer:  'border-amber-200 bg-amber-50/60 dark:bg-amber-950/30 dark:border-amber-800',
    header: 'text-amber-800 dark:text-amber-300',
    bullet: 'text-amber-700 dark:text-amber-400',
    icon:   AlertTriangle,
    iconColor: 'text-amber-500',
  },
  critical: {
    outer:  'border-red-300 bg-red-50/70 dark:bg-red-950/40 dark:border-red-800',
    header: 'text-red-800 dark:text-red-300',
    bullet: 'text-red-700 dark:text-red-400',
    icon:   AlertTriangle,
    iconColor: 'text-red-600',
  },
  empty: {
    outer:  'border-gray-200 bg-gray-50/60 dark:bg-slate-800/60 dark:border-slate-700',
    header: 'text-gray-700 dark:text-gray-300',
    bullet: 'text-gray-600 dark:text-gray-400',
    icon:   BookOpen,
    iconColor: 'text-gray-400',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Trend pill
// ─────────────────────────────────────────────────────────────────────────────
function TrendPill({ trend }: { trend: TrendNarrative }) {
  const Icon = trend.direction === 'up'
    ? TrendingUp
    : trend.direction === 'down'
      ? TrendingDown
      : Minus;

  const cls = trend.direction === 'up'
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
    : trend.direction === 'down'
      ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400'
      : 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-400';

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${cls}`}>
      <Icon className="w-3.5 h-3.5" />
      {trend.sentence}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
const NarrativeSummary: React.FC<NarrativeSummaryProps> = ({
  totalStudents,
  present,
  absent,
  late,
  rate,
  yesterdayPresent,
  changePct,
  hasRecords,
  weeklyTrend,
}) => {
  const narrative: AttendanceNarrative = useMemo(
    () =>
      generateAttendanceNarrative({
        totalStudents,
        present,
        absent,
        late,
        rate,
        yesterdayPresent,
        changePct,
        hasRecords,
      }),
    [totalStudents, present, absent, late, rate, yesterdayPresent, changePct, hasRecords],
  );

  const trend: TrendNarrative = useMemo(
    () => generateTrendNarrative(weeklyTrend, totalStudents),
    [weeklyTrend, totalStudents],
  );

  const cfg = TONE_CONFIG[narrative.tone];
  const ToneIcon = cfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`rounded-2xl border p-4 sm:p-5 ${cfg.outer}`}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        <ToneIcon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${cfg.iconColor}`} />
        <div className="min-w-0 flex-1">
          <h3 className={`text-sm sm:text-base font-semibold leading-snug ${cfg.header}`}>
            {narrative.headline}
          </h3>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
            {narrative.body}
          </p>
        </div>
      </div>

      {/* Bullet points */}
      {narrative.bullets.length > 0 && (
        <ul className="mt-3 ml-8 space-y-1">
          {narrative.bullets.map((b, i) => (
            <li key={i} className={`text-xs sm:text-sm flex items-start gap-1.5 ${cfg.bullet}`}>
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
              {b}
            </li>
          ))}
        </ul>
      )}

      {/* Trend pill */}
      {weeklyTrend.length > 2 && (
        <div className="mt-3 ml-8">
          <TrendPill trend={trend} />
        </div>
      )}

      {/* Action CTA */}
      {narrative.action && (
        <div className="mt-3 ml-8 text-xs font-medium text-gray-500 dark:text-gray-400 italic">
          → {narrative.action}
        </div>
      )}
    </motion.div>
  );
};

export default NarrativeSummary;
