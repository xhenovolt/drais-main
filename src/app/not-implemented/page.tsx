'use client';

import Link from 'next/link';
import { Wrench, Home, ArrowLeft } from 'lucide-react';

interface NotImplementedPageProps {
  route?: string;
}

export default function NotImplementedPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-24 h-24 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
            <Wrench size={48} className="text-amber-600 dark:text-amber-400" />
          </div>
        </div>

        {/* Error Code */}
        <div>
          <h1 className="text-6xl font-bold text-gray-900 dark:text-white">501</h1>
          <p className="text-xl font-semibold text-gray-700 dark:text-gray-300 mt-2">Not Implemented</p>
        </div>

        {/* Description */}
        <p className="text-gray-600 dark:text-gray-400">
          This feature is still under development. The route exists in the navigation menu, but the page hasn't been built yet.
        </p>

        {/* Status Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100 dark:bg-amber-900/30 rounded-full">
          <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
          <span className="text-sm font-medium text-amber-700 dark:text-amber-300">Coming Soon</span>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          <Link
            href="/dashboard"
            className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <Home size={20} /> Go to Dashboard
          </Link>
          <button
            onClick={() => window.history.back()}
            className="flex-1 px-6 py-3 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center gap-2 transition-colors"
          >
            <ArrowLeft size={20} /> Go Back
          </button>
        </div>

        {/* Footer */}
        <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Error 501 • Feature in development
          </p>
        </div>
      </div>
    </div>
  );
}
