"use client";
import React, { useState, useEffect } from 'react';
import { Calendar, Users, UserCheck, UserX, Clock, Fingerprint, Search, Filter, Download, Smartphone, Shield, Server } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useSWR from 'swr';
import { toast } from 'react-hot-toast';
import { fetcher } from '@/utils/fetcher';
import BiometricModal from '@/components/attendance/BiometricModal';
import DeviceConnectionModal from '@/components/attendance/DeviceConnectionModal';
import AttendanceCard from '@/components/attendance/AttendanceCard';
import AttendanceStats from '@/components/attendance/AttendanceStats';
import clsx from 'clsx';

const AttendancePage: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedClass, setSelectedClass] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [biometricModalOpen, setBiometricModalOpen] = useState(false);
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);

  // Fetch attendance data
  const { data: attendanceData, mutate } = useSWR(
    `/api/attendance?date=${selectedDate}${selectedClass ? `&class_id=${selectedClass}` : ''}${statusFilter ? `&status=${statusFilter}` : ''}`,
    fetcher,
    { refreshInterval: 30000 }
  );

  // Fetch classes
  const { data: classData } = useSWR('/api/classes', fetcher);
  const classes = classData?.data || [];

  // Fetch stats
  const { data: statsData } = useSWR(
    `/api/attendance/stats?date=${selectedDate}${selectedClass ? `&class_id=${selectedClass}` : ''}`,
    fetcher,
    { refreshInterval: 30000 }
  );

  const students = attendanceData?.data || [];
  const stats = statsData?.data || {};

  // Filter students based on search
  const filteredStudents = students.filter((student: any) => {
    const fullName = `${student.first_name} ${student.last_name} ${student.other_name || ''}`.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase());
  });

  const handleAttendanceToggle = async (studentId: number, currentStatus: string) => {
    const newStatus = currentStatus === 'present' ? 'absent' : 'present';
    
    try {
      const response = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          date: selectedDate,
          status: newStatus,
          method: 'manual'
        })
      });

      if (response.ok) {
        mutate();
        toast.success(`Attendance updated to ${newStatus}`);
      }
    } catch (error) {
      toast.error('Failed to update attendance');
    }
  };

  const handleBiometricClick = (student: any) => {
    setSelectedStudent(student);
    setBiometricModalOpen(true);
  };

  const handleBiometricSuccess = () => {
    mutate();
    setBiometricModalOpen(false);
    setSelectedStudent(null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present': return 'text-green-600 bg-green-50';
      case 'absent': return 'text-red-600 bg-red-50';
      case 'late': return 'text-yellow-600 bg-yellow-50';
      case 'excused': return 'text-blue-600 bg-blue-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'present': return '✅';
      case 'absent': return '❌';
      case 'late': return '⏰';
      case 'excused': return '📋';
      default: return '⏳';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
              📊 Smart Attendance System
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Hybrid manual and biometric attendance tracking
            </p>
          </div>
          <button
            onClick={() => setDeviceModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-lg"
          >
            <Server className="w-5 h-5" />
            Connect Device
          </button>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
          {/* Date Selector */}
          <div className="card p-6">
            <label className="block text-sm font-medium mb-2">Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800"
            />
          </div>

          {/* Class Filter */}
          <div className="card p-6">
            <label className="block text-sm font-medium mb-2">Class</label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800"
            >
              <option value="">All Classes</option>
              {classes.map((cls: any) => (
                <option key={cls.id} value={cls.id}>{cls.name}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="card p-6">
            <label className="block text-sm font-medium mb-2">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800"
            >
              <option value="">All Status</option>
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="late">Late</option>
              <option value="not_marked">Not Marked</option>
            </select>
          </div>

          {/* Search */}
          <div className="card p-6">
            <label className="block text-sm font-medium mb-2">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search students..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Stats */}
        <AttendanceStats stats={stats} />

        {/* Student List */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Students ({filteredStudents.length})</h2>
            <div className="flex gap-2">
              <button className="btn-secondary flex items-center gap-2">
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <AnimatePresence>
              {filteredStudents.map((student: any) => (
                <AttendanceCard
                  key={student.student_id}
                  student={student}
                  onAttendanceToggle={handleAttendanceToggle}
                  onBiometricClick={handleBiometricClick}
                  getStatusColor={getStatusColor}
                  getStatusIcon={getStatusIcon}
                />
              ))}
            </AnimatePresence>
          </div>

          {filteredStudents.length === 0 && (
            <div className="text-center py-12">
              <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No students found</p>
            </div>
          )}
        </div>
      </div>

      {/* Biometric Modal */}
      <BiometricModal
        open={biometricModalOpen}
        onClose={() => setBiometricModalOpen(false)}
        student={selectedStudent}
        date={selectedDate}
        onSuccess={handleBiometricSuccess}
      />

      {/* Device Connection Modal */}
      <DeviceConnectionModal
        open={deviceModalOpen}
        onClose={() => setDeviceModalOpen(false)}
        onSuccess={() => {
          // Refresh device list if needed
        }}
      />
    </div>
  );
};

export default AttendancePage;