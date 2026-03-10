"use client";
/**
 * PHASE 28 — IN-PRODUCT HELP SEARCH
 * A searchable help bar that matches user questions to documentation pages.
 * Triggered via keyboard shortcut (Ctrl/Cmd + Shift + H) or help menu button.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, ExternalLink, BookOpen, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useOnboarding } from '@/contexts/OnboardingContext';

// ============================================
// HELP CONTENT DATABASE
// ============================================

interface HelpEntry {
  question: string;
  keywords: string[];
  answer: string;
  href: string;
  category: string;
}

const HELP_ENTRIES: HelpEntry[] = [
  {
    question: 'How do I admit a student?',
    keywords: ['admit', 'student', 'register', 'enrol', 'add student', 'new student'],
    answer: 'Go to Students → Admit Student. Fill in the student details and use the fingerprint scanner to enrol their fingerprint.',
    href: '/students/admit',
    category: 'Students',
  },
  {
    question: 'How does fingerprint attendance work?',
    keywords: ['fingerprint', 'biometric', 'attendance', 'scanner', 'automatic'],
    answer: 'Install the fingerprint device and connect it via the Device Settings. Students tap their finger to record arrival automatically.',
    href: '/documentation/attendance',
    category: 'Attendance',
  },
  {
    question: 'How do I manually record attendance?',
    keywords: ['manual', 'attendance', 'mark', 'record', 'roll call', 'absent', 'present'],
    answer: 'Go to Attendance. Select the date and class, then click each student\'s name to mark them Present or Absent.',
    href: '/attendance',
    category: 'Attendance',
  },
  {
    question: 'How do I generate an attendance report?',
    keywords: ['report', 'attendance', 'generate', 'export', 'download', 'pdf', 'excel'],
    answer: 'Go to Reports. Select the report type, date range, and class. Click Generate then Download.',
    href: '/reports',
    category: 'Reports',
  },
  {
    question: 'How do I add a class?',
    keywords: ['class', 'grade', 'stream', 'add class', 'create class'],
    answer: 'Go to Academics → Classes → Add Class. Enter the class name, grade level, and assign a teacher.',
    href: '/academics/classes',
    category: 'Academics',
  },
  {
    question: 'How do I add a teacher or staff member?',
    keywords: ['teacher', 'staff', 'employee', 'add teacher', 'staff member'],
    answer: 'Go to Staff → Add Staff Member. Enter their details, assign a role, and set their access level.',
    href: '/staff',
    category: 'Staff',
  },
  {
    question: 'How do I set up parent SMS notifications?',
    keywords: ['sms', 'parent', 'notification', 'alert', 'message', 'late', 'absent'],
    answer: 'Go to Settings → Notifications → SMS. Enable parent alerts and configure your SMS provider.',
    href: '/settings',
    category: 'Settings',
  },
  {
    question: 'How do I configure the late arrival cutoff time?',
    keywords: ['late', 'cutoff', 'time', 'tardy', 'arrival', 'configuration'],
    answer: 'Go to Settings → Attendance. Set the "Late Arrival After" time (e.g., 8:15 AM).',
    href: '/settings',
    category: 'Settings',
  },
  {
    question: 'How do I connect a fingerprint device?',
    keywords: ['device', 'fingerprint', 'connect', 'dahua', 'zkteco', 'hardware', 'scanner'],
    answer: 'Go to Settings → Devices. Enter the device IP address and credentials. Click Test Connection.',
    href: '/settings',
    category: 'Devices',
  },
  {
    question: 'How do I promote students to the next class?',
    keywords: ['promote', 'promotion', 'next class', 'grade', 'advance', 'move up'],
    answer: 'Go to Students → Promotions. Select the academic year, source class, and target class. Run the promotion.',
    href: '/promotions',
    category: 'Students',
  },
  {
    question: 'How do I create an exam and enter marks?',
    keywords: ['exam', 'marks', 'test', 'result', 'score', 'grade', 'assessment'],
    answer: 'Go to Academics → Exams → Create Exam. Once created, enter marks per student per subject.',
    href: '/documentation/exams',
    category: 'Academics',
  },
  {
    question: 'How do I reset my password?',
    keywords: ['password', 'reset', 'forgot', 'change password'],
    answer: 'Go to Settings → My Account → Change Password. Enter your current password and the new one.',
    href: '/settings',
    category: 'Account',
  },
];

// ============================================
// COMPONENT
// ============================================

export default function HelpSearch() {
  const { helpSearchOpen, setHelpSearchOpen } = useOnboarding();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (helpSearchOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
    }
  }, [helpSearchOpen]);

  // Keyboard shortcut: Ctrl/Cmd + Shift + H
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'H') {
        e.preventDefault();
        setHelpSearchOpen(!helpSearchOpen);
      }
      if (e.key === 'Escape' && helpSearchOpen) {
        setHelpSearchOpen(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [helpSearchOpen, setHelpSearchOpen]);

  const results = useMemo(() => {
    if (!query.trim()) return HELP_ENTRIES.slice(0, 5);
    const q = query.toLowerCase();
    return HELP_ENTRIES.filter(e =>
      e.question.toLowerCase().includes(q) ||
      e.keywords.some(k => k.includes(q)) ||
      e.answer.toLowerCase().includes(q)
    ).slice(0, 7);
  }, [query]);

  return (
    <AnimatePresence>
      {helpSearchOpen && (
        <div className="fixed inset-0 z-[9990] flex items-start justify-center pt-[15vh] px-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setHelpSearchOpen(false)}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -16 }}
            transition={{ duration: 0.2 }}
            className="relative z-10 w-full max-w-xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100 dark:border-gray-800">
              <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder='Ask a question — e.g. "How do I admit a student?"'
                className="flex-1 text-sm text-gray-900 dark:text-white placeholder-gray-400 bg-transparent outline-none"
              />
              <button
                onClick={() => setHelpSearchOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Results */}
            <div className="max-h-[50vh] overflow-y-auto">
              {results.length === 0 ? (
                <div className="py-10 text-center">
                  <BookOpen className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">No results found.</p>
                  <Link
                    href="/documentation"
                    target="_blank"
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline mt-1 inline-block"
                    onClick={() => setHelpSearchOpen(false)}
                  >
                    Browse full documentation →
                  </Link>
                </div>
              ) : (
                <ul>
                  {results.map(entry => (
                    <li key={entry.question}>
                      <Link
                        href={entry.href}
                        onClick={() => setHelpSearchOpen(false)}
                        className="flex items-start gap-4 px-5 py-4 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-colors group border-b border-gray-50 dark:border-gray-800 last:border-0"
                      >
                        {/* Category badge */}
                        <span className="mt-0.5 flex-shrink-0 text-xs font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-md whitespace-nowrap">
                          {entry.category}
                        </span>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white mb-0.5">
                            {entry.question}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2">
                            {entry.answer}
                          </p>
                        </div>

                        <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-500 flex-shrink-0 mt-0.5 transition-colors" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
              <span className="text-xs text-gray-400">
                <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs font-mono">Esc</kbd>
                {' '}to close
              </span>
              <Link
                href="/documentation"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                onClick={() => setHelpSearchOpen(false)}
              >
                Full documentation
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
