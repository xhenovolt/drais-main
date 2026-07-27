'use client';

import React, { useState, useEffect } from 'react';
import { toLocalDateStr } from '@/lib/datetime/local-date';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, Clock, Users, Check, X, 
  Search, Filter, ChevronLeft, ChevronRight, UserCheck, Plus
} from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';

interface AttendanceRecord {
  id: number;
  studentId: number;
  studentName: string;
  group: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  timeIn?: string;
  notes?: string;
}

export default function TahfizAttendance() {
  const { t } = useI18n();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState(toLocalDateStr());
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate API call
    setTimeout(() => {
      setAttendanceRecords([
        {
          id: 1,
          studentId: 1,
          studentName: 'Ahmad Al-Hassan',
          group: 'Advanced Group',
          status: 'present',
          timeIn: '09:15'
        },
        {
          id: 2,
          studentId: 2,
          studentName: 'Fatima Zahra',
          group: 'Advanced Group',
          status: 'absent'
        },
        {
          id: 3,
          studentId: 3,
          studentName: 'Omar Ibn Khattab',
          group: 'Beginner Circle',
          status: 'present',
          timeIn: '14:05'
        },
        {
          id: 4,
          studentId: 4,
          studentName: 'Aisha Siddiq',
          group: 'Beginner Circle',
          status: 'late',
          timeIn: '14:20'
        }
      ]);
      setLoading(false);
    }, 1000);
  }, [selectedDate, selectedGroup]);

  const getStatusBadge = (status: string) => {
    const styles = {
      present: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      absent: 'bg-red-100 text-red-700 border-red-200',
      late: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      excused: 'bg-blue-100 text-blue-700 border-blue-200'
    };
    return `px-3 py-1 rounded-full text-xs font-medium border ${styles[status as keyof typeof styles]}`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'present':
        return <Check className="w-4 h-4 text-emerald-600" />;
      case 'absent':
        return <X className="w-4 h-4 text-red-600" />;
      case 'late':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'excused':
        return <Check className="w-4 h-4 text-blue-600" />;
      default:
        return null;
    }
  };

  const updateAttendance = (recordId: number, newStatus: string) => {
    setAttendanceRecords(prev =>
      prev.map(record =>
        record.id === recordId
          ? { ...record, status: newStatus as any, timeIn: newStatus === 'present' ? new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }) : undefined }
          : record
      )
    );
  };

  const filteredRecords = attendanceRecords.filter(record =>
    (selectedGroup === 'all' || record.group === selectedGroup) &&
    (record.studentName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const attendanceStats = {
    present: filteredRecords.filter(r => r.status === 'present').length,
    absent: filteredRecords.filter(r => r.status === 'absent').length,
    late: filteredRecords.filter(r => r.status === 'late').length,
    total: filteredRecords.length
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-full mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{`${t('tahfiz.tahfiz')} — ${t('academic.attendance')}`}</h1>
            <p className="text-muted-foreground mt-1">Track daily attendance for Tahfiz sessions</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center space-x-2"
          >
            <UserCheck className="w-5 h-5" />
            <span>Mark Attendance</span>
          </motion.button>
        </div>

        {/* Filters */}
        <div className="bg-card/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
              <input
                type="text"
                placeholder="Search students..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-border rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
              />
            </div>
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="px-4 py-3 border border-border rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
            >
              <option value="all">All Groups</option>
              <option value="Advanced Group">Advanced Group</option>
              <option value="Beginner Circle">Beginner Circle</option>
              <option value="Evening Revision">Evening Revision</option>
            </select>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-4 py-3 border border-border rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
            />
          </div>
        </div>

        {/* Content */}
        <div className="bg-card/80 backdrop-blur-sm rounded-2xl p-12 shadow-lg border border-white/20 text-center">
          <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
            <UserCheck className="w-10 h-10 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold text-foreground mb-2">Tahfiz Attendance</h3>
          <p className="text-muted-foreground mb-6">
            This page will allow teachers to mark daily attendance for Tahfiz sessions and track student participation.
          </p>
        </div>

        {/* Attendance Table */}
        <div className="bg-card/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="text-lg font-bold text-foreground">
              Attendance for {new Date(selectedDate).toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="text-left p-4 font-medium text-foreground">Student</th>
                  <th className="text-left p-4 font-medium text-foreground">Group</th>
                  <th className="text-left p-4 font-medium text-foreground">Status</th>
                  <th className="text-left p-4 font-medium text-foreground">Time In</th>
                  <th className="text-left p-4 font-medium text-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {filteredRecords.map((record, index) => (
                    <motion.tr
                      key={record.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ delay: index * 0.1 }}
                      className="border-b border-slate-100 hover:bg-muted/50 transition-colors"
                    >
                      <td className="p-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-sm font-bold">
                            {record.studentName.charAt(0)}
                          </div>
                          <span className="font-medium text-foreground">{record.studentName}</span>
                        </div>
                      </td>
                      <td className="p-4 text-muted-foreground">{record.group}</td>
                      <td className="p-4">
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(record.status)}
                          <span className={getStatusBadge(record.status)}>
                            {record.status}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 text-muted-foreground">{record.timeIn || '-'}</td>
                      <td className="p-4">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => updateAttendance(record.id, 'present')}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Mark Present"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => updateAttendance(record.id, 'absent')}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Mark Absent"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => updateAttendance(record.id, 'late')}
                            className="p-2 text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                            title="Mark Late"
                          >
                            <Clock className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          {loading && (
            <div className="p-8 text-center">
              <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto" />
              <p className="text-muted-foreground mt-4">Loading attendance records...</p>
            </div>
          )}

          {!loading && filteredRecords.length === 0 && (
            <div className="p-8 text-center">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No attendance records found for the selected date and group.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
