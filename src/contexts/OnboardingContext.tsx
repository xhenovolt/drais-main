"use client";
/**
 * DRAIS Onboarding Context
 * Central state management for all in-product onboarding features.
 * Persisted in localStorage — no database required.
 *
 * Tracks:
 *   - First-login welcome modal
 *   - Guided tour progress
 *   - Per-module first-visit intro cards
 *   - Setup checklist item completion
 *   - Overall onboarding completion
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

// ============================================
// TYPES
// ============================================

export type TourStep = 0 | 1 | 2 | 3 | 4;

export type ChecklistItemId =
  | 'school_profile'
  | 'first_class'
  | 'first_student'
  | 'first_attendance'
  | 'first_report';

export interface ChecklistItem {
  id: ChecklistItemId;
  label: string;
  description: string;
  actionLabel: string;
  actionRoute: string;
  completed: boolean;
}

export type ModuleId = 'students' | 'attendance' | 'reports' | 'settings' | 'classes';

interface OnboardingState {
  hasSeenWelcome: boolean;
  tourActive: boolean;
  tourStep: TourStep;
  tourCompleted: boolean;
  seenModules: Partial<Record<ModuleId, boolean>>;
  checklist: Record<ChecklistItemId, boolean>;
  onboardingComplete: boolean;
  helpSearchOpen: boolean;
}

interface OnboardingContextType extends OnboardingState {
  // Welcome
  dismissWelcome: () => void;
  startTour: () => void;
  // Tour
  nextTourStep: () => void;
  prevTourStep: () => void;
  exitTour: () => void;
  // Modules
  markModuleSeen: (id: ModuleId) => void;
  isModuleSeen: (id: ModuleId) => boolean;
  // Checklist
  checklistItems: ChecklistItem[];
  markChecklistItem: (id: ChecklistItemId, completed: boolean) => void;
  // Help search
  setHelpSearchOpen: (open: boolean) => void;
  // Reset (for dev/testing)
  resetOnboarding: () => void;
}

// ============================================
// CHECKLIST DEFINITIONS
// ============================================

const CHECKLIST_DEFINITIONS: Omit<ChecklistItem, 'completed'>[] = [
  {
    id: 'school_profile',
    label: 'Complete school profile',
    description: 'Add your school name, logo, and contact details.',
    actionLabel: 'Go to Settings',
    actionRoute: '/settings',
  },
  {
    id: 'first_class',
    label: 'Add first class',
    description: 'Create at least one class before admitting students.',
    actionLabel: 'Add Class',
    actionRoute: '/academics/classes',
  },
  {
    id: 'first_student',
    label: 'Admit first student',
    description: 'Register a student and enrol their fingerprint.',
    actionLabel: 'Admit Student',
    actionRoute: '/students/admit',
  },
  {
    id: 'first_attendance',
    label: 'Record first attendance',
    description: 'Use the Attendance module to mark today\'s roll.',
    actionLabel: 'Go to Attendance',
    actionRoute: '/attendance',
  },
  {
    id: 'first_report',
    label: 'Generate first report',
    description: 'Download an attendance or academic report.',
    actionLabel: 'Go to Reports',
    actionRoute: '/reports',
  },
];

// ============================================
// STORAGE HELPERS
// ============================================

const STORAGE_KEY = 'drais_onboarding';

function loadState(): OnboardingState {
  if (typeof window === 'undefined') return defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

function saveState(state: OnboardingState) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked — fail silently
  }
}

function defaultState(): OnboardingState {
  return {
    hasSeenWelcome: false,
    tourActive: false,
    tourStep: 0,
    tourCompleted: false,
    seenModules: {},
    checklist: {
      school_profile: false,
      first_class: false,
      first_student: false,
      first_attendance: false,
      first_report: false,
    },
    onboardingComplete: false,
    helpSearchOpen: false,
  };
}

// ============================================
// CONTEXT
// ============================================

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}

// ============================================
// PROVIDER
// ============================================

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OnboardingState>(defaultState);

  // Load from localStorage on mount
  useEffect(() => {
    setState(loadState());
  }, []);

  // Persist any state changes
  useEffect(() => {
    saveState(state);
  }, [state]);

  // Check onboarding completion whenever checklist changes
  useEffect(() => {
    const allDone = Object.values(state.checklist).every(Boolean);
    if (allDone && !state.onboardingComplete) {
      setState(s => ({ ...s, onboardingComplete: true }));
    }
  }, [state.checklist, state.onboardingComplete]);

  const update = useCallback((partial: Partial<OnboardingState>) => {
    setState(s => ({ ...s, ...partial }));
  }, []);

  const dismissWelcome = useCallback(() => {
    update({ hasSeenWelcome: true, tourActive: false });
  }, [update]);

  const startTour = useCallback(() => {
    update({ hasSeenWelcome: true, tourActive: true, tourStep: 0 });
  }, [update]);

  const nextTourStep = useCallback(() => {
    setState(s => {
      const next = (s.tourStep + 1) as TourStep;
      if (next > 4) {
        // Tour complete
        return { ...s, tourActive: false, tourCompleted: true, tourStep: 0 };
      }
      return { ...s, tourStep: next };
    });
  }, []);

  const prevTourStep = useCallback(() => {
    setState(s => ({
      ...s,
      tourStep: (Math.max(0, s.tourStep - 1)) as TourStep,
    }));
  }, []);

  const exitTour = useCallback(() => {
    update({ tourActive: false });
  }, [update]);

  const markModuleSeen = useCallback((id: ModuleId) => {
    setState(s => ({
      ...s,
      seenModules: { ...s.seenModules, [id]: true },
    }));
  }, []);

  const isModuleSeen = useCallback((id: ModuleId) => {
    return state.seenModules[id] === true;
  }, [state.seenModules]);

  const markChecklistItem = useCallback((id: ChecklistItemId, completed: boolean) => {
    setState(s => ({
      ...s,
      checklist: { ...s.checklist, [id]: completed },
    }));
  }, []);

  const setHelpSearchOpen = useCallback((open: boolean) => {
    update({ helpSearchOpen: open });
  }, [update]);

  const resetOnboarding = useCallback(() => {
    const fresh = defaultState();
    setState(fresh);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const checklistItems: ChecklistItem[] = CHECKLIST_DEFINITIONS.map(def => ({
    ...def,
    completed: state.checklist[def.id],
  }));

  const value: OnboardingContextType = {
    ...state,
    checklistItems,
    dismissWelcome,
    startTour,
    nextTourStep,
    prevTourStep,
    exitTour,
    markModuleSeen,
    isModuleSeen,
    markChecklistItem,
    setHelpSearchOpen,
    resetOnboarding,
  };

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}
