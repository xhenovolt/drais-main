import React from 'react';
import { motion } from 'framer-motion';
import {
  User, Users, Clock, CheckCircle, AlertCircle, 
  PlayCircle, Plus, UserCheck, Eye, Calendar,
  Target, Award, BookOpen
} from 'lucide-react';

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

interface LearnerCardProps {
  learner: Learner;
  index: number;
  onAssignPortion: () => void;
  onMarkPresent: () => void;
  onViewHistory: () => void;
}

const LearnerCard: React.FC<LearnerCardProps> = ({
  learner,
  index,
  onAssignPortion,
  onMarkPresent,
  onViewHistory
}) => {
  const getStatusBadge = (status: string) => {
    const styles = {
      no_portion: 'bg-muted text-foreground border-border',
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      in_progress: 'bg-blue-100 text-blue-800 border-blue-200',
      completed: 'bg-green-100 text-green-800 border-green-200',
      review: 'bg-purple-100 text-purple-800 border-purple-200'
    };

    const icons = {
      no_portion: <AlertCircle className="w-3 h-3" />,
      pending: <Clock className="w-3 h-3" />,
      in_progress: <PlayCircle className="w-3 h-3" />,
      completed: <CheckCircle className="w-3 h-3" />,
      review: <BookOpen className="w-3 h-3" />
    };

    const labels = {
      no_portion: 'No Portion',
      pending: 'Pending',
      in_progress: 'In Progress',
      completed: 'Completed',
      review: 'Review'
    };

    return (
      <span className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium border ${styles[status as keyof typeof styles]}`}>
        {icons[status as keyof typeof icons]}
        <span>{labels[status as keyof typeof labels]}</span>
      </span>
    );
  };

  const getDifficultyColor = (level?: string) => {
    switch (level) {
      case 'easy': return 'text-emerald-600';
      case 'medium': return 'text-amber-600';
      case 'hard': return 'text-red-600';
      default: return 'text-muted-foreground';
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  const getProgressDays = () => {
    if (!learner.next_portion?.started_at && !learner.next_portion?.assigned_at) return 0;
    const startDate = learner.next_portion.started_at 
      ? new Date(learner.next_portion.started_at)
      : new Date(learner.next_portion.assigned_at!);
    const currentDate = new Date();
    const diffTime = Math.abs(currentDate.getTime() - startDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ delay: index * 0.05 }}
      className="bg-card rounded-2xl p-6 shadow-sm border border-border hover:shadow-md transition-all duration-300 group"
    >
      {/* Header */}
      <div className="flex items-center space-x-3 mb-4">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-lg overflow-hidden flex-shrink-0">
          {learner.student_avatar ? (
            <img 
              src={learner.student_avatar} 
              alt={learner.student_name} 
              className="w-full h-full object-cover"
            />
          ) : (
            learner.student_name.charAt(0)
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground truncate">{learner.student_name}</h3>
          <p className="text-sm text-muted-foreground truncate">
            {learner.group_name || 'No Group'} • {learner.admission_no || 'No ID'}
          </p>
          {learner.teacher_name && (
            <p className="text-xs text-muted-foreground truncate">{learner.teacher_name}</p>
          )}
        </div>
      </div>

      {/* Status Badge */}
      <div className="flex items-center justify-between mb-4">
        {getStatusBadge(learner.overall_status)}
        {learner.next_portion?.difficulty_level && (
          <span className={`text-xs font-medium px-2 py-1 rounded-full bg-muted ${getDifficultyColor(learner.next_portion.difficulty_level)}`}>
            {learner.next_portion.difficulty_level.charAt(0).toUpperCase() + learner.next_portion.difficulty_level.slice(1)}
          </span>
        )}
      </div>

      {/* Next Portion Section */}
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center">
          <Target className="w-4 h-4 mr-1" />
          Next Portion
        </h4>
        {learner.next_portion?.portion_name ? (
          <div className="bg-muted rounded-lg p-3">
            <p className="font-medium text-foreground text-sm mb-1">
              {learner.next_portion.portion_name}
            </p>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center space-x-3">
                <span className="flex items-center">
                  <Calendar className="w-3 h-3 mr-1" />
                  {formatDate(learner.next_portion.assigned_at)}
                </span>
                {learner.next_portion.estimated_days && (
                  <span className="flex items-center">
                    <Clock className="w-3 h-3 mr-1" />
                    {learner.next_portion.estimated_days}d
                  </span>
                )}
              </div>
            </div>
            
            {learner.next_portion.status === 'in_progress' && (
              <div className="mt-2 pt-2 border-t border-border">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-blue-700">Days in progress:</span>
                  <span className="font-semibold text-blue-800">{getProgressDays()}</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
            <AlertCircle className="w-5 h-5 text-amber-600 mx-auto mb-1" />
            <p className="text-sm text-amber-800 font-medium">No portion assigned</p>
            <button
              onClick={onAssignPortion}
              className="text-xs text-amber-700 hover:text-amber-800 underline mt-1"
            >
              Assign now →
            </button>
          </div>
        )}
      </div>

      {/* Last Presented Section */}
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center">
          <Award className="w-4 h-4 mr-1" />
          Last Presented
        </h4>
        {learner.last_presented ? (
          <div className="bg-green-50 rounded-lg p-3">
            <p className="font-medium text-foreground text-sm mb-1">
              {learner.last_presented.portion_name}
            </p>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{formatDate(learner.last_presented.completed_at)}</span>
              <div className="flex items-center space-x-2">
                {learner.last_presented.mark && (
                  <span className="bg-green-100 text-green-800 px-2 py-1 rounded">
                    {learner.last_presented.mark}%
                  </span>
                )}
                {learner.last_presented.retention_score && (
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    R: {learner.last_presented.retention_score}%
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-muted rounded-lg p-3 text-center">
            <p className="text-sm text-muted-foreground italic">Never presented</p>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-border">
        <button
          onClick={onAssignPortion}
          className="flex items-center space-x-1 px-3 py-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors text-sm font-medium"
          title="Assign Portion"
        >
          <Plus className="w-4 h-4" />
          <span>Assign</span>
        </button>

        {learner.next_portion?.id && (
          <button
            onClick={onMarkPresent}
            className="flex items-center space-x-1 px-3 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors text-sm font-medium"
            title="Mark Present"
          >
            <UserCheck className="w-4 h-4" />
            <span>Present</span>
          </button>
        )}

        <button
          onClick={onViewHistory}
          className="flex items-center space-x-1 px-3 py-2 text-muted-foreground hover:bg-muted rounded-lg transition-colors text-sm font-medium"
          title="View History"
        >
          <Eye className="w-4 h-4" />
          <span>History</span>
        </button>
      </div>
    </motion.div>
  );
};

export default LearnerCard;
