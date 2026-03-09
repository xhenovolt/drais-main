'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  Settings,
  Loader2,
  Calendar,
  TrendingUp,
  Activity,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import useSWR from 'swr';
import { fetcher } from '@/utils/fetcher';
import { toast } from 'react-hot-toast';
import DeviceManagementModal from './DeviceManagementModal';

interface AnalyticsCard {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function AttendanceDashboard({
  schoolId = 1,
}: {
  schoolId?: number;
}) {
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState(7);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Fetch analytics data
  const { data: analyticsData, isLoading, mutate } = useSWR(
    `/api/attendance/devices/analytics?school_id=${schoolId}&days=${dateRange}${
      selectedDevice ? `&device_id=${selectedDevice}` : ''
    }`,
    fetcher,
    {
      revalidateOnFocus: false,
      refreshInterval: autoRefresh ? 60000 : 0, // Auto-refresh every 1 minute if enabled
    }
  );

  const analytics = analyticsData?.data;

  // Manual refresh handler
  const handleRefresh = async () => {
    await mutate();
    toast.success('Analytics updated');
  };

  // Fetch and process logs
  const handleProcessLogs = async () => {
    try {
      const response = await fetch(
        '/api/attendance/devices/process-logs',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            school_id: schoolId,
            device_id: selectedDevice || null,
          }),
        }
      );

      const data = await response.json();
      if (data.success) {
        toast.success(
          `Processed ${data.processed} logs (${data.matched} matched)`
        );
        mutate();
      } else {
        toast.error(data.error || 'Failed to process logs');
      }
    } catch (error) {
      console.error('Error processing logs:', error);
      toast.error('Failed to process logs');
    }
  };

  const analyticsCards: AnalyticsCard[] = analytics
    ? [
        {
          title: 'Total Scans',
          value: analytics.summary.total_scans,
          icon: <Activity className="w-6 h-6" />,
          color: 'bg-blue-500',
        },
        {
          title: 'Present Today',
          value: analytics.summary.present_today,
          icon: <UserCheck className="w-6 h-6" />,
          color: 'bg-green-500',
        },
        {
          title: 'Absent Today',
          value: analytics.summary.absent_today,
          icon: <UserX className="w-6 h-6" />,
          color: 'bg-red-500',
        },
        {
          title: 'Late Entries',
          value: analytics.summary.late_today,
          icon: <Clock className="w-6 h-6" />,
          color: 'bg-yellow-500',
        },
      ]
    : [];

  return (
    <div className="space-y-6 p-6 bg-slate-50 dark:bg-slate-950 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Attendance Dashboard
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Monitor and manage student/staff attendance
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh analytics"
          >
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setIsDeviceModalOpen(true)}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
          >
            <Settings className="w-4 h-4" />
            Devices
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-lg">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Date Range
          </label>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(parseInt(e.target.value))}
            className="px-3 py-1 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-800 dark:text-white text-sm"
          >
            <option value="1">Today</option>
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
          </select>
        </div>

        <div className="flex-1" />

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm text-slate-700 dark:text-slate-300">
            Auto-refresh
          </span>
        </label>

        <button
          onClick={handleProcessLogs}
          className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm flex items-center gap-2"
        >
          <TrendingUp className="w-4 h-4" />
          Process Logs
        </button>
      </div>

      {/* Analytics Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {analyticsCards.map((card, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                      {card.title}
                    </p>
                    <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">
                      {card.value}
                    </p>
                  </div>
                  <div className={`${card.color} p-3 rounded-lg text-white`}>
                    {card.icon}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Daily Attendance Trend */}
            {analytics?.dailyCount && analytics.dailyCount.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700"
              >
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                  Daily Attendance Trend
                </h2>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={analytics.dailyCount}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      stroke="currentColor"
                      className="text-slate-500"
                    />
                    <YAxis
                      stroke="currentColor"
                      className="text-slate-500"
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: 'none',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="present"
                      stroke="#10b981"
                      name="Present"
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="late"
                      stroke="#f59e0b"
                      name="Late"
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="absent"
                      stroke="#ef4444"
                      name="Absent"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </motion.div>
            )}

            {/* Method Distribution */}
            {analytics?.methodDistribution && analytics.methodDistribution.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700"
              >
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                  Scan Method Distribution
                </h2>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={analytics.methodDistribution}
                      dataKey="count"
                      nameKey="method"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label
                    >
                      {analytics.methodDistribution.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </motion.div>
            )}
          </div>

          {/* Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Devices */}
            {analytics?.topDevices && analytics.topDevices.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700"
              >
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                  Top Devices by Scans
                </h2>
                <div className="space-y-3">
                  {analytics.topDevices.map((device, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-slate-700 dark:text-slate-300">
                        {device.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="w-48 bg-slate-200 dark:bg-slate-800 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{
                              width: `${
                                (device.count /
                                  Math.max(
                                    ...analytics.topDevices.map((d) => d.count)
                                  )) *
                                100
                              }%`,
                            }}
                          />
                        </div>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 w-12 text-right">
                          {device.count}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Late Entries */}
            {analytics?.lateEntries && analytics.lateEntries.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700"
              >
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                  Recent Late Arrivals
                </h2>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {analytics.lateEntries.map((entry, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">
                          {entry.name}
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {entry.time}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">
                        +{entry.delay_minutes}m
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>

          {/* Absent Students */}
          {analytics?.absentStudents && analytics.absentStudents.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700"
            >
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-500" />
                Absent Students Today
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {analytics.absentStudents.slice(0, 15).map((student) => (
                  <div
                    key={student.id}
                    className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800"
                  >
                    <p className="font-medium text-slate-900 dark:text-white">
                      {student.name}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {student.class}
                    </p>
                  </div>
                ))}
              </div>
              {analytics.absentStudents.length > 15 && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">
                  and {analytics.absentStudents.length - 15} more...
                </p>
              )}
            </motion.div>
          )}
        </>
      )}

      {/* Device Management Modal */}
      <DeviceManagementModal
        isOpen={isDeviceModalOpen}
        onClose={() => setIsDeviceModalOpen(false)}
        schoolId={schoolId}
      />
    </div>
  );
}
