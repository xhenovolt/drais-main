/**
 * src/app/unauthorized/page.tsx
 * 401 - Session Invalid / Not Authenticated
 */

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function UnauthorizedPage() {
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    // Auto-redirect to login after 5 seconds
    const timer = setTimeout(() => {
      setIsRedirecting(true);
      router.push('/login');
    }, 5000);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        {/* Error Code */}
        <div className="text-6xl font-bold text-red-500 mb-4">401</div>

        {/* Error Title */}
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Unauthorized</h1>

        {/* Error Message */}
        <p className="text-gray-600 mb-6">
          Your session has expired or is invalid. Please log in again to continue.
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <Link
            href="/login"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Go to Login
          </Link>
          <Link
            href="/"
            className="px-4 py-2 bg-gray-200 text-gray-900 rounded-lg font-medium hover:bg-gray-300 transition-colors"
          >
            Go Home
          </Link>
        </div>

        {/* Auto-redirect message */}
        {isRedirecting && (
          <p className="text-sm text-gray-500 mt-6">Redirecting to login...</p>
        )}
      </div>
    </div>
  );
}
