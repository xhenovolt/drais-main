"use client";

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function AuthenticationPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <Link
          href="/docs"
          className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:underline mb-8"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Documentation
        </Link>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-6">
            Authentication System
          </h1>

          <div className="prose dark:prose-invert max-w-none">
            <h2 className="text-2xl font-semibold mt-8 mb-4">Session-Based Authentication</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              DRAIS uses a secure session-based authentication system instead of JWT tokens. This approach provides better security and allows for instant session invalidation.
            </p>

            <h2 className="text-2xl font-semibold mt-8 mb-4">How It Works</h2>
            <ol className="list-decimal list-inside space-y-3 text-gray-700 dark:text-gray-300 mb-4">
              <li>
                <strong>Signup:</strong> User creates account with email and password. First user for a school becomes SuperAdmin.
              </li>
              <li>
                <strong>Login:</strong> Credentials are validated against bcrypt-hashed passwords in the database.
              </li>
              <li>
                <strong>Session Creation:</strong> A cryptographically secure 256-bit token is generated and stored in the database.
              </li>
              <li>
                <strong>Cookie Storage:</strong> Session token is stored in an HTTP-only, secure, SameSite cookie.
              </li>
              <li>
                <strong>Request Validation:</strong> Every request includes the session cookie, validated by middleware.
              </li>
              <li>
                <strong>Logout:</strong> Session is invalidated in database and cookie is cleared.
              </li>
            </ol>

            <h2 className="text-2xl font-semibold mt-8 mb-4">Security Features</h2>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 mb-4">
              <li><strong>HTTP-Only Cookies:</strong> Prevents XSS attacks by making cookies inaccessible to JavaScript</li>
              <li><strong>Secure Flag:</strong> Cookies only transmitted over HTTPS in production</li>
              <li><strong>SameSite Protection:</strong> Prevents CSRF attacks with SameSite=Lax policy</li>
              <li><strong>Password Hashing:</strong> Bcrypt with 12 rounds for secure password storage</li>
              <li><strong>Session Expiration:</strong> 7-day expiration with automatic cleanup</li>
              <li><strong>Failed Login Tracking:</strong> Account locking after repeated failed attempts</li>
            </ul>

            <h2 className="text-2xl font-semibold mt-8 mb-4">API Endpoints</h2>
            <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg mb-4">
              <ul className="space-y-2 font-mono text-sm text-gray-800 dark:text-gray-200">
                <li><strong>POST /api/auth/signup</strong> - Create new account</li>
                <li><strong>POST /api/auth/login</strong> - Authenticate user</li>
                <li><strong>GET /api/auth/me</strong> - Get current user</li>
                <li><strong>POST /api/auth/logout</strong> - End session</li>
              </ul>
            </div>

            <h2 className="text-2xl font-semibold mt-8 mb-4">Session Management</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Sessions are stored in the <code>sessions</code> table with the following information:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
              <li>Session token (hashed)</li>
              <li>User ID and School ID</li>
              <li>Expiration timestamp</li>
              <li>IP address and user agent</li>
              <li>Active/inactive status</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
