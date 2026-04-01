"use client";
import React, { useState, useEffect } from 'react';
import { Activity, CheckCircle, XCircle, AlertTriangle, RefreshCw, Clock, Users, FileText, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useSWR from 'swr';
import { showToast } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';
import clsx from 'clsx';

const ReconciliationPage: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [reconciling, setReconciling] = useState(false);

  // Fetch reconciliation data
  const { data: reconcileData, mutate: mutateReconcile } = useSWR(
    `/api/attendance/reconcile?date=${selectedDate}`
  );

  const conflicts = (reconcileData as any)?.data?.conflicts || [];
  const summary = (reconcileData as any)?.data?.summary || {};

  const handleReconcile = async () => {
    setReconciling(true);
    try {
      const data = await apiFetch<{ data: { resolved: number } }>('/api/attendance/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate }),
        successMessage: 'Reconciliation complete',
      });
      mutateReconcile();
    } catch (error) {
      // apiFetch already showed error toast
    } finally {
      setReconciling(false);
    }
  };

  const handleAutoResolve = async (conflictId: number, resolution: string) => {
    try {
      await apiFetch('/api/attendance/reconcile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conflict_id: conflictId,
          resolution
        }),
        successMessage: 'Conflict resolved',
      });
      mutateReconcile();
    } catch (error) {
      // apiFetch already showed error toast
    }
  };

  const getConflictTypeColor = (type: string) => {
    switch (type) {
      case 'manual_biometric_mismatch': return 'bg-orange-100 text-orange-700';
      case 'missing_biometric': return 'bg-red-100 text-red-700';
      case 'missing_manual': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getResolutionIcon = (resolution: string) => {
    switch (resolution) {
      case 'biometric': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'manual': return <CheckCircle className="w-4 h-4 text-blue-500" />;
      case 'excused': return <CheckCircle className="w-4 h-4 text-purple-500" />;
      default: return <AlertTriangle className="w-4 h-4 text-orange-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
              🔄 Attendance Reconciliation
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Resolve conflicts between manual and biometric attendance records
            </p>
          </div>
          <button
            onClick={handleReconcile}
            disabled={reconciling}
            className="btn-primary flex items-center gap-2"
          >
            {reconciling ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Reconciling...
              </>
            ) : (
              <>
                <Activity className="w-4 h-4" />
                Run Reconciliation
              </>
            )}
          </button>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="card p-4">
            <label className="block text-sm font-medium mb-2">Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800"
            />
          </div>
          <div className="card p-4 flex items-center gap-4">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Matches</p>
              <p className="text-2xl font-bold text-green-600">{summary.matched || 0}</p>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-4">
            <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Conflicts</p>
              <p className="text-2xl font-bold text-orange-600">{summary.conflicts || 0}</p>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Clock className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending</p>
              <p className="text-2xl font-bold text-blue-600">{summary.pending || 0}</p>
            </div>
          </div>
        </div>

        {/* Conflicts Section */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Pending Conflicts ({conflicts.length})
            </h2>
            <button className="btn-secondary flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export Report
            </button>
          </div>

          {conflicts.length > 0 ? (
            <div className="space-y-4">
              <AnimatePresence>
                {conflicts.map((conflict: any) => (
                  <motion.div
                    key={conflict.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                          <Users className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{conflict.student_name}</h3>
                          <p className="text-sm text-gray-500">Student ID: {conflict.student_id}</p>
                        </div>
                      </div>
                      <span className={clsx(
                        'px-2 py-1 rounded-full text-xs font-medium',
                        getConflictTypeColor(conflict.type)
                      )}>
                        {conflict.type.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <p className="text-sm text-blue-600 dark:text-blue-400 mb-1">Manual Entry</p>
                        <p className="font-medium">{conflict.manual_status || 'Not marked'}</p>
                        <p className="text-xs text-gray-500">{conflict.manual_time}</p>
                      </div>
                      <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <p className="text-sm text-green-600 dark:text-green-400 mb-1">Biometric Entry</p>
                        <p className="font-medium">{conflict.biometric_status || 'Not found'}</p>
                        <p className="text-xs text-gray-500">{conflict.biometric_time}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-4 border-t">
                      <span className="text-sm text-gray-500 mr-2">Resolve with:</span>
                      <button
                        onClick={() => handleAutoResolve(conflict.id, 'biometric')}
                        className="btn-secondary text-sm flex items-center gap-1"
                      >
                        <CheckCircle className="w-3 h-3" />
                        Biometric
                      </button>
                      <button
                        onClick={() => handleAutoResolve(conflict.id, 'manual')}
                        className="btn-secondary text-sm flex items-center gap-1"
                      >
                        <CheckCircle className="w-3 h-3" />
                        Manual
                      </button>
                      <button
                        onClick={() => handleAutoResolve(conflict.id, 'excused')}
                        className="btn-secondary text-sm flex items-center gap-1"
                      >
                        <CheckCircle className="w-3 h-3" />
                        Excused
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <div className="text-center py-12">
              <CheckCircle className="w-16 h-16 text-green-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-2">No conflicts found for this date</p>
              <p className="text-sm text-gray-400">All manual and biometric records are synchronized</p>
            </div>
          )}
        </div>

        {/* Reconciliation History */}
        <div className="card p-6 mt-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-500" />
            Reconciliation History
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">Date</th>
                  <th className="text-left py-2 px-4">Conflicts Found</th>
                  <th className="text-left py-2 px-4">Resolved</th>
                  <th className="text-left py-2 px-4">Pending</th>
                  <th className="text-left py-2 px-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {/* Sample history data - replace with actual data */}
                <tr className="border-b">
                  <td className="py-2 px-4">2026-02-08</td>
                  <td className="py-2 px-4">5</td>
                  <td className="py-2 px-4">5</td>
                  <td className="py-2 px-4">0</td>
                  <td className="py-2 px-4">
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      Complete
                    </span>
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 px-4">2026-02-07</td>
                  <td className="py-2 px-4">3</td>
                  <td className="py-2 px-4">3</td>
                  <td className="py-2 px-4">0</td>
                  <td className="py-2 px-4">
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      Complete
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReconciliationPage;
