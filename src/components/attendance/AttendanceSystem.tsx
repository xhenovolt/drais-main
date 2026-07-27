"use client";
import React, { useState, useEffect } from 'react';
import { toLocalDateStr } from '@/lib/datetime/local-date';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, 
  Users, 
  UserCheck, 
  UserX, 
  Clock, 
  Filter,
  Download,
  Upload,
  Fingerprint,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Eye,
  Search,
  RefreshCw
} from 'lucide-react';
import useSWR from 'swr';
import { fetcher } from '@/utils/fetcher';
import { toast } from 'react-hot-toast';
import clsx from 'clsx';
import BiometricModal from './BiometricModal';

interface Student {
  student_id: number;
  first_name: string;
  last_name: string;
  other_name?: string;
  photo_url?: string;
  class_name: string;
  class_id: number;
  stream_name?: string;
  stream_id?: number;
  status: 'present' | 'absent' | 'late' | 'excused' | 'unmarked' | null;
  method?: 'manual' | 'biometric';
  marked_at?: string;
  has_fingerprint?: boolean;
}

interface AttendanceStats {
  present: number;
  absent: number;
  late: number;
  excused: number;
  unmarked: number;
  total: number;
  biometric_marks: number;
  manual_marks: number;
  attendance_rate: number;
}

const statusConfig = {
  present: { 
    icon: CheckCircle, 
    color: 'text-green-600 bg-green-50 border-green-200', 
    label: 'Present',
    buttonColor: 'bg-green-500 hover:bg-green-600'
  },
  absent: { 
    icon: XCircle, 
    color: 'text-red-600 bg-red-50 border-red-200', 
    label: 'Absent',
    buttonColor: 'bg-red-500 hover:bg-red-600'
  },
  late: { 
    icon: Clock, 
    color: 'text-orange-600 bg-orange-50 border-orange-200', 
    label: 'Late',
    buttonColor: 'bg-orange-500 hover:bg-orange-600'
  },
  excused: { 
    icon: AlertCircle, 
    color: 'text-blue-600 bg-blue-50 border-blue-200', 
    label: 'Excused',
    buttonColor: 'bg-blue-500 hover:bg-blue-600'
  },
  unmarked: { 
    icon: Clock, 
    color: 'text-gray-600 bg-gray-50 border-gray-200', 
    label: 'Not Marked',
    buttonColor: 'bg-gray-500 hover:bg-gray-600'
  }
};

export const AttendanceSystem: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState(toLocalDateStr());
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedStream, setSelectedStream] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [biometricModalOpen, setBiometricModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [markingAttendance, setMarkingAttendance] = useState<number | null>(null);

  // Fetch attendance data
  const attendanceUrl = `/api/attendance?date=${selectedDate}${selectedClass ? `&class_id=${selectedClass}` : ''}${selectedStream ? `&stream_id=${selectedStream}` : ''}`;
  const { data: attendanceData, mutate: mutateAttendance, isLoading } = useSWR(attendanceUrl, fetcher);

  // Fetch stats
  const statsUrl = selectedClass ? `/api/attendance/stats?class_id=${selectedClass}&date=${selectedDate}` : null;
  const { data: statsData } = useSWR(statsUrl, fetcher);

  // Fetch classes
  const { data: classData } = useSWR('/api/classes', fetcher);
  const classes = classData?.data || [];

  // Fetch streams
  const { data: streamData } = useSWR('/api/streams', fetcher);
  const streams = streamData?.data || [];

  const students: Student[] = attendanceData?.data || [];
  const stats: AttendanceStats = statsData?.data || {};

  // Filter students based on search
  const filteredStudents = students.filter(student => {
    const fullName = `${student.first_name} ${student.last_name} ${student.other_name || ''}`.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase());
  });

  const markAttendance = async (studentId: number, status: string) => {
    setMarkingAttendance(studentId);
    try {
      const response = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          date: selectedDate,
          status,
          method: 'manual'
        })
      });

      const result = await response.json();
      
      if (result.success) {
        toast.success(`Attendance marked as ${status}`);
        mutateAttendance();
      } else {
        toast.error(result.error || 'Failed to mark attendance');
      }
    } catch (error) {
      toast.error('Network error occurred');
    } finally {
      setMarkingAttendance(null);
    }
  };

  const handleBiometricScan = (student: Student) => {
    setSelectedStudent(student);
    setBiometricModalOpen(true);
  };

  const getStudentAvatar = (student: Student) => {
    if (student.photo_url) {
      return (
        <img 
          src={student.photo_url} 
          alt={`${student.first_name} ${student.last_name}`}
          className="w-10 h-10 rounded-full object-cover ring-2 ring-white shadow-md"
        />
      );
    }
    
    return (
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-md ring-2 ring-white">
        <span className="text-sm font-semibold text-white">
          {student.first_name?.charAt(0)}{student.last_name?.charAt(0)}
        </span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg">
                <UserCheck className="w-5 h-5 text-white" />
              </div>
              Attendance System
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Hybrid manual and biometric attendance tracking
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => mutateAttendance()}
              className="p-2 rounded-lg bg-white dark:bg-slate-800 shadow-md hover:shadow-lg transition-all"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {selectedClass && stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-lg border border-green-200 dark:border-green-800"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{stats.present}</p>
                <p className="text-xs text-gray-500">Present</p>
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-lg border border-red-200 dark:border-red-800"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{stats.absent}</p>
                <p className="text-xs text-gray-500">Absent</p>
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-lg border border-orange-200 dark:border-orange-800"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900 flex items-center justify-center">
                <Clock className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-orange-600">{stats.late}</p>
                <p className="text-xs text-gray-500">Late</p>
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-lg border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-600">{stats.unmarked}</p>
                <p className="text-xs text-gray-500">Unmarked</p>
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-lg border border-blue-200 dark:border-blue-800"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
                <p className="text-xs text-gray-500">Total</p>
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-lg border border-purple-200 dark:border-purple-800"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                <Fingerprint className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-purple-600">{stats.biometric_marks}</p>
                <p className="text-xs text-gray-500">Biometric</p>
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-lg border border-indigo-200 dark:border-indigo-800"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
                <div className="text-indigo-600 font-bold text-sm">{stats.attendance_rate}%</div>
              </div>
              <div>
                <p className="text-xs text-gray-500">Rate</p>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-700 focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Class</label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-700 focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Classes</option>
              {classes.map((cls: any) => (
                <option key={cls.id} value={cls.id}>{cls.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Stream</label>
            <select
              value={selectedStream}
              onChange={(e) => setSelectedStream(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-700 focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Streams</option>
              {streams.map((stream: any) => (
                <option key={stream.id} value={stream.id}>{stream.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search students..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-700 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Students List */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold">
            Students {selectedClass && `- ${classes.find((c: any) => c.id == selectedClass)?.name}`}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            {filteredStudents.length} students found
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Student
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Class/Stream
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Method
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredStudents.map((student) => {
                  const currentStatus = student.status || 'unmarked';
                  const config = statusConfig[currentStatus];
                  const StatusIcon = config.icon;

                  return (
                    <motion.tr
                      key={student.student_id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-3">
                          {getStudentAvatar(student)}
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {student.first_name} {student.last_name}
                            </div>
                            {student.other_name && (
                              <div className="text-xs text-gray-500">
                                {student.other_name}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-gray-100">
                          {student.class_name}
                        </div>
                        {student.stream_name && (
                          <div className="text-xs text-gray-500">
                            {student.stream_name}
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={clsx(
                          'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border',
                          config.color
                        )}>
                          <StatusIcon className="w-3 h-3" />
                          {config.label}
                        </span>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        {student.method && (
                          <span className={clsx(
                            'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
                            student.method === 'biometric' 
                              ? 'bg-purple-100 text-purple-700 border border-purple-200'
                              : 'bg-gray-100 text-gray-700 border border-gray-200'
                          )}>
                            {student.method === 'biometric' ? (
                              <Fingerprint className="w-3 h-3" />
                            ) : (
                              <Eye className="w-3 h-3" />
                            )}
                            {student.method}
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end space-x-2">
                          {/* Biometric button */}
                          {student.has_fingerprint && (
                            <button
                              onClick={() => handleBiometricScan(student)}
                              className="p-2 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-700 transition-colors"
                              title="Mark via fingerprint"
                            >
                              <Fingerprint className="w-4 h-4" />
                            </button>
                          )}

                          {/* Manual status buttons */}
                          <div className="flex space-x-1">
                            {(['present', 'absent', 'late', 'excused'] as const).map((status) => {
                              const isActive = student.status === status;
                              const config = statusConfig[status];
                              const Icon = config.icon;
                              
                              return (
                                <button
                                  key={status}
                                  onClick={() => markAttendance(student.student_id, status)}
                                  disabled={markingAttendance === student.student_id}
                                  className={clsx(
                                    'p-2 rounded-lg transition-all text-white',
                                    isActive 
                                      ? config.buttonColor.replace('hover:', '') 
                                      : 'bg-gray-300 hover:bg-gray-400',
                                    markingAttendance === student.student_id && 'opacity-50 cursor-not-allowed'
                                  )}
                                  title={`Mark as ${status}`}
                                >
                                  {markingAttendance === student.student_id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Icon className="w-4 h-4" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>

            {filteredStudents.length === 0 && !isLoading && (
              <div className="text-center py-12">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No students found</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Biometric Modal */}
      <BiometricModal
        open={biometricModalOpen}
        onClose={() => setBiometricModalOpen(false)}
        student={selectedStudent}
        date={selectedDate}
        onSuccess={() => {
          mutateAttendance();
          setBiometricModalOpen(false);
        }}
      />
    </div>
  );
};

export default AttendanceSystem;
