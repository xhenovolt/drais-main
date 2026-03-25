'use client';

import Link from 'next/link';
import { AlertCircle, RotateCw } from 'lucide-react';

export default function MaintenancePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-24 h-24 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
            <AlertCircle size={48} className="text-red-600 dark:text-red-400" />
          </div>
        </div>

        {/* Error Code */}
        <div>
          <h1 className="text-6xl font-bold text-gray-900 dark:text-white">503</h1>
          <p className="text-xl font-semibold text-gray-700 dark:text-gray-300 mt-2">Service Unavailable</p>
        </div>

        {/* Description */}
        <p className="text-gray-600 dark:text-gray-400">
          The page you're trying to access encountered an error. Our team has been notified and is investigating the issue.
        </p>

        {/* Status Info */}
        <div className="space-y-2 p-4 bg-white/50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-semibold">Error Type:</span> Feature Maintenance
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-semibold">Status:</span> We're working on it
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          <button
            onClick={() => location.reload()}
            className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <RotateCw size={20} /> Try Again
          </button>
          <Link
            href="/dashboard"
            className="flex-1 px-6 py-3 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Dashboard
          </Link>
        </div>

        {/* Footer */}
        <div className="pt-6 border-t border-gray-200 dark:border-gray-700 space-y-2">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Error 503 • Service temporarily unavailable
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            If this persists, please contact support
          </p>
        </div>
      </div>
    </div>
  );
}
