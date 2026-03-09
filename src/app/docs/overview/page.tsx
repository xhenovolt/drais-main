"use client";

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function OverviewPage() {
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
            DRAIS Platform Overview
          </h1>

          <div className="prose dark:prose-invert max-w-none">
            <h2 className="text-2xl font-semibold mt-8 mb-4">What is DRAIS?</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              DRAIS (Digital Records and Information System) is a comprehensive school management platform designed for modern educational institutions. It provides a complete solution for managing students, staff, academics, finance, and operations in a secure, multi-tenant environment.
            </p>

            <h2 className="text-2xl font-semibold mt-8 mb-4">Core Features</h2>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 mb-4">
              <li><strong>Student Management:</strong> Complete student lifecycle from admission to graduation</li>
              <li><strong>Staff Management:</strong> Employee records, payroll, and attendance tracking</li>
              <li><strong>Academic Management:</strong> Classes, subjects, exams, and results</li>
              <li><strong>Finance Management:</strong> Fee structures, payments, and financial reporting</li>
              <li><strong>Attendance System:</strong> Biometric integration with real-time tracking</li>
              <li><strong>Document Management:</strong> Centralized document storage and retrieval</li>
            </ul>

            <h2 className="text-2xl font-semibold mt-8 mb-4">Technology Stack</h2>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 mb-4">
              <li><strong>Frontend:</strong> Next.js 15 with React and TypeScript</li>
              <li><strong>Styling:</strong> Tailwind CSS with dark mode support</li>
              <li><strong>Database:</strong> TiDB Cloud with MySQL compatibility</li>
              <li><strong>Authentication:</strong> Session-based with secure HTTP-only cookies</li>
              <li><strong>Deployment:</strong> Vercel with edge functions</li>
            </ul>

            <h2 className="text-2xl font-semibold mt-8 mb-4">System Architecture</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              DRAIS follows a modern, serverless architecture with:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 mb-4">
              <li><strong>Edge Middleware:</strong> Route protection and session validation</li>
              <li><strong>API Routes:</strong> RESTful endpoints for all operations</li>
              <li><strong>Server Components:</strong> Optimized rendering with React Server Components</li>
              <li><strong>Client Components:</strong> Interactive UI with minimal JavaScript</li>
            </ul>

            <h2 className="text-2xl font-semibold mt-8 mb-4">Who is it for?</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              DRAIS is designed for:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
              <li>Primary and secondary schools</li>
              <li>Islamic institutions (Tahfiz tracking included)</li>
              <li>Boarding schools with hostel management</li>
              <li>Multi-campus educational organizations</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
