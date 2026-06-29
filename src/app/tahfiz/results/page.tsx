'use client';

import React, { Fragment, useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, GraduationCap, Medal, Shield, Loader2 } from 'lucide-react';
import TahfizResultsManager from '@/components/tahfiz/TahfizResultsManager';
import { useI18n } from '@/components/i18n/I18nProvider';

export default function TahfizResultsPage() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-bl from-emerald-400/30 via-teal-500/20 to-transparent blur-3xl rounded-full" />
        <div className="absolute bottom-0 left-0 w-[800px] h-[800px] bg-gradient-to-tr from-indigo-500/20 via-purple-600/15 to-transparent blur-3xl rounded-full" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-r from-fuchsia-400/10 via-pink-500/10 to-rose-500/10 blur-3xl rounded-full" />
      </div>

      {/* Main content */}
      <div className="relative z-10 p-4 md:p-8 space-y-8">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative rounded-3xl border border-white/20 dark:border-white/10 bg-gradient-to-br from-white/60 via-white/40 to-white/20 dark:from-slate-900/60 dark:via-slate-900/40 dark:to-slate-800/30 backdrop-blur-xl shadow-2xl overflow-hidden p-8"
        >
          {/* Header decorative elements */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-emerald-400/30 blur-3xl rounded-full" />
            <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-indigo-500/20 blur-3xl rounded-full" />
          </div>

          <div className="relative flex items-center gap-6">
            <div className="flex-shrink-0 w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 flex items-center justify-center shadow-lg">
              <BookOpen className="w-10 h-10 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 bg-clip-text text-transparent">
                {t('tahfizResults.title', 'Tahfiz Results Management')}
              </h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-3xl">
                {t('tahfizResults.subtitle', 'Manage and track Tahfiz program results for memorization, recitation, and performance metrics')}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Info Cards */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {/* Card 1: Tahfiz Metrics */}
          <div className="relative rounded-2xl border border-white/20 dark:border-white/10 bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent backdrop-blur-lg p-6 shadow-lg overflow-hidden group hover:shadow-xl transition-all">
            <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-400/20 blur-2xl rounded-full" />
            </div>
            <div className="relative flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-md">
                <GraduationCap className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                  {t('tahfizResults.card1Title', '7 Core Metrics')}
                </h3>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  {t('tahfizResults.card1Desc', 'Retention, Tajweed, Voice, Discipline, Portions, Attendance, Overall')}
                </p>
              </div>
            </div>
          </div>

          {/* Card 2: Bulk Entry */}
          <div className="relative rounded-2xl border border-white/20 dark:border-white/10 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent backdrop-blur-lg p-6 shadow-lg overflow-hidden group hover:shadow-xl transition-all">
            <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-400/20 blur-2xl rounded-full" />
            </div>
            <div className="relative flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-md">
                <Medal className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                  {t('tahfizResults.card2Title', 'Bulk Entry')}
                </h3>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  {t('tahfizResults.card2Desc', 'Add results for all learners at once with optimistic updates')}
                </p>
              </div>
            </div>
          </div>

          {/* Card 3: Real-time Updates */}
          <div className="relative rounded-2xl border border-white/20 dark:border-white/10 bg-gradient-to-br from-fuchsia-500/10 via-pink-500/5 to-transparent backdrop-blur-lg p-6 shadow-lg overflow-hidden group hover:shadow-xl transition-all">
            <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="absolute top-0 right-0 w-32 h-32 bg-fuchsia-400/20 blur-2xl rounded-full" />
            </div>
            <div className="relative flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-fuchsia-500 to-pink-500 flex items-center justify-center shadow-md">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                  {t('tahfizResults.card3Title', 'Inline Editing')}
                </h3>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  {t('tahfizResults.card3Desc', 'Click any score to edit directly with auto-grading')}
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Main Results Manager */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="relative rounded-3xl border border-white/20 dark:border-white/10 bg-gradient-to-br from-white/60 via-white/40 to-white/20 dark:from-slate-900/60 dark:via-slate-900/40 dark:to-slate-800/30 backdrop-blur-xl shadow-2xl overflow-hidden p-8"
        >
          {/* Decorative elements */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-emerald-400/10 blur-3xl rounded-full" />
            <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-indigo-500/10 blur-3xl rounded-full" />
          </div>

          <div className="relative">
            <TahfizResultsManager />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
