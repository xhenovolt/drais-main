"use client";
/**
 * PHASE 27 — SMART EMPTY STATES
 * Shown inside any module when there is no data.
 * Provides helpful text and a clear action to get started.
 *
 * Usage:
 *   <EmptyState
 *     icon="👩‍🎓"
 *     title="No students admitted yet"
 *     description="Students must be registered before attendance can be taken. Start by admitting your first student."
 *     action={{ label: 'Admit First Student', href: '/students/admit' }}
 *     learnMoreHref="/documentation/admitting-students"
 *   />
 */

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, ExternalLink } from 'lucide-react';

interface EmptyStateAction {
  label: string;
  href: string;
  onClick?: () => void;
}

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  learnMoreHref?: string;
  compact?: boolean;
}

export default function EmptyState({
  icon = '📭',
  title,
  description,
  action,
  secondaryAction,
  learnMoreHref,
  compact = false,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col items-center justify-center text-center ${compact ? 'py-10 px-6' : 'py-20 px-8'}`}
    >
      {/* Icon */}
      <div className={`${compact ? 'text-4xl mb-3' : 'text-6xl mb-5'}`}>{icon}</div>

      {/* Text */}
      <h3 className={`font-semibold text-gray-900 dark:text-white ${compact ? 'text-base mb-1' : 'text-xl mb-2'}`}>
        {title}
      </h3>
      {description && (
        <p className={`text-gray-500 dark:text-gray-400 leading-relaxed max-w-sm ${compact ? 'text-xs mb-5' : 'text-sm mb-8'}`}>
          {description}
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {action && (
          <Link
            href={action.href}
            onClick={action.onClick}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-md shadow-indigo-200 dark:shadow-none transition-colors"
          >
            {action.label}
            <ArrowRight className="w-4 h-4" />
          </Link>
        )}

        {secondaryAction && (
          <Link
            href={secondaryAction.href}
            onClick={secondaryAction.onClick}
            className="inline-flex items-center gap-2 px-5 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium rounded-xl transition-colors"
          >
            {secondaryAction.label}
          </Link>
        )}

        {learnMoreHref && (
          <Link
            href={learnMoreHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Learn how
            <ExternalLink className="w-3 h-3" />
          </Link>
        )}
      </div>
    </motion.div>
  );
}
