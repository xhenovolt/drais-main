'use client';

import React, { useState, useEffect } from 'react';
import { X, Loader, AlertCircle } from 'lucide-react';

interface Class {
  id: number;
  name: string;
  class_level?: string;
}

interface ReassignClassModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (classId: number, reason: string) => Promise<void>;
  isLoading: boolean;
  selectedStudentCount: number;
}

export default function ReassignClassModal({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
  selectedStudentCount,
}: ReassignClassModalProps) {
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch available classes on modal open
  useEffect(() => {
    if (!isOpen) return;

    const fetchClasses = async () => {
      setLoadingClasses(true);
      setError(null);
      try {
        const response = await fetch('/api/classes');
        if (!response.ok) throw new Error('Failed to fetch classes');
        const data = await response.json();
        setClasses(data.data || data || []);
      } catch (err) {
        console.error('Error fetching classes:', err);
        setError('Failed to load classes');
      } finally {
        setLoadingClasses(false);
      }
    };

    fetchClasses();
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedClassId) {
      setError('Please select a class');
      return;
    }

    try {
      await onSubmit(Number(selectedClassId), reason);
    } catch (err) {
      console.error('Error submitting form:', err);
      setError('An error occurred while reassigning students');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Reassign Students
          </h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50"
          >
            <X size={24} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Selected Count */}
          <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
            <AlertCircle size={20} className="text-blue-600 dark:text-blue-400" />
            <p className="text-sm text-blue-700 dark:text-blue-300">
              {selectedStudentCount} student{selectedStudentCount !== 1 ? 's' : ''} selected for reassignment
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/30 rounded-lg">
              <AlertCircle size={20} className="text-red-600 dark:text-red-400" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          {/* Class Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Target Class <span className="text-red-500">*</span>
            </label>
            {loadingClasses ? (
              <div className="flex items-center justify-center h-10 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <Loader size={20} className="animate-spin text-gray-500" />
              </div>
            ) : (
              <select
                value={selectedClassId}
                onChange={(e) => {
                  setSelectedClassId(e.target.value ? Number(e.target.value) : '');
                  setError(null);
                }}
                disabled={isLoading || loadingClasses}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
              >
                <option value="">Select a class...</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} {cls.class_level ? `(${cls.class_level})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Reason for Reassignment (Optional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isLoading}
              placeholder="Enter reason for reassignment..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 disabled:opacity-50"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              This will be recorded in the audit trail
            </p>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700 gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || !selectedClassId}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            {isLoading && <Loader size={16} className="animate-spin" />}
            {isLoading ? 'Reassigning...' : 'Reassign Students'}
          </button>
        </div>
      </div>
    </div>
  );
}
