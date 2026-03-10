"use client";
/**
 * PHASE 26 — QUICK ACTION BUTTONS (Dashboard)
 * Large, labelled shortcut cards for the most common first-time tasks.
 * Designed for new users who don't yet know where everything is.
 */

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { UserPlus, UserCheck, FileText, GraduationCap, Settings, BookOpen } from 'lucide-react';
import { useOnboarding } from '@/contexts/OnboardingContext';

const QUICK_ACTIONS = [
  {
    icon: UserPlus,
    label: 'Admit Student',
    description: 'Register a new student',
    href: '/students/admit',
    color: 'bg-indigo-500',
    hoverColor: 'hover:bg-indigo-600',
    lightBg: 'bg-indigo-50 dark:bg-indigo-900/20',
    textColor: 'text-indigo-600 dark:text-indigo-400',
    tour: 'students',
  },
  {
    icon: UserCheck,
    label: 'Record Attendance',
    description: 'Mark today\'s roll call',
    href: '/attendance',
    color: 'bg-emerald-500',
    hoverColor: 'hover:bg-emerald-600',
    lightBg: 'bg-emerald-50 dark:bg-emerald-900/20',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    tour: 'attendance',
  },
  {
    icon: FileText,
    label: 'Generate Report',
    description: 'Download an attendance report',
    href: '/reports',
    color: 'bg-blue-500',
    hoverColor: 'hover:bg-blue-600',
    lightBg: 'bg-blue-50 dark:bg-blue-900/20',
    textColor: 'text-blue-600 dark:text-blue-400',
    tour: 'reports',
  },
  {
    icon: GraduationCap,
    label: 'Add Teacher',
    description: 'Register a staff member',
    href: '/staff',
    color: 'bg-purple-500',
    hoverColor: 'hover:bg-purple-600',
    lightBg: 'bg-purple-50 dark:bg-purple-900/20',
    textColor: 'text-purple-600 dark:text-purple-400',
    tour: 'settings',
  },
  {
    icon: BookOpen,
    label: 'Add Class',
    description: 'Create a class / grade',
    href: '/academics/classes',
    color: 'bg-amber-500',
    hoverColor: 'hover:bg-amber-600',
    lightBg: 'bg-amber-50 dark:bg-amber-900/20',
    textColor: 'text-amber-600 dark:text-amber-400',
    tour: undefined,
  },
  {
    icon: Settings,
    label: 'School Settings',
    description: 'Configure your school profile',
    href: '/settings',
    color: 'bg-gray-500',
    hoverColor: 'hover:bg-gray-600',
    lightBg: 'bg-gray-50 dark:bg-gray-800/50',
    textColor: 'text-gray-600 dark:text-gray-400',
    tour: 'settings',
  },
];

export default function QuickActions() {
  const { onboardingComplete } = useOnboarding();

  return (
    <div data-tour="quick-actions">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Quick Actions</h2>
        {!onboardingComplete && (
          <span className="text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full font-medium">
            Start here
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {QUICK_ACTIONS.map((action, idx) => {
          const Icon = action.icon;
          return (
            <motion.div
              key={action.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <Link
                href={action.href}
                data-tour={action.tour}
                className={`flex flex-col items-center gap-3 p-4 rounded-2xl ${action.lightBg} border border-transparent hover:border-current hover:shadow-md transition-all group`}
              >
                <div className={`w-12 h-12 ${action.color} ${action.hoverColor} rounded-xl flex items-center justify-center shadow-sm transition-colors`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <div className="text-center">
                  <p className={`text-xs font-semibold ${action.textColor} leading-tight`}>
                    {action.label}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-tight hidden sm:block">
                    {action.description}
                  </p>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
