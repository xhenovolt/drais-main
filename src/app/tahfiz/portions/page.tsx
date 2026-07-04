'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Plus, Filter, Search, Clock, CheckCircle,
  AlertCircle, PlayCircle, BookOpen, UserCheck, Calendar,
  Target, Award, MoreVertical, Eye, Grid, List,
  ChevronDown, RefreshCw
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/components/i18n/I18nProvider';
import LearnerCard from '@/components/tahfiz/LearnerCard';
import AssignPortionModal from '@/components/tahfiz/AssignPortionModal';
import PresentModal from '@/components/tahfiz/PresentModal';
import StudentDetailModal from '@/components/tahfiz/StudentDetailModal';

interface Learner {
  student_id: number;
  student_name: string;
  admission_no?: string;
  student_avatar?: string;
  group_id?: number;
  group_name?: string;
  teacher_name?: string;
  next_portion: {
    id?: number;
    portion_name?: string;
    status?: 'pending' | 'in_progress' | 'completed' | 'review';
    assigned_at?: string;
    started_at?: string;
    difficulty_level?: 'easy' | 'medium' | 'hard';
    estimated_days?: number;
  } | null;
  last_presented: {
    portion_name?: string;
    presented_length?: number;
    completed_at?: string;
    mark?: number;
    retention_score?: number;
  } | null;
  overall_status: 'no_portion' | 'pending' | 'in_progress' | 'completed' | 'review';
}

function TahfizPortionsContent() {
  const { t } = useI18n();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const { user } = useAuth();
  const schoolId = user?.schoolId ?? 0;
  const [selectedLearners, setSelectedLearners] = useState<number[]>([]);
  
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showPresentModal, setShowPresentModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedLearner, setSelectedLearner] = useState<Learner | null>(null);
  const [targetStudentId, setTargetStudentId] = useState<number | null>(null);

  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // Fetch learners with portions data
  const { data: learners = [], isLoading, refetch } = useQuery({
    queryKey: ['tahfiz-learners', schoolId, statusFilter, groupFilter, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams({
        school_id: schoolId.toString(),
        ...(statusFilter !== 'all' && { status: statusFilter }),
        ...(groupFilter !== 'all' && { group_id: groupFilter }),
        ...(searchTerm && { search: searchTerm })
      });
      
      const response = await fetch(`/api/tahfiz/portions?${params}`);
      if (!response.ok) throw new Error('Failed to fetch learners');
      const data = await response.json();
      return data.data as Learner[];
    },
    refetchInterval: 600000, // Refetch every 10 minutes for live updates
  });

  // Fetch groups for filter
  const { data: groups = [] } = useQuery({
    queryKey: ['tahfiz-groups', schoolId],
    queryFn: async () => {
      const response = await fetch(`/api/tahfiz/groups?school_id=${schoolId}`);
      if (!response.ok) throw new Error('Failed to fetch groups');
      const data = await response.json();
      return data.data;
    },
  });

  // Mark present mutation
  const markPresentMutation = useMutation({
    mutationFn: async ({ portionId, data }: { portionId: number; data: any }) => {
      const response = await fetch(`/api/tahfiz/portions/${portionId}/present`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to mark present');
      return response.json();
    },
    onSuccess: () => {
      showToast('Presentation recorded successfully', 'success');
      queryClient.invalidateQueries({ queryKey: ['tahfiz-learners'] });
      setShowPresentModal(false);
    },
    onError: (error: any) => {
      showToast(error.message || 'Failed to record presentation', 'error');
    }
  });

  // Sort and filter learners
  const sortedLearners = React.useMemo(() => {
    let filtered = [...learners];
    
    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.student_name.localeCompare(b.student_name);
        case 'status':
          return a.overall_status.localeCompare(b.overall_status);
        case 'group':
          return (a.group_name || '').localeCompare(b.group_name || '');
        case 'last_presented':
          const dateA = a.last_presented?.completed_at || '0';
          const dateB = b.last_presented?.completed_at || '0';
          return dateB.localeCompare(dateA);
        default:
          return 0;
      }
    });
    
    return filtered;
  }, [learners, sortBy]);

  const handleAssignPortion = (studentId?: number) => {
    setTargetStudentId(studentId || null);
    setShowAssignModal(true);
  };

  const handleMarkPresent = (learner: Learner) => {
    if (!learner.next_portion?.id) {
      showToast('No active portion to mark as presented', 'error');
      return;
    }
    setSelectedLearner(learner);
    setShowPresentModal(true);
  };

  const handleViewHistory = (learner: Learner) => {
    setSelectedLearner(learner);
    setShowDetailModal(true);
  };

  const getStatusCounts = () => {
    return {
      total: learners.length,
      no_portion: learners.filter(l => l.overall_status === 'no_portion').length,
      pending: learners.filter(l => l.overall_status === 'pending').length,
      in_progress: learners.filter(l => l.overall_status === 'in_progress').length,
      completed: learners.filter(l => l.overall_status === 'completed').length,
      review: learners.filter(l => l.overall_status === 'review').length,
    };
  };

  const counts = getStatusCounts();

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-full mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{`${t('tahfiz.tahfiz')} — ${t('people.learners')}`}</h1>
            <p className="text-muted-foreground mt-1">Monitor and manage student memorization progress</p>
            
            {/* Status counts */}
            <div className="flex items-center gap-4 mt-3 text-sm">
              <span className="text-muted-foreground">Total: <span className="font-semibold">{counts.total}</span></span>
              <span className="text-amber-600">No Portion: <span className="font-semibold">{counts.no_portion}</span></span>
              <span className="text-yellow-600">Pending: <span className="font-semibold">{counts.pending}</span></span>
              <span className="text-blue-600">In Progress: <span className="font-semibold">{counts.in_progress}</span></span>
              <span className="text-green-600">Completed: <span className="font-semibold">{counts.completed}</span></span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => refetch()}
              className="px-4 py-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            
            <div className="flex items-center bg-card rounded-lg border border-border p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-md transition-colors ${
                  viewMode === 'grid' ? 'bg-blue-100 text-blue-600' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-md transition-colors ${
                  viewMode === 'list' ? 'bg-blue-100 text-blue-600' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            <motion.button
              onClick={() => handleAssignPortion()}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center space-x-2"
            >
              <Plus className="w-5 h-5" />
              <span>Assign Portions</span>
            </motion.button>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="bg-card/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div className="lg:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
              <input
                type="text"
                placeholder="Search by name or admission number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-border rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-3 border border-border rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
            >
              <option value="all">All Status</option>
              <option value="no_portion">No Portion</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="review">Review</option>
            </select>

            {/* Group Filter */}
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="px-4 py-3 border border-border rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
            >
              <option value="all">All Groups</option>
              {groups.map((group: any) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Options */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-foreground">Sort by:</span>
              <div className="flex gap-2">
                {
                [
                  {
                  value: 'name',
                  label: 'Name'
                },
                {
                  value: 'status',
                  label: 'Status'
                },
                {
                  value: 'group',
                  label: 'Group'
                },
                {
                  value: 'last_presented',
                  label: 'Last Presented'
                }
              ].map(option => (
                  <button
                    key={option.value}
                    onClick={() => setSortBy(option.value)}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      sortBy === option.value
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {sortedLearners.length !== learners.length && (
              <div className="text-sm text-muted-foreground">
                Showing {sortedLearners.length} of {learners.length} learners
              </div>
            )}
          </div>
        </div>

        {/* Learners Grid/List */}
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <AnimatePresence>
              {sortedLearners.map((learner, index) => (
                <LearnerCard
                  key={learner.student_id}
                  learner={learner}
                  index={index}
                  onAssignPortion={() => handleAssignPortion(learner.student_id)}
                  onMarkPresent={() => handleMarkPresent(learner)}
                  onViewHistory={() => handleViewHistory(learner)}
                />
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="bg-card/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="text-left py-4 px-6 font-semibold text-foreground">Student</th>
                    <th className="text-left py-4 px-6 font-semibold text-foreground">Group</th>
                    <th className="text-left py-4 px-6 font-semibold text-foreground">Next Portion</th>
                    <th className="text-left py-4 px-6 font-semibold text-foreground">Status</th>
                    <th className="text-left py-4 px-6 font-semibold text-foreground">Last Presented</th>
                    <th className="text-right py-4 px-6 font-semibold text-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedLearners.map((learner) => (
                    <tr key={learner.student_id} className="border-b border-slate-100 hover:bg-muted/50 transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-semibold text-sm overflow-hidden">
                            {learner.student_avatar ? (
                              <img src={learner.student_avatar} alt={learner.student_name} className="w-full h-full object-cover" />
                            ) : (
                              learner.student_name.charAt(0)
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-foreground">{learner.student_name}</div>
                            <div className="text-sm text-muted-foreground">{learner.admission_no || 'No ID'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="text-sm text-foreground">{learner.group_name || 'No Group'}</div>
                        <div className="text-xs text-muted-foreground">{learner.teacher_name || 'No Teacher'}</div>
                      </td>
                      <td className="py-4 px-6">
                        {learner.next_portion?.portion_name ? (
                          <div>
                            <div className="font-medium text-foreground">{learner.next_portion.portion_name}</div>
                            <div className="text-xs text-muted-foreground">
                              Assigned {learner.next_portion.assigned_at ? new Date(learner.next_portion.assigned_at).toLocaleDateString() : 'Unknown'}
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground italic">No portion assigned</div>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        {/* Status badge would go here */}
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          learner.overall_status === 'no_portion' ? 'bg-muted text-foreground' :
                          learner.overall_status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          learner.overall_status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                          learner.overall_status === 'completed' ? 'bg-green-100 text-green-800' :
                          'bg-purple-100 text-purple-800'
                        }`}>
                          {learner.overall_status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        {learner.last_presented ? (
                          <div>
                            <div className="text-sm font-medium text-foreground">{learner.last_presented.portion_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {learner.last_presented.completed_at ? new Date(learner.last_presented.completed_at).toLocaleDateString() : 'Unknown date'}
                              {learner.last_presented.mark && ` • ${learner.last_presented.mark}%`}
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground italic">Never presented</div>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleAssignPortion(learner.student_id)}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Assign Portion"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          {learner.next_portion?.id && (
                            <button
                              onClick={() => handleMarkPresent(learner)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Mark Present"
                            >
                              <UserCheck className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleViewHistory(learner)}
                            className="p-2 text-muted-foreground hover:bg-muted rounded-lg transition-colors"
                            title="View History"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && sortedLearners.length === 0 && (
          <div className="bg-card/80 backdrop-blur-sm rounded-2xl p-12 shadow-lg border border-white/20 text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">No learners found</h3>
            <p className="text-muted-foreground mb-6">
              {learners.length === 0
                ? "No students are enrolled in Tahfiz groups yet."
                : "No learners match your current filters."
              }
            </p>
            {learners.length === 0 && (
              <motion.button
                onClick={() => handleAssignPortion()}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center space-x-2 mx-auto"
              >
                <Plus className="w-5 h-5" />
                <span>Get Started</span>
              </motion.button>
            )}
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="bg-card/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20 animate-pulse">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-12 h-12 bg-slate-200 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-slate-200 rounded w-24" />
                    <div className="h-3 bg-slate-200 rounded w-16" />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="h-5 bg-slate-200 rounded w-32" />
                  <div className="h-3 bg-slate-200 rounded w-full" />
                  <div className="flex justify-between">
                    <div className="h-6 bg-slate-200 rounded w-16" />
                    <div className="h-6 bg-slate-200 rounded w-12" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <AssignPortionModal
        isOpen={showAssignModal}
        onClose={() => {
          setShowAssignModal(false);
          setTargetStudentId(null);
        }}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['tahfiz-learners'] });
          setShowAssignModal(false);
          setTargetStudentId(null);
        }}
        schoolId={schoolId}
        targetStudentId={targetStudentId}
      />

      <PresentModal
        isOpen={showPresentModal}
        onClose={() => {
          setShowPresentModal(false);
          setSelectedLearner(null);
        }}
        learner={selectedLearner}
        onSubmit={(data) => {
          if (selectedLearner?.next_portion?.id) {
            markPresentMutation.mutate({
              portionId: selectedLearner.next_portion.id,
              data
            });
          }
        }}
        isLoading={markPresentMutation.isPending}
      />

      <StudentDetailModal
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedLearner(null);
        }}
        studentId={selectedLearner?.student_id}
        schoolId={schoolId}
      />
    </div>
  );
}

export default function TahfizPortions() {
  return (
    <ToastProvider>
      <TahfizPortionsContent />
    </ToastProvider>
  );
}
