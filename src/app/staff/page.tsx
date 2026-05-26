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
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Recent Staff Additions
              </h3>
              <Link href="/staff/list" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                View all →
              </Link>
            </div>
            {isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className="h-12 rounded-lg bg-slate-100 dark:bg-slate-700/40 animate-pulse" />
                ))}
              </div>
            ) : !stats.recent_staff || stats.recent_staff.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Users className="w-8 h-8 mx-auto mb-2" />
                <p className="text-sm">No staff added yet.</p>
                <Link href="/staff/add" className="text-xs text-indigo-600 hover:underline">
                  Add the first staff member →
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                {stats.recent_staff.map((s: any) => {
                  const fullName = [s.first_name, s.last_name].filter(Boolean).join(' ').trim() || `Staff #${s.id}`;
                  const subtitle = [s.position_name, s.department_name].filter(Boolean).join(' · ');
                  return (
                    <li key={s.id} className="flex items-center gap-3 py-2.5">
                      <Link href={`/staff/${s.id}`} className="flex items-center gap-3 flex-1 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg px-2 -mx-2 transition">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 overflow-hidden">
                          {s.photo_url ? (
                            <img src={s.photo_url} alt={fullName} className="w-full h-full object-cover" />
                          ) : (
                            <span>{(s.first_name?.[0] || '?').toUpperCase()}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{fullName}</p>
                          {subtitle && <p className="text-[11px] text-slate-400 truncate">{subtitle}</p>}
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                          s.status === 'active'
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                        }`}>
                          {s.status}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.div>

          {/* Department Overview */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Department Distribution
              </h3>
              <Link href="/admin/departments" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                Manage →
              </Link>
            </div>
            {isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700/40 animate-pulse" />
                ))}
              </div>
            ) : !stats.by_department || stats.by_department.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Building className="w-8 h-8 mx-auto mb-2" />
                <p className="text-sm">No departments defined yet.</p>
                <Link href="/admin/departments" className="text-xs text-indigo-600 hover:underline">
                  Create a department →
                </Link>
              </div>
            ) : (() => {
              const max = Math.max(...stats.by_department.map((d: any) => Number(d.staff_count) || 0), 1);
              return (
                <ul className="space-y-2.5">
                  {stats.by_department.map((d: any) => {
                    const count = Number(d.staff_count) || 0;
                    const pct = Math.round((count / max) * 100);
                    return (
                      <li key={d.department_id} className="text-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-slate-700 dark:text-slate-200 truncate">{d.department_name}</span>
                          <span className="text-xs font-mono text-slate-500">{count}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500"
                               style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              );
            })()}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default StaffOverviewPage;
