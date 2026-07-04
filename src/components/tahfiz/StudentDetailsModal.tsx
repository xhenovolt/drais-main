'use client';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, Phone, Mail, Calendar, BookOpen, Users, Award, Clock, Activity } from 'lucide-react';

interface StudentDetails {
  id: number;
  person_id: number;
  admission_no: string | null;
  name: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  avatar: string | null;
  group_id: number | null;
  group_name: string | null;
  completed_verses: number;
  total_verses: number;
  last_session: string | null;
  status: string;
  admission_date: string | null;
  notes: string | null;
}

interface StudentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: number | null;
}

export default function StudentDetailsModal({ isOpen, onClose, studentId }: StudentDetailsModalProps) {
  const [student, setStudent] = useState<StudentDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && studentId) {
      fetchStudentDetails();
    }
  }, [isOpen, studentId]);

  const fetchStudentDetails = async () => {
    if (!studentId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/tahfiz/students/${studentId}`);
      const data = await res.json();
      
      if (res.ok) {
        setStudent(data.data);
      } else {
        throw new Error(data.message || 'Failed to fetch student details');
      }
    } catch (error: any) {
      console.error('Error fetching student details:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      inactive: 'bg-muted text-foreground border-border',
      completed: 'bg-blue-100 text-blue-700 border-blue-200',
      deleted: 'bg-red-100 text-red-700 border-red-200'
    };
    return `px-3 py-1 rounded-full text-sm font-medium border ${styles[status as keyof typeof styles]}`;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not set';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return 'Invalid date';
    }
  };

  const calculateProgress = () => {
    if (!student || student.total_verses === 0) return 0;
    return Math.round((student.completed_verses / student.total_verses) * 100);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden"
          >
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-2xl font-bold text-foreground">Student Details</h2>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                </div>
              ) : error ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                      <X className="w-4 h-4 text-red-600" />
                    </div>
                    <div>
                      <p className="font-medium text-red-800">Error</p>
                      <p className="text-red-700 text-sm">{error}</p>
                    </div>
                  </div>
                </div>
              ) : student ? (
                <div className="space-y-6">
                  {/* Student Header */}
                  <div className="flex items-center space-x-4">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-xl">
                      {student.avatar ? (
                        <img src={student.avatar} alt={student.name} className="w-full h-full rounded-full" />
                      ) : (
                        student.name.charAt(0)
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-foreground">{student.name}</h3>
                      <p className="text-muted-foreground">{student.admission_no || 'No admission number'}</p>
                      <div className="mt-2">
                        <span className={getStatusBadge(student.status)}>
                          {student.status.charAt(0).toUpperCase() + student.status.slice(1)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Progress Section */}
                  <div className="bg-gradient-to-r from-emerald-50 to-blue-50 rounded-2xl p-6">
                    <h4 className="font-semibold text-foreground mb-4 flex items-center">
                      <BookOpen className="w-5 h-5 mr-2" />
                      Memorization Progress
                    </h4>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Completed Verses</span>
                        <span className="font-semibold text-foreground">
                          {student.completed_verses} / {student.total_verses}
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-3">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${calculateProgress()}%` }}
                          transition={{ duration: 0.8 }}
                          className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-3 rounded-full"
                        />
                      </div>
                      <div className="text-center">
                        <span className="text-2xl font-bold text-emerald-600">{calculateProgress()}%</span>
                        <p className="text-sm text-muted-foreground">Progress Complete</p>
                      </div>
                    </div>
                  </div>

                  {/* Contact Information */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <h4 className="font-semibold text-foreground flex items-center">
                        <User className="w-5 h-5 mr-2" />
                        Contact Information
                      </h4>
                      <div className="space-y-3">
                        <div className="flex items-center space-x-3">
                          <Phone className="w-4 h-4 text-muted-foreground" />
                          <span className="text-foreground">{student.phone || 'No phone number'}</span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <Mail className="w-4 h-4 text-muted-foreground" />
                          <span className="text-foreground">{student.email || 'No email address'}</span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span className="text-foreground">
                            Admitted: {formatDate(student.admission_date)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="font-semibold text-foreground flex items-center">
                        <Activity className="w-5 h-5 mr-2" />
                        Academic Information
                      </h4>
                      <div className="space-y-3">
                        <div className="flex items-center space-x-3">
                          <Users className="w-4 h-4 text-muted-foreground" />
                          <span className="text-foreground">
                            Group: {student.group_name || 'No group assigned'}
                          </span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <span className="text-foreground">
                            Last Session: {formatDate(student.last_session)}
                          </span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <Award className="w-4 h-4 text-muted-foreground" />
                          <span className="text-foreground">
                            Student ID: #{student.id}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Notes Section */}
                  {student.notes && (
                    <div>
                      <h4 className="font-semibold text-foreground mb-3">Notes</h4>
                      <div className="bg-muted rounded-lg p-4">
                        <p className="text-foreground whitespace-pre-wrap">{student.notes}</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center py-12">
                  <p className="text-muted-foreground">No student data available</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}