"use client";
/**
 * PHASE 22 — MODULE INTRODUCTION CARDS
 * Shown the first time a user opens a major module.
 * Dismisses itself and marks the module as seen in OnboardingContext.
 *
 * Usage:
 *   <ModuleIntroCard
 *     moduleId="students"
 *     icon="👩‍🎓"
 *     title="Students Module"
 *     description="Here you admit and manage all students in the school."
 *     actions={[{ label: 'Admit First Student', href: '/students/admit' }]}
 *     learnMoreHref="/documentation/admitting-students"
 *   />
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useOnboarding, ModuleId } from '@/contexts/OnboardingContext';

interface ModuleAction {
  label: string;
  href: string;
  onClick?: () => void;
  primary?: boolean;
}

interface ModuleIntroCardProps {
  moduleId: ModuleId;
  icon: string;
  title: string;
  description: string;
  actions?: ModuleAction[];
  learnMoreHref?: string;
  tip?: string;
}

export default function ModuleIntroCard({
  moduleId,
  icon,
  title,
  description,
  actions = [],
  learnMoreHref,
  tip,
}: ModuleIntroCardProps) {
  const { isModuleSeen, markModuleSeen } = useOnboarding();
  const [visible, setVisible] = useState(false);

  // Only render client-side to avoid hydration mismatch
  useEffect(() => {
    if (!isModuleSeen(moduleId)) {
      setVisible(true);
    }
  }, [isModuleSeen, moduleId]);

  const dismiss = () => {
    setVisible(false);
    markModuleSeen(moduleId);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16, height: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="mb-6 bg-gradient-to-r from-indigo-50 via-blue-50 to-purple-50 dark:from-indigo-900/20 dark:via-blue-900/20 dark:to-purple-900/20 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-5 relative overflow-hidden"
        >
          {/* Decorative blob */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-200/30 dark:bg-indigo-700/10 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />

          {/* Dismiss button */}
          <button
            onClick={dismiss}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1 rounded-lg hover:bg-white/50 dark:hover:bg-gray-700/50"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-start gap-4">
            {/* Icon */}
            <div className="text-4xl flex-shrink-0 mt-1">{icon}</div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
                {description}
              </p>

              {tip && (
                <div className="mb-4 flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                  <span className="text-amber-500 mt-0.5">💡</span>
                  <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">{tip}</p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-3">
                {actions.map(action => (
                  <Link
                    key={action.label}
                    href={action.href}
                    onClick={() => { dismiss(); action.onClick?.(); }}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      action.primary !== false
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                        : 'border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30'
                    }`}
                  >
                    {action.label}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                ))}

                {learnMoreHref && (
                  <Link
                    href={learnMoreHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Learn more
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                )}

                <button
                  onClick={dismiss}
                  className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors ml-auto"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
