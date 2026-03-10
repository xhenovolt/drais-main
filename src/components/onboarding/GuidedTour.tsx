"use client";
/**
 * PHASE 21 — GUIDED PRODUCT TOUR
 * 5-step overlay tour that highlights key interface areas via [data-tour] attributes.
 * Uses a dark overlay with a "spotlight" cutout over the target element.
 * If target element not found, shows a centered modal-style step.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X, CheckCircle } from 'lucide-react';
import { useOnboarding, TourStep } from '@/contexts/OnboardingContext';

// ============================================
// TOUR STEP DEFINITIONS
// ============================================

interface TourStepDef {
  target: string;          // [data-tour="target"] selector
  title: string;
  description: string;
  icon: string;
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

const TOUR_STEPS: TourStepDef[] = [
  {
    target: 'dashboard',
    title: '📊 Your Dashboard',
    description:
      'This is your command centre. It shows real-time school activity — today\'s attendance, student counts, fee status, and AI insights. Everything you need at a glance.',
    icon: '📊',
    position: 'bottom',
  },
  {
    target: 'students',
    title: '👩‍🎓 Students Module',
    description:
      'Admit and manage every student in your school here. Before attendance can be tracked, students must be registered and their fingerprints enrolled. Start here first.',
    icon: '👩‍🎓',
    position: 'right',
  },
  {
    target: 'attendance',
    title: '👆 Attendance Module',
    description:
      'DRAIS is built attendance-first. This module records who arrives, who is late, and who is absent — automatically via fingerprint scanner. Zero manual roll calls.',
    icon: '👆',
    position: 'right',
  },
  {
    target: 'reports',
    title: '📋 Reports',
    description:
      'Generate attendance reports, academic performance summaries, and financial snapshots. Export to PDF or Excel. Send reports directly to parents by SMS.',
    icon: '📋',
    position: 'right',
  },
  {
    target: 'settings',
    title: '⚙️ Settings',
    description:
      'Configure your school name, academic year, late-arrival cut-off time, SMS notifications, and user roles. Make DRAIS work exactly the way your school operates.',
    icon: '⚙️',
    position: 'right',
  },
];

// ============================================
// BOUNDING BOX TRACKER
// ============================================

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function getElementRect(target: string): SpotlightRect | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const padding = 8;
  return {
    top: rect.top - padding + window.scrollY,
    left: rect.left - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

// ============================================
// TOOLTIP POSITION CALCULATOR
// ============================================

function getTooltipStyle(rect: SpotlightRect | null, position: TourStepDef['position']): React.CSSProperties {
  if (!rect || position === 'center') {
    return { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }

  const TOOLTIP_WIDTH = 360;
  const TOOLTIP_GAP = 16;

  switch (position) {
    case 'bottom':
      return {
        position: 'absolute',
        top: rect.top + rect.height + TOOLTIP_GAP,
        left: Math.min(rect.left, window.innerWidth - TOOLTIP_WIDTH - 16),
        width: TOOLTIP_WIDTH,
      };
    case 'top':
      return {
        position: 'absolute',
        bottom: window.scrollY + window.innerHeight - rect.top + TOOLTIP_GAP,
        left: Math.min(rect.left, window.innerWidth - TOOLTIP_WIDTH - 16),
        width: TOOLTIP_WIDTH,
      };
    case 'right':
      return {
        position: 'absolute',
        top: rect.top,
        left: rect.left + rect.width + TOOLTIP_GAP,
        width: TOOLTIP_WIDTH,
      };
    case 'left':
      return {
        position: 'absolute',
        top: rect.top,
        right: window.innerWidth - rect.left + TOOLTIP_GAP,
        width: TOOLTIP_WIDTH,
      };
  }
}

// ============================================
// COMPONENT
// ============================================

export default function GuidedTour() {
  const { tourActive, tourStep, nextTourStep, prevTourStep, exitTour } = useOnboarding();
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);

  const currentStep = TOUR_STEPS[tourStep];

  const measureTarget = useCallback(() => {
    if (!tourActive || !currentStep) return;
    const rect = getElementRect(currentStep.target);
    setSpotlightRect(rect);

    // Scroll element into view if found
    if (rect) {
      const el = document.querySelector(`[data-tour="${currentStep.target}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [tourActive, currentStep]);

  // Measure on mount, step change, and resize
  useEffect(() => {
    measureTarget();
    window.addEventListener('resize', measureTarget);
    return () => window.removeEventListener('resize', measureTarget);
  }, [measureTarget]);

  if (!tourActive) return null;

  const isFirst = tourStep === 0;
  const isLast = tourStep === (TOUR_STEPS.length - 1) as TourStep;
  const tooltipStyle = getTooltipStyle(spotlightRect, spotlightRect ? currentStep.position : 'center');

  return (
    <div className="fixed inset-0 z-[9998]" style={{ pointerEvents: 'all' }}>
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/70" />

      {/* Spotlight cutout — transparent window over target element */}
      {spotlightRect && (
        <div
          className="absolute bg-transparent ring-4 ring-indigo-400 ring-offset-0 rounded-xl transition-all duration-300"
          style={{
            top: spotlightRect.top,
            left: spotlightRect.left,
            width: spotlightRect.width,
            height: spotlightRect.height,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.70)',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Tooltip card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tourStep}
          initial={{ opacity: 0, y: 10, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.96 }}
          transition={{ duration: 0.2 }}
          style={tooltipStyle}
          className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        >
          {/* Step progress bar */}
          <div className="h-1 bg-gray-100 dark:bg-gray-800">
            <div
              className="h-full bg-indigo-600 transition-all duration-500"
              style={{ width: `${((tourStep + 1) / TOUR_STEPS.length) * 100}%` }}
            />
          </div>

          <div className="p-6">
            {/* Step counter */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                Step {tourStep + 1} of {TOUR_STEPS.length}
              </span>
              <button
                onClick={exitTour}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              {currentStep.title}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed mb-6">
              {currentStep.description}
            </p>

            {/* Dot indicators */}
            <div className="flex items-center justify-center gap-2 mb-6">
              {TOUR_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`rounded-full transition-all duration-300 ${
                    i === tourStep
                      ? 'w-6 h-2 bg-indigo-600'
                      : i < tourStep
                      ? 'w-2 h-2 bg-indigo-300'
                      : 'w-2 h-2 bg-gray-300 dark:bg-gray-600'
                  }`}
                />
              ))}
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-3">
              {!isFirst && (
                <button
                  onClick={prevTourStep}
                  className="flex items-center gap-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl text-sm font-medium transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
              )}
              <button
                onClick={nextTourStep}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                {isLast ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Finish Tour
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
