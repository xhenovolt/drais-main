"use client";
import React, { useState, useEffect } from 'react';
import { BarChart3, FileText, Download, Calendar, Users, TrendingUp, TrendingDown, Filter, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useSWR from 'swr';
import { toast } from 'react-hot-toast';
import { fetcher } from '@/utils/fetcher';
import clsx from 'clsx';

const AttendanceReportsPage: React.FC = () => {
  const [selectedReportType, setSelectedReportType] = useState('daily_summary');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedClass, setSelectedClass] = useState('');
  const [generating, setGenerating] = useState(false);
  const [reportData, setReportData] = useState<any>(null);

  // Fetch classes
  const { data: classData } = useSWR('/api/classes', fetcher);
  const classes = (classData as any)?.data || [];

  // Fetch reports
  const { data: reportsData, mutate: mutateReports } = useSWR('/api/attendance/reports', fetcher);

  const recentReports = (reportsData as any)?.data || [];

  const reportTypes = [
    { key: 'daily_summary', label: 'Daily Summary', icon: <Calendar className="w-5 h-5" /> },
    { key: 'class_wise', label: 'Class-wise Report', icon: <Users className="w-5 h-5" /> },
    { key: 'student_wise', label: 'Student-wise Report', icon: <FileText className="w-5 h-5" /> },
    { key: 'monthly_overview', label: 'Monthly Overview', icon: <BarChart3 className="w-5 h-5" /> },
    { key: 'trend_analysis', label: 'Trend Analysis', icon: <TrendingUp className="w-5 h-5" /> },
    { key: 'perfect_attendance', label: 'Perfect Attendance', icon: <TrendingDown className="w-5 h-5" /> }
  ];

  const handleGenerateReport = async () => {
    setGenerating(true);
    try {
      const response = await fetch('/api/attendance/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: selectedReportType,
          date: selectedDate,
          class_id: selectedClass || undefined
        })
      });

      if (response.ok) {
        const data = await response.json();
        setReportData(data.data);
        toast.success('Report generated successfully');
      } else {
        toast.error('Failed to generate report');
      }
    } catch (error) {
      toast.error(`Error: ${error}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleExport = () => {
    // Export functionality
    toast.success('Export started...');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
            📊 Attendance Reports
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Generate and analyze attendance reports
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Report Configuration */}
          <div className="lg:col-span-1">
            <div className="card p-6">
              <h2 className="text-lg font-semibold mb-4">Report Configuration</h2>

              {/* Report Type */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Report Type</label>
                <div className="space-y-2">
                  {reportTypes.map((type) => (
                    <button
                      key={type.key}
                      onClick={() => setSelectedReportType(type.key)}
                      className={clsx(
                        'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
                        selectedReportType === type.key
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                      )}
                    >
                      {type.icon}
                      <span className="text-sm">{type.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Date */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Date</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800"
                />
              </div>

              {/* Class */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Class (Optional)</label>
                <select
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800"
                >
                  <option value="">All Classes</option>
                  {classes.map((cls: any) => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </select>
              </div>

              {/* Generate Button */}
              <button
                onClick={handleGenerateReport}
                disabled={generating}
                className="w-full btn-primary flex items-center justify-center gap-2"
              >
                {generating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <BarChart3 className="w-4 h-4" />
                    Generate Report
                  </>
                )}
              </button>
            </div>

            {/* Recent Reports */}
            <div className="card p-6 mt-6">
              <h2 className="text-lg font-semibold mb-4">Recent Reports</h2>
              <div className="space-y-3">
                {recentReports.slice(0, 5).map((report: any) => (
                  <div
                    key={report.id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium">{report.type}</p>
                        <p className="text-xs text-gray-500">{report.created_at}</p>
                      </div>
                    </div>
                    <button className="text-blue-500 hover:text-blue-600">
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Report Preview */}
          <div className="lg:col-span-2">
            <div className="card p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">Report Preview</h2>
                {reportData && (
                  <button
                    onClick={handleExport}
                    className="btn-secondary flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Export
                  </button>
                )}
              </div>

              {reportData ? (
                <div className="space-y-6">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <p className="text-sm text-green-600 dark:text-green-400">Present</p>
                      <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                        {reportData.present || 0}
                      </p>
                    </div>
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                      <p className="text-sm text-red-600 dark:text-red-400">Absent</p>
                      <p className="text-2xl font-bold text-red-700 dark:text-red-300">
                        {reportData.absent || 0}
                      </p>
                    </div>
                    <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                      <p className="text-sm text-yellow-600 dark:text-yellow-400">Late</p>
                      <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">
                        {reportData.late || 0}
                      </p>
                    </div>
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <p className="text-sm text-blue-600 dark:text-blue-400">Attendance Rate</p>
                      <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                        {reportData.attendance_rate || 0}%
                      </p>
                    </div>
                  </div>

                  {/* Chart Placeholder */}
                  <div className="h-64 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
                    <BarChart3 className="w-16 h-16 text-gray-400" />
                    <p className="ml-4 text-gray-500">Chart visualization would appear here</p>
                  </div>

                  {/* Data Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-4">Metric</th>
                          <th className="text-left py-2 px-4">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(reportData.details || {}).map(([key, value]) => (
                          <tr key={key} className="border-b">
                            <td className="py-2 px-4 capitalize">{key.replace(/_/g, ' ')}</td>
                            <td className="py-2 px-4 font-medium">{String(value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">Select report options and click "Generate Report"</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AttendanceReportsPage;
