'use client';
/**
 * ClassCorrectionModal
 * Lets admin/teacher move one or more students back to a previous class
 * (enrollment reversion). Uses ProgressOverlay for feedback.
 */
import React, { useState, useCallback } from 'react';
import { useProgress } from '@/contexts/ProgressContext';

interface Student {
  id: number;
  name: string;
  current_class: string;
}

interface ClassOption {
  id: number;
  name: string;
}

interface Props {
  isOpen:           boolean;
  onClose:          () => void;
  students:         Student[];      // pre-selected students to revert
  classOptions:     ClassOption[];  // all classes in the school
  academicYears:    { id: number; name: string }[];
  onSuccess?:       () => void;     // called after successful reversion
}

export default function ClassCorrectionModal({
  isOpen,
  onClose,
  students,
  classOptions,
  academicYears,
  onSuccess,
}: Props) {
  const {
    startProgress,
    updateProgress,
    incrementSuccess,
    incrementError,
    finishProgress,
    setProgressError,
  } = useProgress();

  const [toClassId,      setToClassId]      = useState<number | ''>('');
  const [academicYearId, setAcademicYearId] = useState<number | ''>('');
  const [reason,         setReason]         = useState('');
  const [submitting,     setSubmitting]     = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!toClassId || !academicYearId) {
      alert('Please select target class and academic year.');
      return;
    }

    setSubmitting(true);
    startProgress(`Reverting ${students.length} student(s)…`);

    try {
      updateProgress(20, 'Sending request…');

      const res  = await fetch('/api/enrollments/revert', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_ids:      students.map(s => s.id),
          to_class_id:      toClassId,
          academic_year_id: academicYearId,
          reason:           reason || 'class_correction',
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setProgressError(data.error ?? 'Server error');
        setSubmitting(false);
        return;
      }

      for (const r of data.results) {
        if (r.success) incrementSuccess();
        else           incrementError();
      }

      updateProgress(100, `${data.summary.reverted} student(s) moved`);
      finishProgress();

      setSubmitting(false);
      onSuccess?.();
    } catch (err: any) {
      setProgressError(err.message ?? 'Network error');
      setSubmitting(false);
    }
  }, [toClassId, academicYearId, reason, students, startProgress, updateProgress, incrementSuccess, incrementError, finishProgress, setProgressError, onSuccess]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Correct Class Assignment</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-5">

          {/* Affected students */}
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Students to revert ({students.length})
            </p>
            <ul className="max-h-36 overflow-y-auto bg-gray-50 dark:bg-gray-800 rounded-lg divide-y divide-gray-200 dark:divide-gray-700 text-sm">
              {students.map(s => (
                <li key={s.id} className="flex items-center justify-between px-3 py-2">
                  <span className="text-gray-800 dark:text-gray-200">{s.name}</span>
                  <span className="text-gray-400 text-xs">{s.current_class}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Target class */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Move back to class <span className="text-red-500">*</span>
            </label>
            <select
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
              value={toClassId}
              onChange={e => setToClassId(Number(e.target.value))}
            >
              <option value="">— Select class —</option>
              {classOptions.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Academic year */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Academic year <span className="text-red-500">*</span>
            </label>
            <select
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
              value={academicYearId}
              onChange={e => setAcademicYearId(Number(e.target.value))}
            >
              <option value="">— Select year —</option>
              {academicYears.map(y => (
                <option key={y.id} value={y.id}>{y.name}</option>
              ))}
            </select>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reason (optional)</label>
            <input
              type="text"
              placeholder="e.g. Placed in wrong class during enrolment"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !toClassId || !academicYearId}
            className="px-4 py-2 text-sm rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 font-medium"
          >
            {submitting ? 'Reverting…' : 'Revert Assignment'}
          </button>
        </div>
      </div>
    </div>
  );
}
