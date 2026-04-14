"use client";
import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle, AlertTriangle, Info, CheckCircle2,
  Users, DollarSign, BookOpen, Wifi, Activity,
  ChevronDown, ChevronUp, ExternalLink, Zap,
  RefreshCw, Eye, X, ArrowRight,
} from 'lucide-react';
import useSWR from 'swr';
import { fetcher } from '@/utils/fetcher';
import { toast } from 'react-hot-toast';
import Link from 'next/link';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Urgency = 'critical' | 'high' | 'medium' | 'low';
type RecType = 'attendance' | 'fees' | 'academic' | 'device' | 'behavior';

interface AffectedEntity {
  id: number | string;
  label: string;
  meta?: string;
}

interface Recommendation {
  id: string;
  type: RecType;
  title: string;
  description: string;
  action: string;
  urgency: Urgency;
  affected_count: number;
  affected_entities: AffectedEntity[];
  action_url: string;
  auto_action_available: boolean;
  auto_action_label?: string;
}

interface RecData {
  recommendations: Recommendation[];
  summary: { critical: number; high: number; medium: number; low: number; total: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const URGENCY_CONFIG: Record<Urgency, {
  label: string;
  icon: React.ElementType;
  cardBorder: string;
  badge: string;
  iconColor: string;
  pulse: boolean;
}> = {
  critical: {
    label:      'CRITICAL',
    icon:       AlertCircle,
    cardBorder: 'border-red-300 dark:border-red-700 bg-red-50/40 dark:bg-red-950/20',
    badge:      'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
    iconColor:  'text-red-500',
    pulse:      true,
  },
  high: {
    label:      'HIGH',
    icon:       AlertTriangle,
    cardBorder: 'border-orange-200 dark:border-orange-700 bg-orange-50/30 dark:bg-orange-950/20',
    badge:      'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300',
    iconColor:  'text-orange-500',
    pulse:      false,
  },
  medium: {
    label:      'MEDIUM',
    icon:       Info,
    cardBorder: 'border-amber-200 dark:border-amber-700',
    badge:      'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
    iconColor:  'text-amber-500',
    pulse:      false,
  },
  low: {
    label:      'LOW',
    icon:       Info,
    cardBorder: 'border-gray-200 dark:border-slate-700',
    badge:      'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300',
    iconColor:  'text-gray-400',
    pulse:      false,
  },
};

const TYPE_ICON: Record<RecType, React.ElementType> = {
  attendance: Users,
  fees:       DollarSign,
  academic:   BookOpen,
  device:     Wifi,
  behavior:   Activity,
};

const TYPE_LABEL: Record<RecType, string> = {
  attendance: 'Attendance',
  fees:       'Fees',
  academic:   'Academic',
  device:     'Device',
  behavior:   'Behavior',
};

// ─────────────────────────────────────────────────────────────────────────────
// Summary bar
// ─────────────────────────────────────────────────────────────────────────────
function SummaryBar({ summary }: { summary: RecData['summary'] }) {
  if (summary.total === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {summary.critical > 0 && (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
          {summary.critical} Critical
        </span>
      )}
      {summary.high > 0 && (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-100 dark:bg-orange-950/50 text-orange-700 dark:text-orange-400 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
          {summary.high} High
        </span>
      )}
      {summary.medium > 0 && (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
          {summary.medium} Medium
        </span>
      )}
      {summary.low > 0 && (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 text-xs font-semibold">
          {summary.low} Low
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Recommendation Card
// ─────────────────────────────────────────────────────────────────────────────
function RecCard({
  rec,
  onDismiss,
  onAct,
}: {
  rec: Recommendation;
  onDismiss: (r: Recommendation) => void;
  onAct:     (r: Recommendation) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg      = URGENCY_CONFIG[rec.urgency];
  const UrgIcon  = cfg.icon;
  const TypeIcon = TYPE_ICON[rec.type];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
      className={`rounded-2xl border ${cfg.cardBorder} overflow-hidden transition-shadow hover:shadow-md`}
    >
      {/* ── Card header ─────────────────────────────────────── */}
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          {/* Urgency icon */}
          <div className="flex-shrink-0 mt-0.5">
            {cfg.pulse
              ? <span className="relative flex w-5 h-5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-60" />
                  <UrgIcon className={`relative w-5 h-5 ${cfg.iconColor}`} />
                </span>
              : <UrgIcon className={`w-5 h-5 ${cfg.iconColor}`} />
            }
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Badges */}
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${cfg.badge}`}>
                {cfg.label}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 text-xs text-gray-500 dark:text-gray-400">
                <TypeIcon className="w-3 h-3" />
                {TYPE_LABEL[rec.type]}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {rec.affected_count} affected
              </span>
            </div>

            {/* Title */}
            <h4 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white leading-snug">
              {rec.title}
            </h4>

            {/* Action line — always visible */}
            <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-300 flex items-start gap-1.5">
              <ArrowRight className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
              <span className="font-medium">{rec.action}</span>
            </p>
          </div>

          {/* Dismiss */}
          <button
            onClick={() => onDismiss(rec)}
            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="Dismiss for today"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Expand / collapse button ─────────────────────── */}
        <button
          onClick={() => setExpanded(x => !x)}
          className="mt-3 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {expanded ? 'Hide detail' : 'Show detail'}
        </button>
      </div>

      {/* ── Expanded body ─────────────────────────────────────── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-inherit px-4 sm:px-5 pb-4 sm:pb-5 pt-3 space-y-3">
              {/* Description */}
              <p className="text-sm text-gray-600 dark:text-gray-400">{rec.description}</p>

              {/* Affected entities list */}
              {rec.affected_entities.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    Affected ({rec.affected_entities.length})
                  </p>
                  <ul className="space-y-1 max-h-40 overflow-y-auto pr-1">
                    {rec.affected_entities.map((e, i) => (
                      <li key={i} className="flex items-start justify-between gap-2 text-sm">
                        <span className="font-medium text-gray-800 dark:text-gray-200">{e.label}</span>
                        {e.meta && <span className="text-xs text-gray-500 dark:text-gray-400 text-right flex-shrink-0">{e.meta}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 pt-1">
                <Link
                  href={rec.action_url}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  View Data
                  <ExternalLink className="w-3 h-3 text-gray-400" />
                </Link>

                {rec.auto_action_available && (
                  <button
                    onClick={() => onAct(rec)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    {rec.auto_action_label ?? 'Take Action'}
                  </button>
                )}

                <button
                  onClick={() => onDismiss(rec)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 dark:bg-slate-700 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
                >
                  Dismiss today
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
interface RecommendationEngineProps {
  schoolId: number | null;
}

type FilterType = 'all' | RecType | Urgency;

const RecommendationEngine: React.FC<RecommendationEngineProps> = ({ schoolId }) => {
  const [filter, setFilter] = useState<FilterType>('all');
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const { data, isLoading, error, mutate } = useSWR<{ success: boolean; data: RecData }>(
    schoolId ? `/api/dashboard/recommendations` : null,
    fetcher,
    { refreshInterval: 120_000, revalidateOnFocus: true },
  );

  const handleDismiss = useCallback(async (rec: Recommendation) => {
    setDismissed(prev => new Set(prev).add(rec.id));
    toast.success('Dismissed — won\'t show again today', { duration: 2000 });
    try {
      await fetch('/api/dashboard/recommendations/dismiss', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rec_id: rec.id, action: 'dismissed', rec_type: rec.type }),
      });
    } catch {
      // non-blocking — UI is already updated
    }
  }, []);

  const handleAct = useCallback(async (rec: Recommendation) => {
    toast.success(`Action recorded: ${rec.auto_action_label ?? 'Done'}`, { duration: 2000 });
    try {
      await fetch('/api/dashboard/recommendations/dismiss', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rec_id: rec.id, action: 'acted', rec_type: rec.type }),
      });
    } catch {
      // non-blocking
    }
    // Navigate to action URL
    window.location.href = rec.action_url;
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 p-5 animate-pulse">
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-gray-200 dark:bg-slate-700" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-1/4" />
                <div className="h-5 bg-gray-200 dark:bg-slate-700 rounded w-3/4" />
                <div className="h-3 bg-gray-100 dark:bg-slate-700 rounded w-2/3" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl p-5 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-red-700 dark:text-red-400">Recommendation engine unavailable</p>
          <button onClick={() => mutate()} className="mt-2 text-xs text-red-600 hover:text-red-700 flex items-center gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const allRecs = (data?.data?.recommendations ?? []).filter(r => !dismissed.has(r.id));
  const summary  = data?.data?.summary ?? { critical: 0, high: 0, medium: 0, low: 0, total: 0 };

  // Apply filter
  const filtered = allRecs.filter(r => {
    if (filter === 'all')                                            return true;
    if (['critical','high','medium','low'].includes(filter))         return r.urgency === filter;
    return r.type === filter;
  });

  // Group by urgency for section headers
  const criticals = filtered.filter(r => r.urgency === 'critical');
  const highs     = filtered.filter(r => r.urgency === 'high');
  const mediums   = filtered.filter(r => r.urgency === 'medium');
  const lows      = filtered.filter(r => r.urgency === 'low');

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            Decision Engine
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Exactly what to do right now — ranked by urgency
          </p>
        </div>
        <button
          onClick={() => mutate()}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 transition-colors flex-shrink-0"
          title="Refresh recommendations"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* ── Summary pills ───────────────────────────────────── */}
      {allRecs.length > 0 && <SummaryBar summary={{ ...summary, total: allRecs.length, critical: criticals.length, high: highs.length, medium: mediums.length, low: lows.length }} />}

      {/* ── Filter tabs ─────────────────────────────────────── */}
      {allRecs.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 flex-nowrap">
          {(['all', 'critical', 'high', 'medium', 'attendance', 'fees', 'academic', 'device', 'behavior'] as FilterType[]).map(f => {
            const count =
              f === 'all'      ? allRecs.length :
              f === 'critical' ? criticals.length :
              f === 'high'     ? highs.length :
              f === 'medium'   ? mediums.length :
              allRecs.filter(r => r.type === f || r.urgency === f).length;
            if (count === 0 && f !== 'all') return null;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                  filter === f
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                }`}
              >
                {f === 'all' ? `All (${count})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${count})`}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────── */}
      {allRecs.length === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-8 text-center"
        >
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
          <p className="font-semibold text-emerald-700 dark:text-emerald-400">
            No action needed right now
          </p>
          <p className="text-sm text-emerald-600/70 dark:text-emerald-500/70 mt-1">
            All systems normal. Recommendations will appear when data-backed issues are detected.
          </p>
        </motion.div>
      )}

      {/* ── Recommendation sections ──────────────────────────── */}
      <AnimatePresence mode="popLayout">
        {criticals.length > 0 && (
          <motion.div key="c" layout className="space-y-3">
            <SectionLabel label="🔥 Critical — Act Immediately" count={criticals.length} color="text-red-600 dark:text-red-400" />
            {criticals.map(r => (
              <RecCard key={r.id} rec={r} onDismiss={handleDismiss} onAct={handleAct} />
            ))}
          </motion.div>
        )}
        {highs.length > 0 && (
          <motion.div key="h" layout className="space-y-3">
            <SectionLabel label="⚠️ High Priority" count={highs.length} color="text-orange-600 dark:text-orange-400" />
            {highs.map(r => (
              <RecCard key={r.id} rec={r} onDismiss={handleDismiss} onAct={handleAct} />
            ))}
          </motion.div>
        )}
        {mediums.length > 0 && (
          <motion.div key="m" layout className="space-y-3">
            <SectionLabel label="📋 Medium Priority" count={mediums.length} color="text-amber-600 dark:text-amber-400" />
            {mediums.map(r => (
              <RecCard key={r.id} rec={r} onDismiss={handleDismiss} onAct={handleAct} />
            ))}
          </motion.div>
        )}
        {lows.length > 0 && (
          <motion.div key="l" layout className="space-y-3">
            <SectionLabel label="ℹ️ Low Priority" count={lows.length} color="text-gray-500 dark:text-gray-400" />
            {lows.map(r => (
              <RecCard key={r.id} rec={r} onDismiss={handleDismiss} onAct={handleAct} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Section label helper
// ─────────────────────────────────────────────────────────────────────────────
function SectionLabel({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className={`flex items-center gap-2 text-sm font-semibold ${color}`}>
      {label}
      <span className="text-xs font-normal text-gray-400">({count})</span>
      <div className="flex-1 h-px bg-current opacity-20" />
    </div>
  );
}

export default RecommendationEngine;
