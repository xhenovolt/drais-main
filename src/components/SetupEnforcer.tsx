// src/components/SetupEnforcer.tsx
// Component to enforce school setup completion
// Shows alert and optionally blocks navigation until setup is complete

'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

interface SetupEnforcerProps {
  /**
   * If true, will lock all routes except setup until setup_complete = true
   * If false, will only show a banner alert
   */
  blockNavigation?: boolean;
}

/**
 * SetupEnforcer Component
 * Shows setup requirement alert to user
 * Optionally blocks navigation until school setup is complete
 *
 * Usage:
 * <SetupEnforcer blockNavigation={false} />
 */
export const SetupEnforcer: React.FC<SetupEnforcerProps> = ({ blockNavigation = false }) => {
  const { setupComplete, school } = useAuth();

  if (setupComplete) {
    return null; // Setup is complete, don't show anything
  }

  // If blocking navigation, show full screen alert
  if (blockNavigation) {
    return (
      <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md">
          <div className="flex items-center justify-center w-12 h-12 mx-auto bg-yellow-100 rounded-full mb-4">
            <svg className="w-6 h-6 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-center text-gray-900 mb-2">
            Complete School Setup
          </h3>
          <p className="text-center text-gray-600 mb-6">
            Your school needs to be set up before you can access the full system. This usually takes a few
            minutes.
          </p>
          <Link
            href="/setup"
            className="block w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700
                       text-center font-medium transition-colors"
          >
            Complete Setup Now
          </Link>
        </div>
      </div>
    );
  }

  // Otherwise show a banner alert
  return (
    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
      <div className="flex">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <p className="text-sm font-medium text-yellow-800 mb-2">
            School setup incomplete
          </p>
          <p className="text-sm text-yellow-700 mb-3">
            Please complete your school setup to unlock all features.
          </p>
          <Link
            href="/setup"
            className="text-sm font-medium text-yellow-700 hover:text-yellow-600 underline"
          >
            Go to Setup →
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SetupEnforcer;
