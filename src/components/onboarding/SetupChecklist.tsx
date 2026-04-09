"use client";
/**
 * PHASE 24 — INTERACTIVE SETUP CHECKLIST
 * Dashboard widget for new schools. Tracks 5 setup milestones.
 * Auto-checks items based on live API data.
 * Collapses once all items are complete.
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, ChevronDown, ChevronUp, Rocket, X } from 'lucide-react';
import Link from 'next/link';
import useSWR from 'swr';
import { fetcher } from '@/utils/fetcher';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useAuth } from '@/contexts/AuthContext';

export default function SetupChecklist() {
  const { checklistItems, markChecklistItem, onboardingComplete } = useOnboarding();
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem('drais-setup-dismissed') === '1'; } catch { return false; }
  });

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem('drais-setup-dismissed', '1'); } catch {}
  };

  // Auto-check via API data
  const { data: studentsData } = useSWR('/api/students/full?limit=1', fetcher, { revalidateOnFocus: false });
  const { data: classData }    = useSWR('/api/classes?limit=1',  fetcher, { revalidateOnFocus: false });
  const { data: attendData }   = useSWR(
    `/api/attendance?date=${new Date().toISOString().split('T')[0]}&limit=1`,
    fetcher,
    { revalidateOnFocus: false }
  );
  const { data: reportsData }  = useSWR('/api/reports/list?limit=1', fetcher, { revalidateOnFocus: false });

  useEffect(() => {
    // School profile — use school setupComplete from auth
    if (user?.school?.setupComplete) markChecklistItem('school_profile', true);
    // Classes
    if (classData?.data?.length > 0 || classData?.total > 0) markChecklistItem('first_class', true);
    // Students
    if (studentsData?.data?.length > 0 || studentsData?.total > 0) markChecklistItem('first_student', true);
    // Attendance
    if (attendData?.data?.length > 0) markChecklistItem('first_attendance', true);
    // Reports
    if (reportsData?.data?.length > 0) markChecklistItem('first_report', true);
  }, [user, classData, studentsData, attendData, reportsData, markChecklistItem]);

  // Don't show if dismissed or already completed for a while
  if (dismissed) return null;

  const completedCount = checklistItems.filter(i => i.completed).length;
  const progress = Math.round((completedCount / checklistItems.length) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden"
      data-tour="checklist"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center">
            <Rocket className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
              {onboardingComplete ? '🎉 Setup Complete!' : 'Getting Started'}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {completedCount} of {checklistItems.length} tasks done
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{progress}%</span>
          <button
            onClick={() => setCollapsed(c => !c)}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
          {onboardingComplete && (
            <button
              onClick={dismiss}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-100 dark:bg-gray-800">
        <motion.div
          className="h-full bg-indigo-500 transition-all duration-700"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
        />
      </div>

      {/* Checklist items */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <ul className="divide-y divide-gray-50 dark:divide-gray-800">
              {checklistItems.map((item, idx) => (
                <li key={item.id}>
                  <Link
                    href={item.completed ? '#' : item.actionRoute}
                    className={`flex items-center gap-4 px-5 py-3.5 transition-colors group ${
                      item.completed
                        ? 'opacity-60 cursor-default'
                        : 'hover:bg-indigo-50 dark:hover:bg-indigo-900/10'
                    }`}
                    onClick={e => item.completed && e.preventDefault()}
                  >
                    {/* Checkbox */}
                    <div className="flex-shrink-0">
                      {item.completed ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <Circle className="w-5 h-5 text-gray-300 dark:text-gray-600 group-hover:text-indigo-400 transition-colors" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${item.completed ? 'line-through text-gray-400' : 'text-gray-900 dark:text-white'}`}>
                        {item.label}
                      </p>
                      {!item.completed && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                          {item.description}
                        </p>
                      )}
                    </div>

                    {/* CTA */}
                    {!item.completed && (
                      <span className="flex-shrink-0 text-xs font-medium text-indigo-600 dark:text-indigo-400 group-hover:underline">
                        {item.actionLabel} →
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
