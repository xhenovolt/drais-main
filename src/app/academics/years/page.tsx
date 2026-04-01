"use client";
import React, { useState } from 'react';
import useSWR from 'swr';
import {
  CalendarDays, Plus, CheckCircle2, Clock, Archive,
  ChevronDown, ChevronRight, Loader2, X, BookOpen,
} from 'lucide-react';
import clsx from 'clsx';
import { showToast } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';

const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then(r => r.json());

interface AcademicYear {
  id: number;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: 'draft' | 'active' | 'closed';
}

interface Term {
  id: number;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  academic_year: string;
}

// ─── Modals ─────────────────────────────────────────────────────────────────

function YearModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', start_date: '', end_date: '', status: 'draft' });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/academic_years', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
        successMessage: 'Academic year created',
      });
      onSaved();
    } catch {
      // apiFetch already showed toast
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="font-bold text-slate-900 dark:text-white text-lg">New Academic Year</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Year name <span className="text-red-500">*</span></label>
            <input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. 2025/2026"
              required
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Start date</label>
              <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">End date</label>
              <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]">
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-[var(--color-primary)] text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {saving ? 'Saving…' : 'Create Year'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TermModal({ yearId, yearName, onClose, onSaved }: { yearId: number; yearName: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', start_date: '', end_date: '', status: 'draft' });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...form, academic_year_id: yearId }),
        successMessage: 'Term created',
      });
      onSaved();
    } catch {
      // apiFetch already showed toast
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="font-bold text-slate-900 dark:text-white text-lg">Add Term</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{yearName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Term name <span className="text-red-500">*</span></label>
            <input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Term 1"
              required
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Start date</label>
              <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">End date</label>
              <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]">
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-[var(--color-primary)] text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {saving ? 'Saving…' : 'Add Term'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Status badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    active:  { label: 'Active',  cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: <CheckCircle2 className="w-3 h-3" /> },
    draft:   { label: 'Draft',   cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',            icon: <Clock className="w-3 h-3" /> },
    closed:  { label: 'Closed',  cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',         icon: <Archive className="w-3 h-3" /> },
    scheduled: { label: 'Scheduled', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',         icon: <CalendarDays className="w-3 h-3" /> },
  };
  const { label, cls, icon } = cfg[status] ?? { label: status, cls: 'bg-slate-100 text-slate-500', icon: null };
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', cls)}>
      {icon}{label}
    </span>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function AcademicYearsPage() {
  const { data: yearsData, isLoading: yearsLoading, mutate: mutateYears } = useSWR('/api/academic_years', fetcher);
  const { data: termsData, mutate: mutateTerms } = useSWR('/api/terms', fetcher);

  const years: AcademicYear[] = yearsData?.data ?? [];
  const allTerms: Term[] = termsData?.data ?? [];

  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [addYear, setAddYear] = useState(false);
  const [addTerm, setAddTerm] = useState<{ id: number; name: string } | null>(null);

  function toggleYear(id: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function termsForYear(yearId: number) {
    return allTerms.filter((t: any) => {
      // Terms reference academic_year by name in the GET response so we need to
      // match by joining data — use term's academic_year name vs year name
      const year = years.find(y => y.id === yearId);
      return year && (t.academic_year === year.name);
    });
  }

  async function setActiveYear(year: AcademicYear) {
    if (year.status === 'active') return;
    const confirmed = window.confirm(`Set "${year.name}" as the active academic year?`);
    if (!confirmed) return;
    try {
      await apiFetch(`/api/academic_years/${year.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'active' }),
        successMessage: `${year.name} is now active`,
      });
      mutateYears();
    } catch {
      // apiFetch already showed toast
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900">
      <div className="max-w-4xl mx-auto px-4 pt-8 pb-20">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CalendarDays className="w-6 h-6 text-[var(--color-primary)]" />
              Academic Years
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Create academic years and manage their terms. Set one year as active.
            </p>
          </div>
          <button
            onClick={() => setAddYear(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-semibold shadow-md hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            New Year
          </button>
        </div>

        {/* Loading */}
        {yearsLoading && (
          <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading academic years…
          </div>
        )}

        {/* Empty state */}
        {!yearsLoading && years.length === 0 && (
          <div className="text-center py-20 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
            <CalendarDays className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 dark:text-slate-400 font-medium">No academic years yet</p>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1 mb-4">Create your first year to get started</p>
            <button
              onClick={() => setAddYear(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              Create Academic Year
            </button>
          </div>
        )}

        {/* Years list */}
        <div className="space-y-3">
          {years.map(year => {
            const isExpanded = expanded.has(year.id);
            const terms = termsForYear(year.id);
            const isActive = year.status === 'active';

            return (
              <div
                key={year.id}
                className={clsx(
                  'rounded-2xl border bg-white dark:bg-slate-800/60 backdrop-blur shadow-sm overflow-hidden transition-all',
                  isActive ? 'border-[var(--color-primary)]/40 ring-1 ring-[var(--color-primary)]/20' : 'border-slate-200 dark:border-slate-700/60'
                )}
              >
                {/* Year header row */}
                <div className="flex items-center gap-3 px-5 py-4">
                  <button
                    onClick={() => toggleYear(year.id)}
                    className="flex-1 flex items-center gap-3 min-w-0 text-left"
                    aria-expanded={isExpanded}
                  >
                    {isExpanded
                      ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    }
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 dark:text-white">{year.name}</span>
                        <StatusBadge status={year.status} />
                      </div>
                      {(year.start_date || year.end_date) && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {year.start_date ?? '—'} → {year.end_date ?? '—'}
                        </p>
                      )}
                    </div>
                  </button>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      {terms.length} term{terms.length !== 1 ? 's' : ''}
                    </span>
                    {!isActive && (
                      <button
                        onClick={() => setActiveYear(year)}
                        className="px-3 py-1 text-xs rounded-lg border border-emerald-300 text-emerald-700 dark:border-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                      >
                        Set active
                      </button>
                    )}
                    <button
                      onClick={() => setAddTerm({ id: year.id, name: year.name })}
                      className="inline-flex items-center gap-1 px-3 py-1 text-xs rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      Add term
                    </button>
                  </div>
                </div>

                {/* Terms list (expanded) */}
                {isExpanded && (
                  <div className="border-t border-slate-100 dark:border-slate-700/50 divide-y divide-slate-100 dark:divide-slate-700/50">
                    {terms.length === 0 ? (
                      <div className="px-5 py-6 text-center">
                        <BookOpen className="w-6 h-6 text-slate-300 dark:text-slate-600 mx-auto mb-1.5" />
                        <p className="text-sm text-slate-400 dark:text-slate-500">No terms yet</p>
                        <button
                          onClick={() => setAddTerm({ id: year.id, name: year.name })}
                          className="mt-2 text-xs text-[var(--color-primary)] hover:underline inline-flex items-center gap-1 font-semibold"
                        >
                          <Plus className="w-3 h-3" />
                          Add first term
                        </button>
                      </div>
                    ) : (
                      terms.map((term: Term) => (
                        <div key={term.id} className="flex items-center gap-3 px-6 py-3">
                          <BookOpen className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-sm text-slate-800 dark:text-slate-200">{term.name}</span>
                            {(term.start_date || term.end_date) && (
                              <span className="text-xs text-slate-400 dark:text-slate-500 ml-2">
                                {term.start_date ?? '—'} → {term.end_date ?? '—'}
                              </span>
                            )}
                          </div>
                          <StatusBadge status={term.status} />
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Modals */}
      {addYear && (
        <YearModal
          onClose={() => setAddYear(false)}
          onSaved={() => { setAddYear(false); mutateYears(); mutateTerms(); }}
        />
      )}
      {addTerm && (
        <TermModal
          yearId={addTerm.id}
          yearName={addTerm.name}
          onClose={() => setAddTerm(null)}
          onSaved={() => { setAddTerm(null); mutateTerms(); }}
        />
      )}
    </div>
  );
}
