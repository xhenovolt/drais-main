"use client";
import React from 'react';
import { motion } from 'framer-motion';
import { 
  Users, 
  UserCheck, 
  Calendar,
  TrendingUp,
  Award,
  Clock,
  Building,
  Plus,
  Eye
} from 'lucide-react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/apiClient';
import Link from 'next/link';
import NewBadge from '@/components/ui/NewBadge';

const StaffOverviewPage: React.FC = () => {
  // Fetch staff overview data (school_id derived from session on server)
  const { data: staffData, isLoading } = useSWR(
    `/api/staff/overview`,
    swrFetcher,
    { refreshInterval: 30000 }
  );

  const stats = staffData?.data || {};

  const overviewCards = [
    {
      title: 'Total Staff',
      value: stats.total_staff || 0,
      icon: Users,
      color: 'from-blue-500 to-cyan-500',
      textColor: 'text-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20'
    },
    {
      title: 'Active Staff',
      value: stats.active_staff || 0,
      icon: UserCheck,
      color: 'from-green-500 to-emerald-500',
      textColor: 'text-green-600',
      bgColor: 'bg-green-50 dark:bg-green-900/20'
    },
    {
      title: 'Departments',
      value: stats.total_departments || 0,
      icon: Building,
      color: 'from-purple-500 to-pink-500',
      textColor: 'text-purple-600',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20'
    },
    {
      title: 'Avg Attendance',
      value: `${stats.avg_attendance || 0}%`,
      icon: Calendar,
      color: 'from-orange-500 to-red-500',
      textColor: 'text-orange-600',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                👥 Staff Overview
              </h1>
              <NewBadge size="sm" animated />
            </div>
            <p className="text-gray-600 dark:text-gray-400">
              Comprehensive staff management dashboard
            </p>
          </div>

          <div className="flex gap-3">
            <Link
              href="/staff/add"
              className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all duration-200"
            >
              <Plus className="w-5 h-5" />
              Add Staff
            </Link>
            <Link
              href="/staff/list"
              className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-gray-600 to-gray-800 text-white rounded-lg hover:shadow-lg transition-all duration-200"
            >
              <Eye className="w-5 h-5" />
              View All
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {overviewCards.map((card, index) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    {card.title}
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {isLoading ? '...' : card.value}
                  </p>
                </div>
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center`}>
                  <card.icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Staff */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Recent Staff Additions
            </h3>
            {/* Add recent staff content */}
            <div className="space-y-3">
              {/* Placeholder for recent staff list */}
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Recent staff members will appear here
              </p>
            </div>
          </motion.div>

          {/* Department Overview */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Department Distribution
            </h3>
            {/* Add department distribution content */}
            <div className="space-y-3">
              {/* Placeholder for department chart */}
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Department statistics will appear here
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default StaffOverviewPage;
