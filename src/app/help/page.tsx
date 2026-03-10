"use client";
/**
 * PHASE 29 — HELP CENTER
 * In-product help center at /help
 * Contains video tutorials, step-by-step guides, and documentation links.
 * Focused on USAGE — how to operate the system.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Play,
  BookOpen,
  Search,
  ChevronRight,
  Fingerprint,
  Users,
  BarChart3,
  GraduationCap,
  Settings,
  MessageSquare,
  Youtube,
} from 'lucide-react';
import { useOnboarding } from '@/contexts/OnboardingContext';

// ============================================
// DATA
// ============================================

const VIDEO_TUTORIALS = [
  {
    id: null,
    title: 'Getting Started with DRAIS',
    duration: '3:24',
    description: 'A complete walkthrough of setting up your school from scratch.',
    category: 'Getting Started',
  },
  {
    id: null,
    title: 'Fingerprint Attendance Setup',
    duration: '4:10',
    description: 'How to connect your fingerprint device and start automatic attendance.',
    category: 'Attendance',
  },
  {
    id: null,
    title: 'Admitting Students',
    duration: '2:45',
    description: 'Step-by-step guide to admitting students and enrolling fingerprints.',
    category: 'Students',
  },
  {
    id: null,
    title: 'Generating Attendance Reports',
    duration: '2:15',
    description: 'How to create and export attendance reports for any period.',
    category: 'Reports',
  },
  {
    id: null,
    title: 'Setting Up Parent SMS Alerts',
    duration: '3:00',
    description: 'Configure automatic SMS notifications for late or absent students.',
    category: 'Notifications',
  },
  {
    id: null,
    title: 'Managing Exams and Results',
    duration: '3:50',
    description: 'Create exams, enter marks, and generate result slips.',
    category: 'Academics',
  },
];

const GUIDE_CATEGORIES = [
  {
    icon: Fingerprint,
    label: 'Attendance',
    color: 'text-indigo-600 dark:text-indigo-400',
    bg: 'bg-indigo-50 dark:bg-indigo-900/20',
    href: '/documentation/attendance',
    guides: ['How fingerprint attendance works', 'Manual attendance entry', 'Late arrival detection', 'Parent notifications'],
  },
  {
    icon: Users,
    label: 'Students',
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    href: '/documentation/admitting-students',
    guides: ['Admitting new students', 'Enrolling fingerprints', 'Editing student records', 'Class promotions'],
  },
  {
    icon: BarChart3,
    label: 'Reports',
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    href: '/documentation/reports',
    guides: ['Attendance reports', 'Academic reports', 'Exporting to PDF / Excel', 'Financial snapshots'],
  },
  {
    icon: GraduationCap,
    label: 'Academics',
    color: 'text-purple-600 dark:text-purple-400',
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    href: '/documentation/exams',
    guides: ['Creating classes', 'Setting up exams', 'Entering marks', 'Result slips'],
  },
  {
    icon: MessageSquare,
    label: 'Communication',
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    href: '/documentation/getting-started',
    guides: ['SMS notifications', 'Parent portal', 'Staff announcements', 'Reminders'],
  },
  {
    icon: Settings,
    label: 'Settings',
    color: 'text-gray-600 dark:text-gray-400',
    bg: 'bg-gray-50 dark:bg-gray-800/50',
    href: '/documentation/getting-started',
    guides: ['School profile setup', 'User roles & permissions', 'Device configuration', 'Academic year setup'],
  },
];

const FAQS = [
  {
    q: 'Do I need internet to record attendance?',
    a: 'No. Fingerprint devices store data locally. Syncing to DRAIS happens whenever internet is available.',
  },
  {
    q: 'Can parents see their child\'s attendance?',
    a: 'Yes. You can send SMS alerts automatically. A parent portal is on the roadmap.',
  },
  {
    q: 'Can multiple teachers use DRAIS at the same time?',
    a: 'Yes. Each staff member has their own account with role-based access.',
  },
  {
    q: 'What happens if the fingerprint device is offline?',
    a: 'The device stores attendance locally. Once reconnected, records sync automatically.',
  },
  {
    q: 'How do I promote students to the next class?',
    a: 'Go to Students → Promotions. Select the source and target classes, then confirm.',
  },
];

// ============================================
// COMPONENT
// ============================================

export default function HelpPage() {
  const { setHelpSearchOpen, startTour } = useOnboarding();
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-950">
      {/* Hero */}
      <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800 px-6 py-12 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 bg-indigo-100 dark:bg-indigo-900/40 rounded-2xl flex items-center justify-center">
              <BookOpen className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
            DRAIS Help Center
          </h1>
          <p className="text-gray-500 dark:text-gray-400 leading-relaxed mb-8">
            Everything you need to operate your school efficiently. Videos, guides, and quick answers.
          </p>

          {/* Search bar */}
          <button
            onClick={() => setHelpSearchOpen(true)}
            className="w-full max-w-md mx-auto flex items-center gap-3 px-5 py-3.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm hover:shadow-md hover:border-indigo-400 transition-all text-left"
          >
            <Search className="w-5 h-5 text-gray-400" />
            <span className="text-gray-400 text-sm flex-1">Search for anything — e.g. &ldquo;How do I admit a student?&rdquo;</span>
            <kbd className="text-xs bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5 font-mono text-gray-500">⌘⇧H</kbd>
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-12 space-y-16">

        {/* Quick actions row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            onClick={startTour}
            className="flex items-center gap-4 p-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl shadow-lg shadow-indigo-200 dark:shadow-none transition-colors text-left"
          >
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
              🚀
            </div>
            <div>
              <p className="font-semibold text-sm">Restart Guided Tour</p>
              <p className="text-indigo-200 text-xs mt-0.5">Walk through the whole system again</p>
            </div>
          </button>

          <Link
            href="/documentation/getting-started"
            target="_blank"
            className="flex items-center gap-4 p-5 bg-white dark:bg-gray-900 hover:shadow-md border border-gray-200 dark:border-gray-700 rounded-2xl transition-all text-left"
          >
            <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900 dark:text-white">Setup Guide</p>
              <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">Step-by-step setup from scratch</p>
            </div>
          </Link>

          <Link
            href="/contact"
            target="_blank"
            className="flex items-center gap-4 p-5 bg-white dark:bg-gray-900 hover:shadow-md border border-gray-200 dark:border-gray-700 rounded-2xl transition-all text-left"
          >
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <MessageSquare className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900 dark:text-white">Contact Support</p>
              <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">Reach the DRAIS team directly</p>
            </div>
          </Link>
        </div>

        {/* Video Tutorials */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
            <Youtube className="w-6 h-6 text-red-500" />
            Video Tutorials
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {VIDEO_TUTORIALS.map((video, idx) => (
              <motion.div
                key={video.title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md transition-all group"
              >
                {/* Thumbnail placeholder */}
                <div className="aspect-video bg-gray-900 flex flex-col items-center justify-center relative">
                  <div className="w-12 h-12 bg-red-600 group-hover:bg-red-500 transition-colors rounded-full flex items-center justify-center shadow-lg">
                    <Play className="w-6 h-6 text-white ml-0.5" />
                  </div>
                  <span className="absolute bottom-3 right-3 bg-black/70 text-white text-xs px-2 py-0.5 rounded-md font-mono">
                    {video.duration}
                  </span>
                  <span className="absolute top-3 left-3 bg-indigo-600 text-white text-xs px-2 py-0.5 rounded-md">
                    {video.category}
                  </span>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-sm text-gray-900 dark:text-white mb-1">{video.title}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{video.description}</p>
                  <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-2 font-medium">Coming soon</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Topic guides */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-indigo-500" />
            Step-by-Step Guides
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {GUIDE_CATEGORIES.map((cat, idx) => {
              const Icon = cat.icon;
              return (
                <motion.div
                  key={cat.label}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-10 h-10 ${cat.bg} rounded-xl flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 ${cat.color}`} />
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">{cat.label}</h3>
                  </div>
                  <ul className="space-y-2 mb-4">
                    {cat.guides.map(guide => (
                      <li key={guide} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <ChevronRight className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                        {guide}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={cat.href}
                    target="_blank"
                    className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Read guides →
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* FAQ */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
            Frequently Asked Questions
          </h2>
          <div className="space-y-3 max-w-3xl">
            {FAQS.map((faq, idx) => (
              <div
                key={idx}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
              >
                <button
                  onClick={() => setFaqOpen(faqOpen === idx ? null : idx)}
                  className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{faq.q}</span>
                  <ChevronRight
                    className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${faqOpen === idx ? 'rotate-90' : ''}`}
                  />
                </button>
                {faqOpen === idx && (
                  <div className="px-6 pb-5">
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
