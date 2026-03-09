import React from 'react';
import { motion } from 'framer-motion';
import {
  UserCheck,
  TrendingUp,
  Calendar,
  BarChart3,
  Users,
} from 'lucide-react';
import useSWR from 'swr';
import { fetcher } from '@/utils/fetcher';
import clsx from 'clsx';

interface AdmissionsAnalyticsProps {
  schoolId?: number;
}

/**
 * Admissions Analytics Component
 * Displays key admission metrics and trends
 */
export const AdmissionsAnalytics: React.FC<AdmissionsAnalyticsProps> = ({
  schoolId = 1,
}) => {
  const { data, isLoading } = useSWR(
    `/api/dashboard/admissions-analytics?school_id=${schoolId}`,
    fetcher,
    { refreshInterval: 60000 } // Refresh every minute
  );

  const analytics = data?.data;

  const StatCard: React.FC<{
    icon: React.ReactNode;
    title: string;
    value: string | number;
    subtitle?: string;
    gradient: string;
  }> = ({ icon, title, value, subtitle, gradient }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-6 rounded-2xl border border-white/20 dark:border-white/10 backdrop-blur-xl shadow-lg ${gradient}`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-white/80">{title}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold text-white">{value}</p>
            {subtitle && (
              <p className="text-xs text-white/60">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="p-3 rounded-xl bg-white/20 backdrop-blur">{icon}</div>
      </div>
    </motion.div>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-40 bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!analytics) {
    return null;
  }

  const { summary, trends, distribution } = analytics;

  return (
    <div className="space-y-8">
      {/* Section Title */}
      <div>
        <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent flex items-center gap-3">
          <Users className="w-6 h-6 text-blue-600" />
          Admissions Analytics
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Real-time enrollment insights and trends
        </p>
      </div>

      {/* Primary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<UserCheck className="w-5 h-5 text-white" />}
          title="Admitted Today"
          value={summary.admittedToday}
          gradient="bg-gradient-to-br from-green-500 to-emerald-600"
        />

        <StatCard
          icon={<Users className="w-5 h-5 text-white" />}
          title="Total Learners"
          value={summary.totalAdmitted}
          gradient="bg-gradient-to-br from-blue-500 to-indigo-600"
        />

        <StatCard
          icon={<Calendar className="w-5 h-5 text-white" />}
          title="This Month"
          value={summary.admittedThisMonth}
          subtitle={summary.enrollmentRate}
          gradient="bg-gradient-to-br from-purple-500 to-pink-600"
        />

        <StatCard
          icon={<TrendingUp className="w-5 h-5 text-white" />}
          title="Weekly Average"
          value={trends.weeklyAverage}
          subtitle="admissions/week"
          gradient="bg-gradient-to-br from-orange-500 to-red-600"
        />
      </div>

      {/* Trends and Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Trend Chart (Last 30 Days) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 rounded-2xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-lg"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Daily Admissions (Last 30 Days)
              </h3>
            </div>

            {/* Mini bar chart */}
            <div className="flex items-end gap-1 h-24 justify-between">
              {trends.dailyData.slice(-14).map((day, idx) => {
                const maxCount = Math.max(
                  ...trends.dailyData.map((d) => d.count),
                  1
                );
                const height = (day.count / maxCount) * 100;

                return (
                  <div
                    key={idx}
                    className="flex-1 flex flex-col items-center gap-1 group"
                  >
                    <div
                      className="w-full rounded-t bg-gradient-to-t from-blue-600 to-blue-400 hover:from-blue-700 hover:to-blue-500 transition-all cursor-pointer relative group/bar"
                      style={{ height: `${Math.max(height, 4)}%` }}
                    >
                      {day.count > 0 && (
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-bold px-2 py-1 rounded opacity-0 group-hover/bar:opacity-100 whitespace-nowrap transition-opacity">
                          {day.count}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
                      {new Date(day.date).getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-gray-200 dark:border-slate-700 space-y-2">
              {trends.peakDay && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Peak Day
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {new Date(trends.peakDay.date).toLocaleDateString()} (
                    {trends.peakDay.count} admissions)
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Total (30 days)
                </span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {trends.totalLast30Days} admissions
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Class Distribution */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 rounded-2xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-lg"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-600" />
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Learners by Class
              </h3>
            </div>

            <div className="space-y-3">
              {distribution.byClass && distribution.byClass.length > 0 ? (
                distribution.byClass.map((item, idx) => {
                  const maxCount = Math.max(
                    ...distribution.byClass.map((c) => c.count),
                    1
                  );
                  const percentage = (item.count / maxCount) * 100;

                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {item.class}
                        </span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                          {item.count}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No enrollment data available
                </p>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Key Insights */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 shadow-lg"
      >
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
          📊 Key Insights
        </h3>
        <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
          <li className="flex items-start gap-2">
            <span className="text-blue-600 dark:text-blue-400 font-bold">•</span>
            <span>
              <strong>{summary.admittedToday}</strong> learners admitted today
              {summary.admittedToday > 5 ? ' — Strong enrollment pace' : ''}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 dark:text-blue-400 font-bold">•</span>
            <span>
              Weekly admissions average <strong>{trends.weeklyAverage}</strong> —
              Supporting growth planning
            </span>
          </li>
          {trends.peakDay && (
            <li className="flex items-start gap-2">
              <span className="text-blue-600 dark:text-blue-400 font-bold">
                •
              </span>
              <span>
                Peak admission on{' '}
                <strong>
                  {new Date(trends.peakDay.date).toLocaleDateString()}
                </strong>
                — Monitor periodic spikes
              </span>
            </li>
          )}
          <li className="flex items-start gap-2">
            <span className="text-blue-600 dark:text-blue-400 font-bold">•</span>
            <span>
              <strong>{summary.enrollmentRate}</strong> of total enrollment this
              month
            </span>
          </li>
        </ul>
      </motion.div>
    </div>
  );
};

export default AdmissionsAnalytics;
