"use client";
import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Users,
  UserCheck,
  UserX,
  Clock,
  Fingerprint,
  AlertCircle,
  TrendingUp,
  BarChart3,
  Activity,
  Download,
  RefreshCw,
  Filter,
  Search,
  ArrowRight,
} from 'lucide-react';
import { motion } from 'framer-motion';
import useSWR from 'swr';
import { toast } from 'react-hot-toast';
import Link from 'next/link';
import { fetcher } from '@/utils/fetcher';
import clsx from 'clsx';

interface StatCard {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  trend?: number;
}

const AttendanceDashboard: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedClass, setSelectedClass] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Fetch today's stats
  const { data: statsData, mutate: refreshStats } = useSWR(
    `/api/attendance/stats?date=${selectedDate}${selectedClass ? `&class_id=${selectedClass}` : ''}`,
    fetcher,
    { refreshInterval: 60000 }
  );

  // Fetch classes
  const { data: classData } = useSWR('/api/classes', fetcher);

  // Fetch attendance summary
  const { data: summaryData } = useSWR(
    `/api/attendance?date=${selectedDate}${selectedClass ? `&class_id=${selectedClass}` : ''}`,
    fetcher,
    { refreshInterval: 30000 }
  );

  const stats = statsData?.data || {
    total_students: 0,
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
    not_marked: 0,
    attendance_percentage: 0,
  };

  const classes = classData?.data || [];
  const students = summaryData?.data || [];

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshStats();
      toast.success('Attendance data refreshed');
    } finally {
      setRefreshing(false);
    }
  };

  const statCards: StatCard[] = [
    {
      label: 'Total Students',
      value: stats.total_students || 0,
      icon: <Users className="w-6 h-6" />,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      label: 'Present',
      value: stats.present || 0,
      icon: <UserCheck className="w-6 h-6" />,
      color: 'text-green-600',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      trend: stats.total_students > 0 ? Math.round((stats.present / stats.total_students) * 100) : 0,
    },
    {
      label: 'Absent',
      value: stats.absent || 0,
      icon: <UserX className="w-6 h-6" />,
      color: 'text-red-600',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
    },
    {
      label: 'Late',
      value: stats.late || 0,
      icon: <Clock className="w-6 h-6" />,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    },
    {
      label: 'Excused',
      value: stats.excused || 0,
      icon: <AlertCircle className="w-6 h-6" />,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    },
    {
      label: 'Attendance Rate',
      value: `${(stats.attendance_percentage || 0).toFixed(1)}%`,
      icon: <TrendingUp className="w-6 h-6" />,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
    },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
              📊 Attendance Management
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Real-time student and staff attendance tracking
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all',
              'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
            )}
          >
            <RefreshCw className={clsx('w-4 h-4', refreshing && 'animate-spin')} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              📅 Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              🏫 Class
            </label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Classes</option>
              {classes.map((cls: any) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ staggerChildren: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8"
      >
        {statCards.map((card, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className={clsx(
              'rounded-xl p-6 backdrop-blur-md',
              'bg-white/80 dark:bg-slate-800/80',
              'border border-white/20 dark:border-white/10',
              'hover:shadow-lg transition-all duration-300'
            )}
          >
            <div className="flex items-start justify-between mb-4">
              <div className={clsx('p-3 rounded-lg', card.bgColor)}>
                <span className={card.color}>{card.icon}</span>
              </div>
              {card.trend !== undefined && (
                <div className="text-sm font-semibold text-green-600 bg-green-50 dark:bg-green-900/20 px-3 py-1 rounded-full">
                  {card.trend}%
                </div>
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                {card.label}
              </p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {card.value}
              </p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
      >
        {[
          {
            title: 'Daily Attendance',
            description: 'Mark attendance manually',
            icon: <UserCheck className="w-5 h-5" />,
            href: '/attendance',
            color: 'from-blue-500 to-blue-600',
          },
          {
            title: 'Sessions',
            description: 'Manage attendance sessions',
            icon: <Calendar className="w-5 h-5" />,
            href: '/attendance/sessions',
            color: 'from-purple-500 to-purple-600',
          },
          {
            title: 'Reports',
            description: 'View attendance reports',
            icon: <BarChart3 className="w-5 h-5" />,
            href: '/attendance/reports',
            color: 'from-green-500 to-green-600',
          },
          {
            title: 'Biometric Devices',
            description: 'Configure biometric devices',
            icon: <Fingerprint className="w-5 h-5" />,
            href: '/attendance/biometric',
            color: 'from-orange-500 to-orange-600',
          },
        ].map((action, index) => (
          <Link
            key={index}
            href={action.href}
            className="group"
          >
            <motion.div
              whileHover={{ y: -4 }}
              className={clsx(
                'h-full rounded-xl p-6 text-white',
                `bg-gradient-to-br ${action.color}`,
                'cursor-pointer transition-all duration-300',
                'hover:shadow-xl'
              )}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-white/20 rounded-lg group-hover:bg-white/30 transition-colors">
                  {action.icon}
                </div>
                <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transform translate-x-0 group-hover:translate-x-1 transition-all" />
              </div>
              <h3 className="font-semibold text-lg mb-1">{action.title}</h3>
              <p className="text-sm text-white/80">{action.description}</p>
            </motion.div>
          </Link>
        ))}
      </motion.div>

      {/* Attendance Summary Table */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className={clsx(
          'rounded-xl backdrop-blur-md',
          'bg-white/80 dark:bg-slate-800/80',
          'border border-white/20 dark:border-white/10',
          'overflow-hidden'
        )}
      >
        <div className="p-6 border-b border-white/10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Today's Attendance Summary
          </h2>
        </div>

        {students.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10 bg-gray-50/50 dark:bg-slate-900/50">
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Student
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Class
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {students.slice(0, 10).map((student: any, index: number) => (
                  <tr
                    key={index}
                    className="hover:bg-gray-50/50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {student.photo_url && (
                          <img
                            src={student.photo_url}
                            alt={student.first_name}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        )}
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {student.first_name} {student.last_name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {student.admission_no || 'N/A'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {student.class_name || 'N/A'}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={clsx(
                          'px-3 py-1 rounded-full text-xs font-semibold',
                          student.attendance_status === 'present' &&
                            'bg-green-100 text-green-700 dark:bg-green-900/20',
                          student.attendance_status === 'absent' &&
                            'bg-red-100 text-red-700 dark:bg-red-900/20',
                          student.attendance_status === 'late' &&
                            'bg-orange-100 text-orange-700 dark:bg-orange-900/20',
                          student.attendance_status === 'excused' &&
                            'bg-blue-100 text-blue-700 dark:bg-blue-900/20',
                          student.attendance_status === 'not_marked' &&
                            'bg-gray-100 text-gray-700 dark:bg-gray-900/20'
                        )}
                      >
                        {student.attendance_status || 'Not Marked'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {student.time_in || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              No attendance records for the selected date and class
            </p>
          </div>
        )}

        {students.length > 10 && (
          <div className="p-4 border-t border-white/10 text-center">
            <Link
              href="/attendance"
              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium"
            >
              View all {students.length} students →
            </Link>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default AttendanceDashboard;
