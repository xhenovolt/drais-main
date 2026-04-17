"use client";
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Users, Mail, Phone, Hash, Trash2, Eye, ChevronDown } from 'lucide-react';
import useSWR from 'swr';
import { fetcher } from '@/utils/fetcher';
import { toast } from 'react-hot-toast';

interface DuplicateStudent {
  id: number;
  admission_no: string;
  name: string;
  email?: string;
  phone?: string;
  class?: string;
  status: string;
}

interface DuplicateGroup {
  type: 'name' | 'email' | 'phone' | 'admission_no';
  count: number;
  students: DuplicateStudent[];
  matchingField: string;
}

interface DuplicatesData {
  totalDuplicateGroups: number;
  totalAffectedStudents: number;
  duplicates: DuplicateGroup[];
  summary: {
    byName: number;
    byEmail: number;
    byPhone: number;
    byAdmissionNo: number;
  };
}

const DuplicateDetection: React.FC<{ schoolId: number | null }> = ({ schoolId }) => {
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [selectedStudents, setSelectedStudents] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<'all' | 'name' | 'email' | 'phone' | 'admission_no'>('all');

  const { data: response, isLoading, mutate } = useSWR(
    schoolId ? `/api/dashboard/duplicates?school_id=${schoolId}` : null,
    fetcher,
    { revalidateOnFocus: true }
  );

  const data = response?.data as DuplicatesData | undefined;

  const toggleGroupExpanded = (idx: number) => {
    const newSet = new Set(expandedGroups);
    if (newSet.has(idx)) {
      newSet.delete(idx);
    } else {
      newSet.add(idx);
    }
    setExpandedGroups(newSet);
  };

  const handleStudentSelection = (studentId: number) => {
    const newSet = new Set(selectedStudents);
    if (newSet.has(studentId)) {
      newSet.delete(studentId);
    } else {
      newSet.add(studentId);
    }
    setSelectedStudents(newSet);
  };

  const handleMergeStudents = async () => {
    if (selectedStudents.size < 2) {
      toast.error('Please select at least 2 students to merge');
      return;
    }
    toast.info('Merge functionality coming soon...');
  };

  const handleDeleteDuplicate = async (studentId: number) => {
    if (!confirm('Are you sure you want to delete this student record?')) return;
    
    try {
      const response = await fetch(`/api/tahfiz/students/${studentId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        toast.success('Student deleted successfully');
        mutate();
      } else {
        toast.error('Failed to delete student');
      }
    } catch (error) {
      toast.error('Error deleting student');
      console.error(error);
    }
  };

  const filteredDuplicates = data?.duplicates.filter(group => 
    filter === 'all' ? true : group.type === filter
  ) || [];

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'name': return <Users className="w-5 h-5 text-blue-500" />;
      case 'email': return <Mail className="w-5 h-5 text-purple-500" />;
      case 'phone': return <Phone className="w-5 h-5 text-green-500" />;
      case 'admission_no': return <Hash className="w-5 h-5 text-yellow-500" />;
      default: return null;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'name': return 'Duplicate Name';
      case 'email': return 'Duplicate Email';
      case 'phone': return 'Duplicate Phone';
      case 'admission_no': return 'Duplicate Admission No';
      default: return type;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-gray-600 dark:text-gray-400">Scanning for duplicates...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-600 dark:text-gray-400">Failed to load duplicate detection data</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 border-l-4 border-red-500">
          <div className="text-sm text-gray-600 dark:text-gray-400">Duplicate Groups</div>
          <div className="text-3xl font-bold text-red-600">{data.totalDuplicateGroups}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 border-l-4 border-orange-500">
          <div className="text-sm text-gray-600 dark:text-gray-400">Affected Students</div>
          <div className="text-3xl font-bold text-orange-600">{data.totalAffectedStudents}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 border-l-4 border-blue-500">
          <div className="text-sm text-gray-600 dark:text-gray-400">By Name</div>
          <div className="text-3xl font-bold text-blue-600">{data.summary.byName}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 border-l-4 border-purple-500">
          <div className="text-sm text-gray-600 dark:text-gray-400">By Email</div>
          <div className="text-3xl font-bold text-purple-600">{data.summary.byEmail}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 bg-white dark:bg-slate-800 p-4 rounded-lg shadow">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
          }`}
        >
          All ({data.totalDuplicateGroups})
        </button>
        <button
          onClick={() => setFilter('name')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'name'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
          }`}
        >
          Names ({data.summary.byName})
        </button>
        <button
          onClick={() => setFilter('email')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'email'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
          }`}
        >
          Emails ({data.summary.byEmail})
        </button>
        <button
          onClick={() => setFilter('phone')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'phone'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
          }`}
        >
          Phones ({data.summary.byPhone})
        </button>
        <button
          onClick={() => setFilter('admission_no')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'admission_no'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
          }`}
        >
          Admission Nos ({data.summary.byAdmissionNo})
        </button>
      </div>

      {/* Duplicate Groups List */}
      <div className="space-y-4">
        {filteredDuplicates.length === 0 ? (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6 text-center">
            <p className="text-green-800 dark:text-green-300 font-medium">No duplicates found!</p>
          </div>
        ) : (
          filteredDuplicates.map((group, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden border border-red-200 dark:border-red-900"
            >
              {/* Group Header */}
              <button
                onClick={() => toggleGroupExpanded(idx)}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                <div className="flex items-center gap-4 flex-1">
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <div className="flex items-center gap-3">
                    {getTypeIcon(group.type)}
                    <div className="text-left">
                      <div className="font-bold text-gray-900 dark:text-white">
                        {getTypeLabel(group.type)}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {group.matchingField} • {group.count} students
                      </div>
                    </div>
                  </div>
                </div>
                <ChevronDown
                  className={`w-5 h-5 text-gray-600 dark:text-gray-400 transition-transform ${
                    expandedGroups.has(idx) ? 'transform rotate-180' : ''
                  }`}
                />
              </button>

              {/* Group Details */}
              {expandedGroups.has(idx) && (
                <div className="bg-gray-50 dark:bg-slate-700/50 p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                  {group.students.map((student) => (
                    <div
                      key={student.id}
                      className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700"
                    >
                      <input
                        type="checkbox"
                        checked={selectedStudents.has(student.id)}
                        onChange={() => handleStudentSelection(student.id)}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900 dark:text-white">
                          {student.name}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 space-x-2">
                          <span>{student.admission_no}</span>
                          {student.class && <span>• {student.class}</span>}
                          {student.email && <span>• {student.email}</span>}
                          {student.phone && <span>• {student.phone}</span>}
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        student.status === 'active'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                      }`}>
                        {student.status}
                      </span>
                      <button
                        onClick={() => handleDeleteDuplicate(student.id)}
                        className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Delete this student"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>

      {/* Action Buttons */}
      {selectedStudents.size > 0 && (
        <div className="fixed bottom-4 right-4 bg-white dark:bg-slate-800 rounded-lg shadow-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {selectedStudents.size} student(s) selected
            </span>
            <button
              onClick={handleMergeStudents}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              Merge Selected
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default DuplicateDetection;
