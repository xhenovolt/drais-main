"use client";
/**
 * PHASE 20 — FIRST LOGIN WELCOME MODAL
 * Shown the first time a user opens the DRAIS dashboard.
 * Offers "Start Guided Tour" or "Skip for Now".
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Fingerprint, Rocket, X } from 'lucide-react';
import { useOnboarding } from '@/contexts/OnboardingContext';

export default function WelcomeModal() {
  const { hasSeenWelcome, dismissWelcome, startTour } = useOnboarding();

  // Only show when user hasn't seen the welcome yet
  if (hasSeenWelcome) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        {/* Backdrop click = skip */}
        <div className="absolute inset-0" onClick={dismissWelcome} />

        <motion.div
          initial={{ opacity: 0, scale: 0.85, y: 40 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.85, y: 40 }}
          transition={{ type: 'spring', stiffness: 280, damping: 26 }}
          className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden z-10"
        >
          {/* Gradient header */}
          <div className="bg-gradient-to-br from-indigo-600 via-blue-600 to-purple-700 px-8 pt-10 pb-8 text-white text-center">
            <div className="flex justify-center mb-4">
              <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center">
                <Fingerprint className="w-10 h-10 text-white" />
              </div>
            </div>
            <h2 className="text-3xl font-bold mb-2">Welcome to DRAIS</h2>
            <p className="text-blue-100 text-sm leading-relaxed">
              The most powerful school attendance system built for African schools.
            </p>
          </div>

          {/* Body */}
          <div className="px-8 py-6">
            <p className="text-gray-700 dark:text-gray-300 text-center leading-relaxed mb-6">
              DRAIS will guide you through everything — from admitting your first student to
              generating your first attendance report. The whole system is designed to teach
              itself to you.
            </p>

            <div className="grid grid-cols-3 gap-4 mb-8">
              {[
                { icon: '🏫', label: 'Set up school profile' },
                { icon: '👆', label: 'Enrol fingerprints' },
                { icon: '📊', label: 'Generate reports' },
              ].map(item => (
                <div
                  key={item.label}
                  className="flex flex-col items-center gap-2 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl text-center"
                >
                  <span className="text-2xl">{item.icon}</span>
                  <span className="text-xs text-indigo-700 dark:text-indigo-300 font-medium leading-tight">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>

            {/* CTA buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={startTour}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors shadow-md shadow-indigo-200 dark:shadow-none"
              >
                <Rocket className="w-4 h-4" />
                Start Guided Tour
              </button>
              <button
                onClick={dismissWelcome}
                className="flex-1 px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium rounded-xl transition-colors"
              >
                Skip for Now
              </button>
            </div>

            <p className="text-center text-xs text-gray-400 dark:text-gray-600 mt-4">
              You can restart the tour any time from the Help menu.
            </p>
          </div>

          {/* Close X */}
          <button
            onClick={dismissWelcome}
            className="absolute top-4 right-4 p-1 text-white/60 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
