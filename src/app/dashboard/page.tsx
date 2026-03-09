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
import { toast } from 'react-hot-toast';

const DashboardPage: React.FC = () => {
  const [mode, setMode] = useState<'simple' | 'advanced' | 'analytics'>('simple');
  const [schoolId] = useState(1); // TODO: Get from auth context
  const [dateRange, setDateRange] = useState({
    from: new Date().toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  });

  // Fetch dashboard overview data
  const { data: overviewData, isLoading, mutate } = useSWR(
    `/api/dashboard/overview?school_id=${schoolId}&from=${dateRange.from}&to=${dateRange.to}`,
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900">
      {/* Global Top Bar */}
      <div className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Left: Title & School Info */}
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  📊 DRAIS Dashboard
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Real-time school analytics & insights
                </p>
              </div>
            </div>

            {/* Center: Date Range */}
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              <input
                type="date"
                value={dateRange.from}
                onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-slate-800"
              />
              <span className="text-gray-500">to</span>
              <input
                type="date"
                value={dateRange.to}
                onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-slate-800"
              />
            </div>

            {/* Right: Mode Toggle & Actions */}
            <div className="flex items-center gap-2">
              {/* Mode Toggle */}
              <div className="flex bg-gray-100 dark:bg-slate-700 rounded-lg p-1">
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
              <div className="flex gap-1">
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
              <DashboardKPIs data={overview?.kpis} />

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
                <SubjectStats data={overview?.subjects} />

                {/* Attendance Today */}
                <AttendanceToday schoolId={schoolId} />

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
