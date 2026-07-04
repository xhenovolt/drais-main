import React from 'react';
import { motion } from 'framer-motion';
import { X, Clock, CheckCircle, AlertCircle, Calendar, Award, BookOpen, TrendingUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

interface StudentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId?: number;
  schoolId: number;
}

const StudentDetailModal: React.FC<StudentDetailModalProps> = ({
  isOpen,
  onClose,
  studentId,
  schoolId
}) => {
  // Fetch student history
  const { data: studentHistory, isLoading } = useQuery({
    queryKey: ['tahfiz-student-history', studentId],
    queryFn: async () => {
      if (!studentId) return null;
      const response = await fetch(`/api/tahfiz/portions/${studentId}/history?school_id=${schoolId}`);
      if (!response.ok) throw new Error('Failed to fetch student history');
      const data = await response.json();
      return data.data;
    },
    enabled: isOpen && !!studentId
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'in_progress':
        return <Clock className="w-4 h-4 text-blue-600" />;
      case 'pending':
        return <AlertCircle className="w-4 h-4 text-yellow-600" />;
      case 'review':
        return <BookOpen className="w-4 h-4 text-purple-600" />;
      default:
        return <AlertCircle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'review':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      default:
        return 'bg-muted text-foreground border-border';
    }
  };

  if (!isOpen) return null;

  // Mock data for now
  const mockData = {
    student: {
      id: studentId,
      name: 'Ahmed Al-Rashid',
      admission_no: 'STD001',
      avatar: null,
      group_name: 'Hifz Level 1',
      teacher_name: 'Ustaz Muhammad'
    },
    summary: {
      total_portions: 12,
      completed_portions: 8,
      in_progress_portions: 1,
      average_mark: 87.5,
      average_retention: 92.3,
      total_verses: 450,
      last_activity: '2024-01-15T10:00:00Z'
    },
    portions: [
      {
        id: 1,
        portion_name: 'Surah Al-Fatiha: 1-7',
        status: 'completed',
        assigned_at: '2024-01-01T08:00:00Z',
        started_at: '2024-01-02T09:00:00Z',
        completed_at: '2024-01-05T10:00:00Z',
        difficulty_level: 'easy',
        estimated_days: 3,
        actual_days: 4,
        records: [
          {
            id: 1,
            date: '2024-01-05T10:00:00Z',
            presented_length: 7,
            mark: 95,
            retention_score: 98,
            notes: 'Excellent recitation with proper tajweed'
          }
        ]
      },
      {
        id: 2,
        portion_name: 'Surah Al-Baqarah: 1-10',
        status: 'in_progress',
        assigned_at: '2024-01-10T08:00:00Z',
        started_at: '2024-01-11T09:00:00Z',
        difficulty_level: 'medium',
        estimated_days: 7,
        records: [
          {
            id: 2,
            date: '2024-01-12T10:00:00Z',
            presented_length: 5,
            mark: 82,
            retention_score: 88,
            notes: 'Good progress, needs more practice on verses 6-10'
          }
        ]
      }
    ]
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border bg-gradient-to-r from-emerald-50 to-blue-50">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-xl overflow-hidden">
              {mockData.student.avatar ? (
                <img 
                  src={mockData.student.avatar} 
                  alt={mockData.student.name} 
                  className="w-full h-full object-cover"
                />
              ) : (
                mockData.student.name.charAt(0)
              )}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">{mockData.student.name}</h2>
              <p className="text-muted-foreground">
                {mockData.student.admission_no} • {mockData.student.group_name}
              </p>
              <p className="text-sm text-muted-foreground">Teacher: {mockData.student.teacher_name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex h-[calc(90vh-120px)]">
          {/* Summary Sidebar */}
          <div className="w-80 bg-muted p-6 overflow-y-auto">
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2" />
              Progress Summary
            </h3>
            
            <div className="space-y-4">
              {/* Overall Stats */}
              <div className="bg-card rounded-lg p-4 shadow-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-600">
                      {mockData.summary.completed_portions}
                    </div>
                    <div className="text-xs text-muted-foreground">Completed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {mockData.summary.in_progress_portions}
                    </div>
                    <div className="text-xs text-muted-foreground">In Progress</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {mockData.summary.total_verses}
                    </div>
                    <div className="text-xs text-muted-foreground">Total Verses</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-amber-600">
                      {mockData.summary.average_mark}%
                    </div>
                    <div className="text-xs text-muted-foreground">Avg Mark</div>
                  </div>
                </div>
              </div>

              {/* Performance Metrics */}
              <div className="bg-card rounded-lg p-4 shadow-sm">
                <h4 className="font-medium text-foreground mb-3">Performance</h4>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Average Mark</span>
                      <span className="font-medium">{mockData.summary.average_mark}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-emerald-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${mockData.summary.average_mark}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Retention Score</span>
                      <span className="font-medium">{mockData.summary.average_retention}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${mockData.summary.average_retention}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-card rounded-lg p-4 shadow-sm">
                <h4 className="font-medium text-foreground mb-2">Last Activity</h4>
                <p className="text-sm text-muted-foreground">
                  {formatDate(mockData.summary.last_activity)}
                </p>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="flex-1 p-6 overflow-y-auto">
            <h3 className="text-lg font-semibold text-foreground mb-6 flex items-center">
              <Calendar className="w-5 h-5 mr-2" />
              Portion History
            </h3>

            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-muted rounded-lg p-4 animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
                    <div className="h-3 bg-gray-200 rounded w-1/2 mb-2" />
                    <div className="h-3 bg-gray-200 rounded w-1/4" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                {mockData.portions.map((portion, index) => (
                  <div key={portion.id} className="relative">
                    {/* Timeline connector */}
                    {index !== mockData.portions.length - 1 && (
                      <div className="absolute left-6 top-12 w-px h-full bg-gray-200" />
                    )}
                    
                    <div className="flex items-start space-x-4">
                      {/* Status indicator */}
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 bg-card ${getStatusColor(portion.status)}`}>
                        {getStatusIcon(portion.status)}
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 bg-card rounded-lg border border-border p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold text-foreground">{portion.portion_name}</h4>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(portion.status)}`}>
                            {portion.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground mb-4">
                          <div>
                            <span className="font-medium">Assigned:</span> {formatDate(portion.assigned_at)}
                          </div>
                          {portion.started_at && (
                            <div>
                              <span className="font-medium">Started:</span> {formatDate(portion.started_at)}
                            </div>
                          )}
                          {portion.completed_at && (
                            <div>
                              <span className="font-medium">Completed:</span> {formatDate(portion.completed_at)}
                            </div>
                          )}
                          <div>
                            <span className="font-medium">Difficulty:</span> 
                            <span className={`ml-1 capitalize ${
                              portion.difficulty_level === 'easy' ? 'text-green-600' :
                              portion.difficulty_level === 'medium' ? 'text-yellow-600' :
                              'text-red-600'
                            }`}>
                              {portion.difficulty_level}
                            </span>
                          </div>
                        </div>

                        {/* Records */}
                        {portion.records && portion.records.length > 0 && (
                          <div className="border-t border-gray-100 pt-4">
                            <h5 className="font-medium text-foreground mb-3 flex items-center">
                              <Award className="w-4 h-4 mr-1" />
                              Presentation Records
                            </h5>
                            <div className="space-y-3">
                              {portion.records.map((record) => (
                                <div key={record.id} className="bg-muted rounded-lg p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium text-foreground">
                                      {formatDate(record.date)}
                                    </span>
                                    <div className="flex items-center space-x-2">
                                      {record.mark && (
                                        <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">
                                          {record.mark}%
                                        </span>
                                      )}
                                      {record.retention_score && (
                                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
                                          R: {record.retention_score}%
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-sm text-muted-foreground mb-2">
                                    Presented: {record.presented_length} verses
                                  </div>
                                  {record.notes && (
                                    <div className="text-sm text-muted-foreground italic">
                                      &ldquo;{record.notes}&rdquo;
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default StudentDetailModal;
