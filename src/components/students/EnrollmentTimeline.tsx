"use client";
/**
 * DRAIS Phase 7 — Enrollment History Timeline
 * Renders a student's full enrollment history as a vertical timeline.
 * Shows each term they've been enrolled, the class, and highlights the current one.
 */
import React from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { fetcher } from '@/utils/fetcher';
import {
  GraduationCap, CheckCircle2, Clock, ChevronRight, ArrowUpRight,
} from 'lucide-react';
import clsx from 'clsx';

interface Enrollment {
  enrollment_id: number;
  class_name?: string;
  stream_name?: string;
  academic_year_name?: string;
  term_name?: string;
  enrollment_type?: string;
  status?: string;
  joined_at?: string;
  end_date?: string;
  end_reason?: string;
}

interface Props {
  studentId: number | string;
  currentEnrollmentId?: number;
}

const typeBadgeColor: Record<string, string> = {
  new: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  continuing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  transfer: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  repeat: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
};

const statusDot: Record<string, string> = {
  active: 'bg-emerald-500',
  completed: 'bg-slate-400',
  transferred: 'bg-amber-500',
  dropped: 'bg-red-500',
};

export default function EnrollmentTimeline({ studentId, currentEnrollmentId }: Props) {
  const { data, isLoading } = useSWR<any>(
    `/api/enrollments?student_id=${studentId}`,
    fetcher
  );

  const enrollments: Enrollment[] = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700" />
              <div className="w-px flex-1 bg-slate-200 dark:bg-slate-700 mt-1" />
            </div>
            <div className="flex-1 pb-4 space-y-1.5">
              <div className="h-4 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
              <div className="h-3 w-1/3 rounded bg-slate-100 dark:bg-slate-800" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (enrollments.length === 0) {
    return (
      <div className="text-center py-10 space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto">
          <GraduationCap className="w-6 h-6 text-slate-400" />
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">No enrollment history found.</p>
        <Link
          href="/students/enroll"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          Enroll this student <ArrowUpRight className="w-3 h-3" />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-4 uppercase tracking-wide">
        Enrollment History
      </h3>
      <div className="relative">
        {enrollments.map((e, idx) => {
          const isCurrent =
            e.status === 'active' ||
            e.enrollment_id === currentEnrollmentId;
          const isLast = idx === enrollments.length - 1;

          return (
            <div key={e.enrollment_id} className="flex gap-4">
              {/* Timeline column */}
              <div className="flex flex-col items-center">
                <div
                  className={clsx(
                    'w-4 h-4 rounded-full flex-shrink-0 ring-2 ring-white dark:ring-slate-800 shadow z-10',
                    statusDot[e.status ?? 'completed'] ?? 'bg-slate-400'
                  )}
                />
                {!isLast && (
                  <div className="w-px flex-1 bg-slate-200 dark:bg-slate-700 mt-1 min-h-[2rem]" />
                )}
              </div>

              {/* Content */}
              <div
                className={clsx(
                  'flex-1 pb-5',
                  isCurrent
                    ? 'rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700/50 p-3 -ml-1 mb-2'
                    : ''
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-800 dark:text-white">
                        {e.class_name ?? 'Unknown Class'}
                        {e.stream_name && (
                          <span className="text-slate-500 dark:text-slate-400 font-normal"> · {e.stream_name}</span>
                        )}
                      </span>
                      {isCurrent && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-600 text-white text-xs font-bold">
                          <Clock className="w-3 h-3" /> Current
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {e.academic_year_name} · {e.term_name}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {e.enrollment_type && (
                      <span className={clsx(
                        'inline-flex px-2 py-0.5 rounded-full text-xs font-semibold capitalize',
                        typeBadgeColor[e.enrollment_type] ?? 'bg-slate-100 text-slate-600'
                      )}>
                        {e.enrollment_type}
                      </span>
                    )}
                    {e.status && !isCurrent && (
                      <span className="text-xs text-slate-400 capitalize">{e.status}</span>
                    )}
                  </div>
                </div>

                {/* Extra info for non-active */}
                {!isCurrent && e.end_date && (
                  <p className="text-xs text-slate-400 mt-1">
                    Ended: {new Date(e.end_date).toLocaleDateString()}
                    {e.end_reason && <span className="capitalize"> · {e.end_reason}</span>}
                  </p>
                )}
                {isCurrent && e.joined_at && (
                  <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1">
                    Joined: {new Date(e.joined_at).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
