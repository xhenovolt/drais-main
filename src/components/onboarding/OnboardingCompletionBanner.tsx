"use client";
/**
 * PHASE 30 — ONBOARDING COMPLETION STATE
 * Celebratory banner shown on dashboard when all 5 checklist items are done.
 * Auto-dismisses after 10 seconds or when user clicks X.
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, X, Sparkles } from 'lucide-react';
import { useOnboarding } from '@/contexts/OnboardingContext';

export default function OnboardingCompletionBanner() {
  const { onboardingComplete } = useOnboarding();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (onboardingComplete && !dismissed) {
      // Only show if just completed (check sessionStorage so it doesn't reappear every page load)
      const shownKey = 'drais_completion_shown';
      if (!sessionStorage.getItem(shownKey)) {
        setVisible(true);
        sessionStorage.setItem(shownKey, '1');
        // Auto-dismiss after 10s
        const t = setTimeout(() => setVisible(false), 10000);
        return () => clearTimeout(t);
      }
    }
  }, [onboardingComplete, dismissed]);

  const dismiss = () => {
    setVisible(false);
    setDismissed(true);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -40 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[9980] w-full max-w-md px-4"
        >
          <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl shadow-xl px-6 py-4 text-white flex items-center gap-4">
            {/* Icon */}
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-6 h-6 text-white" />
            </div>

            {/* Message */}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">🎉 Your school is fully set up in DRAIS!</p>
              <p className="text-emerald-100 text-xs mt-0.5 leading-relaxed">
                You&apos;ve completed every step. Your school is ready for daily operations.
              </p>
            </div>

            {/* Dismiss */}
            <button
              onClick={dismiss}
              className="text-white/70 hover:text-white transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
