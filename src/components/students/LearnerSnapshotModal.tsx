"use client";
/**
 * Quick academic/fee/attendance snapshot for a learner — opens from the list
 * row without navigating to the full profile. Reuses the P2 LearnerOverview
 * (which fetches /api/students/[id]/overview), so there is one source of truth
 * for the snapshot numbers.
 */
import React from 'react';
import Link from 'next/link';
import { X, ExternalLink } from 'lucide-react';
import LearnerOverview from './LearnerOverview';

export default function LearnerSnapshotModal({
  studentId, name, open, onClose,
}: {
  studentId: number | null;
  name?: string;
  open: boolean;
  onClose: () => void;
}) {
  if (!open || !studentId) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/40 backdrop-blur-sm pt-[8vh] px-4" onMouseDown={onClose}>
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <p className="text-sm font-bold text-slate-800 dark:text-white">{name || 'Learner'} — snapshot</p>
            <p className="text-[11px] text-slate-400">Performance, attendance, fees & recent activity</p>
          </div>
          <div className="flex items-center gap-1">
            <Link href={`/students/${studentId}`} title="Open full profile" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-600">
              <ExternalLink className="w-4 h-4" />
            </Link>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="p-4 max-h-[70vh] overflow-y-auto">
          <LearnerOverview studentId={studentId} />
        </div>
      </div>
    </div>
  );
}
