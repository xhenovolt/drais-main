"use client";
import React from 'react';
import { motion } from 'framer-motion';
import { Fingerprint, Smartphone, Clock } from 'lucide-react';
import clsx from 'clsx';
import { MediaImg } from '@/components/media/MediaImg';

interface AttendanceCardProps {
  student: any;
  onAttendanceToggle: (studentId: number, currentStatus: string) => void;
  onBiometricClick: (student: any) => void;
  getStatusColor: (status: string) => string;
  getStatusIcon: (status: string) => string;
}

const AttendanceCard: React.FC<AttendanceCardProps> = ({
  student,
  onAttendanceToggle,
  onBiometricClick,
  getStatusColor,
  getStatusIcon
}) => {
  const status = student.attendance_status || 'not_marked';
  const isPresent = status === 'present' || status === 'late';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={clsx(
        "group relative bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-lg hover:shadow-xl transition-all duration-300 border-2",
        status === 'present' && "border-green-200 dark:border-green-700",
        status === 'absent' && "border-red-200 dark:border-red-700",
        status === 'late' && "border-yellow-200 dark:border-yellow-700",
        status === 'not_marked' && "border-gray-200 dark:border-gray-600"
      )}
    >
      {/* Status Indicator */}
      <div className="absolute top-3 right-3">
        <span className={clsx('px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1', getStatusColor(status))}>
          <span>{getStatusIcon(status)}</span>
          {status.replace('_', ' ')}
        </span>
      </div>

      {/* Student Photo */}
      <div className="flex flex-col items-center mb-3">
        <div className="relative">
          <MediaImg
            src={student.photo_url || '/default-avatar.png'}
            alt={`${student.first_name} ${student.last_name}`}
            className="w-16 h-16 rounded-full object-cover border-4 border-white dark:border-slate-700 shadow-lg"
          />
          {student.method === 'biometric' && (
            <div className="absolute -bottom-1 -right-1 bg-blue-500 rounded-full p-1">
              <Smartphone className="w-3 h-3 text-white" />
            </div>
          )}
        </div>
        
        <h3 className="font-semibold text-gray-900 dark:text-white mt-2 text-center">
          {student.first_name} {student.last_name}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {student.class_name} {student.stream_name && `- ${student.stream_name}`}
        </p>
      </div>

      {/* Time Info */}
      {student.time_in && (
        <div className="flex items-center justify-center gap-1 mb-3 text-xs text-gray-600 dark:text-gray-400">
          <Clock className="w-3 h-3" />
          {student.time_in}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        {/* Manual Toggle */}
        <button
          onClick={() => onAttendanceToggle(student.student_id, status)}
          className={clsx(
            "flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all duration-200",
            isPresent 
              ? "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300" 
              : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300"
          )}
        >
          {isPresent ? 'Mark Absent' : 'Mark Present'}
        </button>

        {/* Biometric Button */}
        <button
          onClick={() => onBiometricClick(student)}
          className={clsx(
            "p-2 rounded-lg transition-all duration-200",
            student.has_fingerprint
              ? "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-400"
          )}
          title={student.has_fingerprint ? "Use Biometric" : "Setup Biometric"}
        >
          <Fingerprint className="w-4 h-4" />
        </button>
      </div>

      {/* Hover Effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
    </motion.div>
  );
};

export default AttendanceCard;
