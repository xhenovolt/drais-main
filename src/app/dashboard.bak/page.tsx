// src/app/dashboard/page.tsx
// Main dashboard page for authenticated users

'use client';

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import SetupEnforcer from '@/components/SetupEnforcer';
import Navbar from '@/components/Navbar';
import Link from 'next/link';

function DashboardContent() {
  const { user, school, roles, hasRole } = useAuth();

  return (
    <>
      <Navbar />

      <div className="min-h-screen bg-gray-50">
        {/* Setup Alert */}
        <SetupEnforcer blockNavigation={false} />

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Welcome Section */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              Welcome, {user?.display_name}!
            </h1>
            <p className="text-gray-600 mt-2">
              School: <strong>{school?.name}</strong>
            </p>
            <p className="text-gray-600">
              Your roles: <strong>{roles?.join(', ') || 'None'}</strong>
            </p>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-gray-500 text-sm font-medium">Users</div>
              <div className="text-3xl font-bold text-gray-900 mt-2">0</div>
              <p className="text-gray-600 text-xs mt-2">Total users in school</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-gray-500 text-sm font-medium">Students</div>
              <div className="text-3xl font-bold text-gray-900 mt-2">0</div>
              <p className="text-gray-600 text-xs mt-2">Enrolled students</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-gray-500 text-sm font-medium">Classes</div>
              <div className="text-3xl font-bold text-gray-900 mt-2">0</div>
              <p className="text-gray-600 text-xs mt-2">Active classes</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-gray-500 text-sm font-medium">Attendance</div>
              <div className="text-3xl font-bold text-gray-900 mt-2">0%</div>
              <p className="text-gray-600 text-xs mt-2">Today's attendance</p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {hasRole('SuperAdmin') && (
                <>
                  <Link
                    href="/admin/users"
                    className="p-4 border border-gray-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 transition"
                  >
                    <div className="font-semibold text-gray-900">Manage Users</div>
                    <p className="text-gray-600 text-sm mt-1">Add, edit, and manage school users</p>
                  </Link>

                  <Link
                    href="/admin/roles"
                    className="p-4 border border-gray-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 transition"
                  >
                    <div className="font-semibold text-gray-900">Manage Roles</div>
                    <p className="text-gray-600 text-sm mt-1">Create and assign roles</p>
                  </Link>

                  <Link
                    href="/setup"
                    className="p-4 border border-gray-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 transition"
                  >
                    <div className="font-semibold text-gray-900">School Settings</div>
                    <p className="text-gray-600 text-sm mt-1">Configure school information</p>
                  </Link>
                </>
              )}

              {hasRole('Teacher') && (
                <>
                  <Link
                    href="/classes"
                    className="p-4 border border-gray-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 transition"
                  >
                    <div className="font-semibold text-gray-900">My Classes</div>
                    <p className="text-gray-600 text-sm mt-1">View and manage your classes</p>
                  </Link>

                  <Link
                    href="/attendance"
                    className="p-4 border border-gray-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 transition"
                  >
                    <div className="font-semibold text-gray-900">Attendance</div>
                    <p className="text-gray-600 text-sm mt-1">Mark student attendance</p>
                  </Link>

                  <Link
                    href="/marks"
                    className="p-4 border border-gray-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 transition"
                  >
                    <div className="font-semibold text-gray-900">Marks</div>
                    <p className="text-gray-600 text-sm mt-1">Enter and view marks</p>
                  </Link>
                </>
              )}

              {hasRole('Bursar') && (
                <>
                  <Link
                    href="/fees"
                    className="p-4 border border-gray-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 transition"
                  >
                    <div className="font-semibold text-gray-900">Fees Management</div>
                    <p className="text-gray-600 text-sm mt-1">Manage fees and payments</p>
                  </Link>

                  <Link
                    href="/reports"
                    className="p-4 border border-gray-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 transition"
                  >
                    <div className="font-semibold text-gray-900">Financial Reports</div>
                    <p className="text-gray-600 text-sm mt-1">View financial reports</p>
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Activity</h2>
            <div className="text-center text-gray-500 py-8">
              <p>No recent activity</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute requiredSetup={true}>
      <DashboardContent />
    </ProtectedRoute>
  );
}
