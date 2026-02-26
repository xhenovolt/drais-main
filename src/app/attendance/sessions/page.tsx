"use client";
import React, { useState, useEffect } from 'react';
import { Calendar, Plus, Clock, Users, CheckCircle, Lock, FileText, Search, Filter, Edit, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useSWR from 'swr';
import { toast } from 'react-hot-toast';
import { fetcher } from '@/utils/fetcher';
import clsx from 'clsx';

const AttendanceSessionsPage: React.FC = () => {
  const [selectedStatus, setSelectedStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Fetch sessions data
  const { data: sessionsData, mutate, error } = useSWR('/api/attendance/sessions', fetcher, {
    refreshInterval: 60000
  });

  const sessions = (sessionsData as any)?.data || [];

  // Filter sessions based on search
  const filteredSessions = sessions.filter((session: any) => {
    const name = session.name?.toLowerCase() || '';
    return name.includes(searchQuery.toLowerCase());
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-700';
      case 'open': return 'bg-blue-100 text-blue-700';
      case 'submitted': return 'bg-yellow-100 text-yellow-700';
      case 'locked': return 'bg-orange-100 text-orange-700';
      case 'finalized': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft': return <FileText className="w-4 h-4" />;
      case 'open': return <Clock className="w-4 h-4" />;
      case 'submitted': return <CheckCircle className="w-4 h-4" />;
      case 'locked': return <Lock className="w-4 h-4" />;
      case 'finalized': return <CheckCircle className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const handleAction = async (sessionId: number, action: string) => {
    try {
      const response = await fetch(`/api/attendance/sessions/${sessionId}?action=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        toast.success(`Session ${action} successfully`);
        mutate();
      } else {
        toast.error(`Failed to ${action} session`);
      }
    } catch (error) {
      toast.error(`Error: ${error}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
              📅 Attendance Sessions
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Manage attendance sessions and tracking periods
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Session
          </button>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Search */}
          <div className="card p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search sessions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800"
              />
            </div>
          </div>

          {/* Status Filter */}
          <div className="card p-4">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800"
            >
              <option value="">All Status</option>
              <option value="draft">Draft</option>
              <option value="open">Open</option>
              <option value="submitted">Submitted</option>
              <option value="locked">Locked</option>
              <option value="finalized">Finalized</option>
            </select>
          </div>

          {/* Stats */}
          <div className="card p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Sessions</p>
              <p className="text-2xl font-bold">{sessions.length}</p>
            </div>
            <Calendar className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        {/* Sessions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {filteredSessions.map((session: any) => (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="card p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold">{session.name}</h3>
                    <p className="text-sm text-gray-500">
                      {session.date_start} - {session.date_end}
                    </p>
                  </div>
                  <span className={clsx(
                    'px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1',
                    getStatusColor(session.status)
                  )}>
                    {getStatusIcon(session.status)}
                    {session.status}
                  </span>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Present</span>
                    <span className="font-medium text-green-600">{session.present_count || 0}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Absent</span>
                    <span className="font-medium text-red-600">{session.absent_count || 0}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Late</span>
                    <span className="font-medium text-yellow-600">{session.late_count || 0}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Not Marked</span>
                    <span className="font-medium text-gray-600">{session.not_marked_count || 0}</span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{
                      width: `${session.total_students > 0
                        ? ((session.present_count || 0) / session.total_students) * 100
                        : 0}%`
                    }}
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-4 border-t">
                  {session.status === 'draft' && (
                    <button
                      onClick={() => handleAction(session.id, 'open')}
                      className="flex-1 btn-secondary text-sm flex items-center justify-center gap-1"
                    >
                      <Clock className="w-3 h-3" />
                      Open
                    </button>
                  )}
                  {session.status === 'open' && (
                    <>
                      <button
                        onClick={() => handleAction(session.id, 'submit')}
                        className="flex-1 btn-secondary text-sm flex items-center justify-center gap-1"
                      >
                        <CheckCircle className="w-3 h-3" />
                        Submit
                      </button>
                      <button
                        onClick={() => handleAction(session.id, 'lock')}
                        className="flex-1 btn-secondary text-sm flex items-center justify-center gap-1"
                      >
                        <Lock className="w-3 h-3" />
                        Lock
                      </button>
                    </>
                  )}
                  {session.status === 'submitted' && (
                    <button
                      onClick={() => handleAction(session.id, 'finalize')}
                      className="flex-1 btn-primary text-sm flex items-center justify-center gap-1"
                    >
                      <CheckCircle className="w-3 h-3" />
                      Finalize
                    </button>
                  )}
                  {session.status === 'locked' && (
                    <button
                      onClick={() => handleAction(session.id, 'finalize')}
                      className="flex-1 btn-primary text-sm flex items-center justify-center gap-1"
                    >
                      <CheckCircle className="w-3 h-3" />
                      Finalize
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {filteredSessions.length === 0 && (
          <div className="text-center py-12">
            <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No sessions found</p>
          </div>
        )}
      </div>

      {/* Create Session Modal */}
      {showCreateModal && (
        <CreateSessionModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            mutate();
          }}
        />
      )}
    </div>
  );
};

// Create Session Modal Component
const CreateSessionModal: React.FC<{ onClose: () => void; onSuccess: () => void }> = ({ onClose, onSuccess }) => {
  const [name, setName] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const response = await fetch('/api/attendance/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          date_start: dateStart,
          date_end: dateEnd,
          status: 'draft'
        })
      });

      if (response.ok) {
        toast.success('Session created successfully');
        onSuccess();
      } else {
        toast.error('Failed to create session');
      }
    } catch (error) {
      toast.error(`Error: ${error}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-md"
      >
        <h2 className="text-xl font-semibold mb-4">Create New Session</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Session Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Start Date</label>
            <input
              type="date"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End Date</label>
            <input
              type="date"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800"
              required
            />
          </div>
          <div className="flex gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 btn-primary"
            >
              {submitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default AttendanceSessionsPage;
