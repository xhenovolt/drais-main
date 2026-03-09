/**
 * src/components/auth/SetupLock.tsx
 * Shows modal/alert when school setup is incomplete
 * Blocks access to non-setup routes
 */

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, Settings } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface SetupLockProps {
  isOpen?: boolean;
  onDismiss?: () => void;
}

export const SetupLock: React.FC<SetupLockProps> = ({
  isOpen,
  onDismiss
}) => {
  const { school } = useAuth();
  const [showModal, setShowModal] = useState(false);

  // Show modal if setup incomplete and isOpen is true
  useEffect(() => {
    if (isOpen === undefined) {
      setShowModal(!school?.setup_complete);
    } else {
      setShowModal(isOpen);
    }
  }, [school?.setup_complete, isOpen]);

  const handleDismiss = () => {
    setShowModal(false);
    onDismiss?.();
  };

  if (!showModal) {
    return null;
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40 transition-opacity" />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 transform transition-all">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-shrink-0">
              <Settings className="w-6 h-6 text-blue-600 animate-spin-slow" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">
              Complete School Setup
            </h2>
          </div>

          {/* Message */}
          <div className="mb-6">
            <p className="text-gray-600">
              Your school is not yet set up. Please complete the initial setup to access all features.
            </p>
            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>What's next:</strong> You can only access the dashboard and settings during setup.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleDismiss}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              Dismiss
            </button>
            <Link
              href="/settings/school-setup"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors text-center"
            >
              Go to Setup
            </Link>
          </div>

          {/* Info */}
          <p className="text-xs text-gray-500 text-center mt-4">
            You can also access setup from Settings
          </p>
        </div>
      </div>
    </>
  );
};

export default SetupLock;
