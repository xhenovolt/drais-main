"use client";
import React, { useState, useCallback } from 'react';
import useSWR from 'swr';
import { ClipboardList, Plus, Calendar, User, Flag, X, Loader, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { showToast } from '@/lib/toast';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};
const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-600 dark:text-red-400',
  medium: 'text-yellow-600 dark:text-yellow-400',
  low: 'text-green-600 dark:text-green-400',
};
const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Clock className="w-3.5 h-3.5" />,
  in_progress: <Loader className="w-3.5 h-3.5" />,
  completed: <CheckCircle className="w-3.5 h-3.5" />,
  cancelled: <AlertCircle className="w-3.5 h-3.5" />,
};

export const WorkplansManager: React.FC = () => {
  const { data, isLoading, mutate } = useSWR<any>('/api/workplans');
  const workplans = data?.data || [];
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    start_datetime: '',
    end_datetime: '',
    priority: 'medium',
  });

  const handleCreate = useCallback(async () => {
    if (!form.title.trim()) {
      showToast('error', 'Title is required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/workplans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          start_datetime: form.start_datetime || undefined,
          end_datetime: form.end_datetime || undefined,
          priority: form.priority,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to create workplan');
      showToast('success', 'Workplan created');
      setForm({ title: '', description: '', start_datetime: '', end_datetime: '', priority: 'medium' });
      setShowForm(false);
      mutate();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setSaving(false);
    }
  }, [form, mutate]);

  const fmtDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">Workplans</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{workplans.length} plan{workplans.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancel' : 'New Plan'}
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Title *</label>
              <input
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. End of Term Exam Preparation"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-400"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                rows={2}
                placeholder="Brief description of this workplan..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-400 resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Start Date</label>
              <input
                type="datetime-local"
                value={form.start_datetime}
                onChange={e => setForm({ ...form, start_datetime: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">End Date</label>
              <input
                type="datetime-local"
                value={form.end_datetime}
                onChange={e => setForm({ ...form, end_datetime: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={e => setForm({ ...form, priority: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-400"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleCreate}
              disabled={saving || !form.title.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create
            </button>
          </div>
        </div>
      )}

      {/* Workplan List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : workplans.length === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No workplans yet. Create your first one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {workplans.map((w: any) => (
            <div
              key={w.id}
              className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-slate-800 dark:text-white truncate">{w.title}</h3>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[w.status] || STATUS_COLORS.pending}`}>
                      {STATUS_ICONS[w.status]}
                      {(w.status || 'pending').replace('_', ' ')}
                    </span>
                  </div>
                  {w.description && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-2">{w.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 dark:text-slate-500">
                    {w.start_datetime && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {fmtDate(w.start_datetime)} {w.end_datetime ? `→ ${fmtDate(w.end_datetime)}` : ''}
                      </span>
                    )}
                    {(w.assigned_first_name || w.assigned_last_name) && (
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5" />
                        {[w.assigned_first_name, w.assigned_last_name].filter(Boolean).join(' ')}
                      </span>
                    )}
                    {w.department_name && (
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                        {w.department_name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`flex items-center gap-1 text-xs font-medium ${PRIORITY_COLORS[w.priority] || PRIORITY_COLORS.medium}`}>
                    <Flag className="w-3.5 h-3.5" />
                    {w.priority}
                  </span>
                </div>
              </div>
              {w.progress != null && w.progress > 0 && (
                <div className="mt-3">
                  <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all"
                      style={{ width: `${Math.min(100, w.progress)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 mt-0.5">{w.progress}% complete</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};