"use client";
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  UserCheck, 
  UserX, 
  TrendingUp, 
  DollarSign, 
  AlertTriangle,
  Calendar,
  Settings,
  BarChart3,
  Brain,
  Filter,
  Download,
  Printer,
  Plus,
  Eye
} from 'lucide-react';
import useSWR from 'swr';
import { fetcher } from '@/utils/fetcher';
import DashboardKPIs from '@/components/dashboard/DashboardKPIs';
import TopPerformers from '@/components/dashboard/TopPerformers';
import WorstPerformers from '@/components/dashboard/WorstPerformers';
import FeesSnapshot from '@/components/dashboard/FeesSnapshot';
import SubjectStats from '@/components/dashboard/SubjectStats';
import AttendanceToday from '@/components/dashboard/AttendanceToday';
import AIInsightCard from '@/components/dashboard/AIInsightCard';
import AdvancedDashboard from '@/components/dashboard/AdvancedDashboard';
import PredictiveAnalyticsDashboard from '@/components/dashboard/PredictiveAnalyticsDashboard';
import AdmissionsAnalytics from '@/components/dashboard/AdmissionsAnalytics';
import DeviceStatusWidget from '@/components/dashboard/DeviceStatusWidget';
import SetupChecklist from '@/components/onboarding/SetupChecklist';
import QuickActions from '@/components/onboarding/QuickActions';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';

const DashboardPage: React.FC = () => {
  const [mode, setMode] = useState<'simple' | 'advanced' | 'analytics'>('simple');
  const { user } = useAuth();
  const schoolId = user?.schoolId ?? null;
  const [dateRange, setDateRange] = useState({
    from: new Date().toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  });

  // Fetch dashboard overview data
  const { data: overviewData, isLoading, mutate } = useSWR(
    schoolId ? `/api/dashboard/overview?school_id=${schoolId}&from=${dateRange.from}&to=${dateRange.to}` : null,
    fetcher,
    { 
      refreshInterval: 30000, // Refresh every 30 seconds
      revalidateOnFocus: true
    }
  );

  const overview = overviewData?.data;

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'add_student':
        toast.success('Opening student admission form...');
        break;
      case 'mark_attendance':
        window.open('/attendance', '_blank');
        break;
      case 'export':
        toast.success('Preparing export...');
        break;
      case 'print':
        window.print();
        break;
      default:
        toast.info(`Action: ${action}`);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900 overflow-x-hidden">
      {/* Global Top Bar */}
      <div data-tour="dashboard" className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-full w-full px-2 sm:px-4 py-4 mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 md:gap-0">
            {/* Header Left: Logo & Title */}
            <div className="flex flex-row items-center gap-3 md:gap-4">
              <span className="hidden md:inline-block text-3xl font-extrabold text-blue-700 tracking-tight mr-2">📊</span>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white md:whitespace-nowrap">
                DRAIS Dashboard
              </h1>
            </div>
            {/* Header Center: Date Range */}
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 w-full md:w-auto md:justify-center">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-500" />
                <input
                  type="date"
                  value={dateRange.from}
                  onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                  className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-slate-800 min-w-[120px]"
                />
                <span className="text-gray-500 hidden sm:inline">to</span>
              </div>
              <input
                type="date"
                value={dateRange.to}
                onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-slate-800 min-w-[120px]"
              />
            </div>
            {/* Header Right: Mode Toggle & Actions */}
            <div className="flex flex-row items-center gap-2 md:gap-3 w-full md:w-auto justify-end">
              {/* Mode Toggle */}
              <div className="flex bg-gray-100 dark:bg-slate-700 rounded-lg p-1 overflow-x-auto max-w-full">
                <button
                  onClick={() => setMode('simple')}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${
                    mode === 'simple' 
                      ? 'bg-white dark:bg-slate-800 shadow-sm text-blue-600' 
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  Simple
                </button>
                <button
                  onClick={() => setMode('advanced')}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${
                    mode === 'advanced' 
                      ? 'bg-white dark:bg-slate-800 shadow-sm text-blue-600' 
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  Advanced
                </button>
                <button
                  onClick={() => setMode('analytics')}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${
                    mode === 'analytics' 
                      ? 'bg-white dark:bg-slate-800 shadow-sm text-purple-600' 
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  <Brain className="w-4 h-4 inline mr-1" />
                  AI Analytics
                </button>
              </div>
              {/* Quick Actions */}
              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={() => handleQuickAction('add_student')}
                  className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  title="Add Student"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleQuickAction('mark_attendance')}
                  className="p-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
                  title="Mark Attendance"
                >
                  <UserCheck className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleQuickAction('export')}
                  className="p-2 rounded-lg bg-yellow-600 text-white hover:bg-yellow-700 transition-colors"
                  title="Export Data"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleQuickAction('print')}
                  className="p-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors"
                  title="Print Report"
                >
                  <Printer className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard Content */}
      <div className="container mx-auto px-4 py-8">
        {/* Quick Actions — visible only in simple mode */}
        {mode === 'simple' && (
          <div className="mb-8 space-y-6">
            <QuickActions />
            <SetupChecklist />
          </div>
        )}
        <AnimatePresence mode="wait">
          {mode === 'simple' ? (
            <motion.div
              key="simple"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-8"
            >
              {/* KPIs Row */}
              <div data-tour="students">
                <DashboardKPIs data={overview?.kpis} />
              </div>

              {/* Admissions Analytics Section */}
              <AdmissionsAnalytics schoolId={schoolId} />

              {/* Main Panels Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
                {/* Top Performers */}
                <TopPerformers data={overview?.topPerformers} />

                {/* Worst Performers */}
                <WorstPerformers data={overview?.worstPerformers} />

                {/* Fees Snapshot */}
                <FeesSnapshot data={overview?.fees} />

                {/* Subject Stats */}
                <div data-tour="reports">
                  <SubjectStats data={overview?.subjects} />
                </div>

                {/* Attendance Today */}
                <div data-tour="attendance">
                  <AttendanceToday schoolId={schoolId} />
                </div>

                {/* Device Status */}
                <DeviceStatusWidget />

                {/* AI Insight */}
                <AIInsightCard data={overview?.aiInsight} />
              </div>
            </motion.div>
          ) : mode === 'advanced' ? (
            <motion.div
              key="advanced"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <AdvancedDashboard schoolId={schoolId} dateRange={dateRange} />
            </motion.div>
          ) : (
            <motion.div
              key="analytics"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <PredictiveAnalyticsDashboard schoolId={schoolId} scope="school" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default DashboardPage;
