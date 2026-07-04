import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, UserCheck, Star, MessageSquare, CheckCircle } from 'lucide-react';

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

interface PresentModalProps {
  isOpen: boolean;
  onClose: () => void;
  learner: Learner | null;
  onSubmit: (data: any) => void;
  isLoading: boolean;
}

const PresentModal: React.FC<PresentModalProps> = ({
  isOpen,
  onClose,
  learner,
  onSubmit,
  isLoading
}) => {
  const [presented, setPresented] = useState(true);
  const [presentedLength, setPresentedLength] = useState<number | ''>('');
  const [retentionScore, setRetentionScore] = useState<number | ''>('');
  const [mark, setMark] = useState<number | ''>('');
  const [status, setStatus] = useState<'in_progress' | 'completed' | 'review'>('in_progress');
  const [notes, setNotes] = useState('');

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen && learner) {
      setPresented(true);
      setPresentedLength('');
      setRetentionScore('');
      setMark('');
      setStatus('in_progress');
      setNotes('');
    }
  }, [isOpen, learner]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (presented && !presentedLength) {
      return;
    }

    const data = {
      presented,
      presented_length: presented ? Number(presentedLength) : 0,
      retention_score: retentionScore ? Number(retentionScore) : null,
      mark: mark ? Number(mark) : null,
      status,
      notes: notes.trim() || null,
      recorded_by: 1, // This would come from the authenticated user
      school_id: 1 // This would come from the school context
    };

    onSubmit(data);
  };

  if (!isOpen || !learner) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold overflow-hidden">
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
            <div>
              <h2 className="text-xl font-semibold text-foreground">{learner.student_name}</h2>
              <p className="text-sm text-muted-foreground">
                {learner.next_portion?.portion_name || 'No portion'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Presented Toggle */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-3">
              Did the student present today?
            </label>
            <div className="flex space-x-4">
              <button
                type="button"
                onClick={() => setPresented(true)}
                className={`flex-1 p-3 rounded-lg border-2 transition-all ${
                  presented
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-border hover:border-border'
                }`}
              >
                <CheckCircle className="w-5 h-5 mx-auto mb-1" />
                <span className="font-medium">Yes, Presented</span>
              </button>
              <button
                type="button"
                onClick={() => setPresented(false)}
                className={`flex-1 p-3 rounded-lg border-2 transition-all ${
                  !presented
                    ? 'border-red-500 bg-red-50 text-red-700'
                    : 'border-border hover:border-border'
                }`}
              >
                <X className="w-5 h-5 mx-auto mb-1" />
                <span className="font-medium">No, Absent</span>
              </button>
            </div>
          </div>

          {/* Presentation Details (shown only if presented) */}
          {presented && (
            <>
              {/* Presented Length */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Amount Presented (verses/pages) *
                </label>
                <input
                  type="number"
                  min="0"
                  value={presentedLength}
                  onChange={(e) => setPresentedLength(e.target.value ? Number(e.target.value) : '')}
                  className="w-full p-3 border border-border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="Enter number of verses or pages"
                  required
                />
              </div>

              {/* Mark */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Mark (0-100)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={mark}
                  onChange={(e) => setMark(e.target.value ? Number(e.target.value) : '')}
                  className="w-full p-3 border border-border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="Enter mark out of 100"
                />
              </div>

              {/* Retention Score */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Retention Score (0-100)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={retentionScore}
                  onChange={(e) => setRetentionScore(e.target.value ? Number(e.target.value) : '')}
                  className="w-full p-3 border border-border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="How well did they retain previous portions?"
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-3">
                  Portion Status
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: 'in_progress', label: 'In Progress', color: 'blue' },
                    { value: 'completed', label: 'Completed', color: 'green' },
                    { value: 'review', label: 'Needs Review', color: 'yellow' }
                  ].map(({ value, label, color }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setStatus(value as any)}
                      className={`p-3 rounded-lg border-2 transition-all text-sm font-medium ${
                        status === value
                          ? `border-${color}-500 bg-${color}-50 text-${color}-700`
                          : 'border-border hover:border-border'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Notes (Optional)
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-3 border border-border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              placeholder={presented 
                ? "Add notes about the presentation quality, areas for improvement, etc."
                : "Add notes about the absence reason, makeup plans, etc."
              }
            />
          </div>

          {/* Summary */}
          <div className="bg-muted rounded-lg p-4">
            <h4 className="font-medium text-foreground mb-2">Record Summary</h4>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p><span className="font-medium">Student:</span> {learner.student_name}</p>
              <p><span className="font-medium">Portion:</span> {learner.next_portion?.portion_name}</p>
              <p><span className="font-medium">Status:</span> {presented ? 'Presented' : 'Absent'}</p>
              {presented && presentedLength && (
                <p><span className="font-medium">Amount:</span> {presentedLength} verses/pages</p>
              )}
              {presented && mark && (
                <p><span className="font-medium">Mark:</span> {mark}%</p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-muted-foreground hover:text-foreground font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || (presented && !presentedLength)}
              className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center space-x-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Recording...</span>
                </>
              ) : (
                <>
                  <UserCheck className="w-4 h-4" />
                  <span>Record Presentation</span>
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default PresentModal;
