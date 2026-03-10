"use client";
/**
 * ONBOARDING ORCHESTRATOR
 * Single root-level component that renders all global onboarding UI:
 *   - WelcomeModal (Phase 20)
 *   - GuidedTour (Phase 21)
 *   - HelpSearch (Phase 28)
 *
 * Mount this once inside the root layout so it's available on every page.
 * Module-level cards (Phase 22) and module-level help buttons (Phase 23)
 * are placed directly in their respective page components.
 */

import React from 'react';
import WelcomeModal from './WelcomeModal';
import GuidedTour from './GuidedTour';
import HelpSearch from './HelpSearch';
import { useAuth } from '@/contexts/AuthContext';

export default function OnboardingOrchestrator() {
  const { isAuthenticated } = useAuth();

  // Render onboarding UI for authenticated users only
  if (!isAuthenticated) return null;

  return (
    <>
      {/* Phase 20: First login welcome */}
      <WelcomeModal />

      {/* Phase 21: Guided tour overlay */}
      <GuidedTour />

      {/* Phase 28: Help search (Ctrl+Shift+H) */}
      <HelpSearch />
    </>
  );
}
