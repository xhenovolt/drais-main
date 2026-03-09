"use client";
import React, { useState, useEffect } from 'react';
import { AlertTriangle, Check, X, Loader2, Users } from 'lucide-react';
import useSWR from 'swr';
import { toast } from 'react-hot-toast';
import clsx from 'clsx';
import { fetcher } from '@/utils/fetcher';
import { motion, AnimatePresence } from 'framer-motion';

interface Student {
  id: number;
  admission_no: string;
  first_name: string;
  last_name: string;
  gender?: string;
  photo_url?: string;
  class_name?: string;
  admission_date?: string;
  status?: string;
}

interface DuplicateGroup {
  group_key: string;
  name: string;
  count: number;
  students: Student[];
}

interface DuplicatesManagerProps {
  open: boolean;
  onClose: () => void;
  onMergeComplete?: () => void;
  schoolId?: number;
}

const DuplicatesManager: React.FC<DuplicatesManagerProps> = ({
  open,
  onClose,
  onMergeComplete,
  schoolId = 1
}) => {
  const { data, isLoading, mutate } = useSWR(
    open ? `/api/students/list-duplicates?school_id=${schoolId}` : null,
    fetcher
  );

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [mergingGroup, setMergingGroup] = useState<string | null>(null);
  const [selectedPrimary, setSelectedPrimary] = useState<{ [key: string]: number }>({});
  const [isMerging, setIsMerging] = useState(false);

  const duplicates: DuplicateGroup[] = data?.data || [];

  const toggleGroup = (groupKey: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupKey)) {
      newExpanded.delete(groupKey);
    } else {
      newExpanded.add(groupKey);
    }
    setExpandedGroups(newExpanded);
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'suspended':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'on_leave':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  const handleMerge = async (groupKey: string, group: DuplicateGroup) => {
    const primaryId = selectedPrimary[groupKey];
    if (!primaryId) {
      toast.error('Please select a primary record to keep');
      return;
    }

    const secondaryIds = group.students
      .filter(s => s.id !== primaryId)
      .map(s => s.id);

    if (secondaryIds.length === 0) {
      toast.error('No other records to merge');
      return;
    }

    setIsMerging(true);
    try {
      // Merge all secondary into primary
      for (const secondaryId of secondaryIds) {
        const response = await fetch('/api/students/merge-duplicates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            primary_id: primaryId,
            secondary_id: secondaryId,
            school_id: schoolId
          })
        });

        const result = await response.json();
        if (!result.success) {
          throw new Error(result.error || 'Merge failed');
        }
      }

      toast.success(`✓ Merged ${secondaryIds.length} record(s) successfully`);
      setSelectedPrimary(prev => {
        const newState = { ...prev };
        delete newState[groupKey];
        return newState;
      });
      setMergingGroup(null);
      mutate();
      onMergeComplete?.();
    } catch (error: any) {
      console.error('Merge error:', error);
      toast.error(error.message || 'Failed to merge records');
    } finally {
      setIsMerging(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 w-full max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-slate-700 max-w-4xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6 sticky top-0 bg-white dark:bg-slate-900 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-amber-100 dark:bg-amber-900/30">
              <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Duplicate Learners
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {duplicates.length === 0 
                  ? 'No duplicates found - great!' 
                  : `${duplicates.length} group(s) with potential duplicates`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="py-12 flex flex-col items-center">
            <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-2" />
            <p className="text-gray-500 dark:text-gray-400">Scanning for duplicates...</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && duplicates.length === 0 && (
          <div className="py-12 flex flex-col items-center text-center">
            <Users className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">
              No duplicate learners detected in your system
            </p>
          </div>
        )}

        {/* Duplicate Groups */}
        <div className="space-y-3">
          {duplicates.map((group) => (
            <motion.div
              key={group.group_key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden"
            >
              {/* Group Header */}
              <button
                onClick={() => toggleGroup(group.group_key)}
                className="w-full p-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 hover:from-amber-100 hover:to-orange-100 dark:hover:from-amber-900/30 dark:hover:to-orange-900/30 transition-all flex items-center justify-between"
              >
                <div className="flex items-center gap-3 flex-1 text-left">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {group.name}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {group.count} record{group.count !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full bg-white dark:bg-slate-800 text-sm font-semibold text-amber-600 dark:text-amber-400">
                    {group.count}
                  </span>
                  <div className={`transition-transform ${expandedGroups.has(group.group_key) ? 'rotate-180' : ''}`}>
                    <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                  </div>
                </div>
              </button>

              {/* Expanded Details */}
              <AnimatePresence>
                {expandedGroups.has(group.group_key) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 overflow-hidden"
                  >
                    {/* Selection Mode */}
                    <div className="p-4 space-y-3">
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Select which record to keep (other records will be merged):
                      </p>

                      {group.students.map((student) => (
                        <label
                          key={student.id}
                          className="flex items-start gap-3 p-3 rounded-lg border-2 transition-all cursor-pointer"
                          style={{
                            borderColor: selectedPrimary[group.group_key] === student.id
                              ? 'rgb(168, 85, 247)' // purple
                              : 'rgb(229, 231, 235)', // gray
                            backgroundColor: selectedPrimary[group.group_key] === student.id
                              ? 'rgba(168, 85, 247, 0.05)'
                              : 'transparent'
                          }}
                        >
                          <input
                            type="radio"
                            checked={selectedPrimary[group.group_key] === student.id}
                            onChange={() => setSelectedPrimary(prev => ({
                              ...prev,
                              [group.group_key]: student.id
                            }))}
                            className="mt-1 cursor-pointer"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {student.photo_url ? (
                                <img
                                  src={student.photo_url}
                                  alt={student.first_name}
                                  className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                  {student.first_name?.[0]}{student.last_name?.[0]}
                                </div>
                              )}
                              <p className="font-semibold text-gray-900 dark:text-white">
                                {student.first_name} {student.last_name}
                              </p>
                              {student.status && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(student.status)}`}>
                                  {student.status}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-600 dark:text-gray-400">
                              <span>📋 {student.admission_no}</span>
                              {student.class_name && <span>📚 {student.class_name}</span>}
                              {student.admission_date && (
                                <span>📅 {new Date(student.admission_date).toLocaleDateString()}</span>
                              )}
                            </div>
                          </div>
                        </label>
                      ))}

                      {/* Action Buttons */}
                      <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-slate-700">
                        <button
                          onClick={() => setMergingGroup(null)}
                          className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleMerge(group.group_key, group)}
                          disabled={!selectedPrimary[group.group_key] || isMerging}
                          className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                        >
                          {isMerging ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Merging...
                            </>
                          ) : (
                            <>
                              <Check className="w-4 h-4" />
                              Merge Selected
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default DuplicatesManager;
