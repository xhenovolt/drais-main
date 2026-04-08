'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, Plus, Search, Filter, Eye, Edit, UserPlus, 
  BookOpen, Award, Clock, Trash2, RefreshCw, MoreVertical
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { StudentWizard } from '@/components/students/StudentWizard';

interface TahfizStudent {
  name: string;
  first_name: string;
  last_name: string;
  admission_no: string;
  status: string;
  avatar: string | null;
  gender: string;
  class_name: string;
  stream_name: string;
  theology_class_name: string | null;
  curriculum_name: string;
  curriculum_code: string;
  group_name: string | null;
  group_id: number | null;
  teacher_name: string | null;
  total_portions: number;
  completed_portions: number;
  total_presentations: number;
  avg_retention_score: number | null;
  avg_marks: number | null;
  attendance_records: number;
  present_days: number;
  attendance_rate: number;
  completion_rate: number;
  last_session: string | null;
  enrollment_date: string | null;
  total_verses: number;
  completed_verses: number;
}

function TahfizStudentsContent() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterGroup, setFilterGroup] = useState('all');
  const { user } = useAuth();
  const schoolId = user?.schoolId ?? 0;
  
  // Add state for StudentWizard modal
  const [showStudentWizard, setShowStudentWizard] = useState(false);
  
  const { showToast } = useToast();

  // Fetch Tahfiz students
  const { data: students = [], isLoading, error, refetch } = useQuery({
    queryKey: ['tahfiz-students', schoolId, filterStatus, filterGroup, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams({
        school_id: schoolId.toString(),
        ...(filterStatus !== 'all' && { status: filterStatus }),
        ...(filterGroup !== 'all' && { group: filterGroup }),
        ...(searchTerm && { search: searchTerm })
      });
      
      const response = await fetch(`/api/tahfiz/students?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch Tahfiz students');
      }
      const data = await response.json();
      return data.data as TahfizStudent[];
    },
    refetchInterval: 300000, // Refetch every 5 minutes
  });

  const getStatusBadge = (status: string) => {
    const styles = {
      active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      inactive: 'bg-gray-100 text-gray-700 border-gray-200',
      completed: 'bg-blue-100 text-blue-700 border-blue-200',
      deleted: 'bg-red-100 text-red-700 border-red-200'
    };
    return `px-3 py-1 rounded-full text-xs font-medium border ${styles[status as keyof typeof styles] || styles.active}`;
  };

  const filteredStudents = students.filter(student => {
    const matchesSearch = student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         student.admission_no.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || student.status === filterStatus;
    const matchesGroup = filterGroup === 'all' || student.group_name === filterGroup || 
                        (filterGroup === 'no_group' && !student.group_name);
    return matchesSearch && matchesStatus && matchesGroup;
  });

  // Get unique groups for filter
  const availableGroups = Array.from(new Set(students.map(s => s.group_name).filter(Boolean)));

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not available';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return 'Invalid date';
    }
  };

  const getCompletionPercentage = (completed: number, total: number) => {
    if (total === 0) return 0;
    return Math.min((completed / total) * 100, 100);
  };

  const handleEnrollStudent = () => {
    setShowStudentWizard(true);
  };

  const handleStudentCreated = () => {
    // Refresh the students list after successful creation
    refetch();
    setShowStudentWizard(false);
    showToast('Student enrolled successfully!', 'success');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 p-6">
      <div className="max-w-full mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Tahfiz Students</h1>
            <p className="text-slate-600 mt-1">Manage students enrolled in Tahfiz programs</p>
            
            {/* Summary Stats */}
            {students.length > 0 && (
              <div className="flex items-center gap-4 mt-3 text-sm">
                <span className="text-slate-600">Total: <span className="font-semibold">{students.length}</span></span>
                <span className="text-emerald-600">Active: <span className="font-semibold">{students.filter(s => s.status === 'active').length}</span></span>
                <span className="text-blue-600">With Groups: <span className="font-semibold">{students.filter(s => s.group_name).length}</span></span>
                <span className="text-purple-600">Completed Portions: <span className="font-semibold">{students.reduce((sum, s) => sum + s.completed_portions, 0)}</span></span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => refetch()}
              className="px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleEnrollStudent}
              className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center space-x-2"
            >
              <UserPlus className="w-5 h-5" />
              <span>Enroll Student</span>
            </motion.button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search students..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
              />
            </div>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="completed">Completed</option>
            </select>

            {/* Group Filter */}
            <select
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
              className="px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
            >
              <option value="all">All Groups</option>
              <option value="no_group">No Group</option>
              {availableGroups.map(group => (
                <option key={group} value={group}>{group}</option>
              ))}
            </select>

            {/* Results Count */}
            <div className="flex items-center justify-center bg-slate-50 rounded-xl px-4 py-3">
              <span className="text-sm text-slate-600">
                Showing {filteredStudents.length} of {students.length}
              </span>
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <Clock className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-medium text-red-800">Error loading students</p>
                <p className="text-red-700 text-sm">{error instanceof Error ? error.message : 'Unknown error'}</p>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && filteredStudents.length === 0 && (
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-12 shadow-lg border border-white/20 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-xl font-semibold text-slate-800 mb-2">
              {students.length === 0 ? 'No Tahfiz students found' : 'No students match your filters'}
            </h3>
            <p className="text-slate-600 mb-6">
              {students.length === 0 
                ? "Students enrolled in TAHFIZ classes will appear here."
                : "Try adjusting your search criteria or filters."
              }
            </p>
          </div>
        )}

        {/* Students Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {filteredStudents.map((student, index) => (
              <motion.div
                key={student.admission_no}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20 hover:shadow-xl transition-all duration-300 group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold overflow-hidden">
                      {student.avatar ? (
                        <img src={student.avatar} alt={student.name} className="w-full h-full object-cover" />
                      ) : (
                        student.first_name.charAt(0)
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-800 group-hover:text-emerald-600 transition-colors truncate">
                        {student.name}
                      </h3>
                      <p className="text-sm text-slate-500 truncate">
                        {student.group_name || 'No Group'} • {student.class_name}
                      </p>
                      <p className="text-xs text-slate-400">#{student.admission_no}</p>
                    </div>
                  </div>
                  
                  <div className="relative group/menu">
                    <button className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
                      <MoreVertical className="w-4 h-4 text-slate-400" />
                    </button>
                    <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-200 py-2 opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible transition-all duration-200 z-10">
                      <button className="flex items-center space-x-2 w-full px-4 py-2 text-left text-slate-700 hover:bg-slate-50 transition-colors">
                        <Eye className="w-4 h-4" />
                        <span>View Details</span>
                      </button>
                      <button className="flex items-center space-x-2 w-full px-4 py-2 text-left text-slate-700 hover:bg-slate-50 transition-colors">
                        <Edit className="w-4 h-4" />
                        <span>Edit Student</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Progress Stats */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-slate-50 rounded-xl">
                      <div className="text-lg font-bold text-slate-800">{student.completed_portions}</div>
                      <div className="text-xs text-slate-500">Portions</div>
                    </div>
                    <div className="text-center p-3 bg-slate-50 rounded-xl">
                      <div className="text-lg font-bold text-slate-800">
                        {student.attendance_rate > 0 ? `${student.attendance_rate}%` : '0%'}
                      </div>
                      <div className="text-xs text-slate-500">Attendance</div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Completion</span>
                      <span className="text-sm font-semibold text-slate-800">
                        {student.completed_verses}/{student.total_verses || 'N/A'}
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${getCompletionPercentage(student.completed_verses, student.total_verses)}%` }}
                        transition={{ delay: index * 0.05 + 0.3, duration: 0.8 }}
                        className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-2 rounded-full"
                      />
                    </div>
                  </div>

                  {/* Additional Info */}
                  <div className="space-y-2 text-xs text-slate-600">
                    {student.teacher_name && (
                      <div className="flex items-center justify-between">
                        <span>Teacher:</span>
                        <span className="font-medium">{student.teacher_name}</span>
                      </div>
                    )}
                    {student.avg_marks && (
                      <div className="flex items-center justify-between">
                        <span>Avg. Mark:</span>
                        <span className="font-medium">{student.avg_marks.toFixed(1)}%</span>
                      </div>
                    )}
                    {student.last_session && (
                      <div className="flex items-center justify-between">
                        <span>Last Session:</span>
                        <span className="font-medium">{formatDate(student.last_session)}</span>
                      </div>
                    )}
                  </div>

                  {/* Status Badge */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <div className="flex items-center space-x-2">
                      <BookOpen className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-600">
                        {student.theology_class_name || student.curriculum_name || 'Tahfiz Program'}
                      </span>
                    </div>
                    <span className={getStatusBadge(student.status)}>
                      {student.status.charAt(0).toUpperCase() + student.status.slice(1)}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20 animate-pulse">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-12 h-12 bg-slate-200 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-slate-200 rounded w-32" />
                    <div className="h-3 bg-slate-200 rounded w-24" />
                    <div className="h-3 bg-slate-200 rounded w-16" />
                  </div>
                  <div className="w-6 h-6 bg-slate-200 rounded" />
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="h-16 bg-slate-200 rounded-xl" />
                    <div className="h-16 bg-slate-200 rounded-xl" />
                  </div>
                  <div className="h-2 bg-slate-200 rounded" />
                  <div className="space-y-2">
                    <div className="h-3 bg-slate-200 rounded" />
                    <div className="h-3 bg-slate-200 rounded w-3/4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* StudentWizard Modal */}
        <StudentWizard
          open={showStudentWizard}
          onClose={() => setShowStudentWizard(false)}
          onCreated={handleStudentCreated}
          onSubmit={async (formData) => {
            // The StudentWizard handles the submission internally
            // This callback is for any additional handling if needed
          }}
        />
      </div>
    </div>
  );
}

// Main component wrapped with ToastProvider
export default function TahfizStudents() {
  return (
    <ToastProvider>
      <TahfizStudentsContent />
    </ToastProvider>
  );
}

