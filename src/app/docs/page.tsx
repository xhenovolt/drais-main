"use client";

import Link from 'next/link';
import { Book, Shield, Users, School, Key, FileText } from 'lucide-react';

export default function DocsPage() {
  const docSections = [
    {
      title: 'Overview',
      description: 'Learn about the DRAIS platform, its features, and architecture',
      icon: Book,
      href: '/docs/overview',
    },
    {
      title: 'Authentication',
      description: 'Session-based authentication system with secure cookie management',
      icon: Key,
      href: '/docs/authentication',
    },
    {
      title: 'Multi-Tenant Architecture',
      description: 'How DRAIS handles multiple schools with complete data isolation',
      icon: School,
      href: '/docs/multi-tenant-architecture',
    },
    {
      title: 'Student Management',
      description: 'Comprehensive student information, enrollment, and tracking system',
      icon: Users,
      href: '/docs/student-management',
    },
    {
      title: 'Role-Based Access Control',
      description: 'Dynamic RBAC system with granular permissions and hierarchical roles',
      icon: Shield,
      href: '/docs/role-based-access',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-4">
            DRAIS Documentation
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            Complete School Management System with Multi-Tenant Architecture
          </p>
        </div>

        {/* Documentation Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {docSections.map((section) => {
            const Icon = section.icon;
            return (
              <Link
                key={section.href}
                href={section.href}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 hover:shadow-xl transition-shadow duration-300 hover:scale-105 transform transition-transform"
              >
                <div className="flex items-center mb-4">
                  <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg mr-4">
                    <Icon className="w-6 h-6 text-blue-600 dark:text-blue-300" />
                  </div>
                  <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                    {section.title}
                  </h2>
                </div>
                <p className="text-gray-600 dark:text-gray-300">
                  {section.description}
                </p>
              </Link>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-16 text-center">
          <Link
            href="/"
            className="inline-block px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
