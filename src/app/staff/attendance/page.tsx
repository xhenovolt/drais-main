"use client";
import React, { useState, useMemo } from 'react';
import { 
  Calendar, 
  Users, 
  Clock, 
  Search, 
  Filter, 
  Download, 
  UserCheck, 
  UserX, 
  Edit3,
  Trash2,
  Plus,
  CheckSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useSWR from 'swr';
import { fetcher } from '@/utils/fetcher';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';

const StaffAttendancePage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedStaff, setSelectedStaff] = useState<number[]>([]);
  const [bulkAction, setBulkAction] = useState('');
  const [showBulkModal, setShowBulkModal] = useState(false);

  // Fetch attendance data
  const { data: attendanceData, isLoading, mutate } = useSWR(
    `/api/staff/attendance?date=${selectedDate}${selectedDepartment ? `&department_id=${selectedDepartment}` : ''}${selectedStatus ? `&status=${selectedStatus}` : ''}`,
    fetcher
  );

  // Fetch departments
  const { data: departmentsData } = useSWR('/api/departments', fetcher);

  // Fetch staff list
  const { data: staffData } = useSWR('/api/staff/list', fetcher);

  const attendanceRecords = attendanceData?.data || [];
  const departments = departmentsData?.data || [];
  const staff = staffData?.data || [];

  // Filter records based on search
  const filteredRecords = useMemo(() => {
    return attendanceRecords.filter((record: any) => {
      const fullName = `${record.first_name} ${record.last_name}`.toLowerCase();
      const searchMatch = !searchQuery || 
        fullName.includes(searchQuery.toLowerCase()) ||
        record.staff_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        record.department_name?.toLowerCase().includes(searchQuery.toLowerCase());
      
      return searchMatch;
    });
  }, [attendanceRecords, searchQuery]);

  // Handle bulk actions
  const handleBulkAction = async () => {
    if (selectedStaff.length === 0 || !bulkAction) {
      toast.error('Please select staff and action');
      return;
    }

    try {
      const bulkData = selectedStaff.map(staffId => ({
        staff_id: staffId,
        date: selectedDate,
        status: bulkAction,
        notes: `Bulk marked as ${bulkAction}`
      }));

      const response = await fetch('/api/staff/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulk_data: bulkData })
      });

      if (response.ok) {
        toast.success(`${selectedStaff.length} staff marked as ${bulkAction}`);
        setSelectedStaff([]);
        setBulkAction('');
        setShowBulkModal(false);
        mutate();
      } else {
        toast.error('Failed to update attendance');
      }
    } catch (error) {
      toast.error('An error occurred');
    }
  };

  // Handle individual attendance update
  const updateAttendance = async (staffId: number, status: string) => {
    try {
      const response = await fetch('/api/staff/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_id: staffId,
          date: selectedDate,
          status: status,
          time_in: status === 'present' ? '08:00' : null
        })
      });

      if (response.ok) {
        toast.success('Attendance updated');
        mutate();
      } else {
        toast.error('Failed to update attendance');
      }
    } catch (error) {
      toast.error('An error occurred');
    }
  };

  // Export attendance data
  const exportData = () => {
    const csvData = filteredRecords.map((record: any) => ({
      'Staff Name': `${record.first_name} ${record.last_name}`,
      'Staff No': record.staff_no,
      'Department': record.department_name,
      'Date': record.date,
      'Status': record.status,
      'Time In': record.time_in || '',
      'Time Out': record.time_out || '',
      'Notes': record.notes || ''
    }));

    const csv = [
      Object.keys(csvData[0]).join(','),
      ...csvData.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `staff-attendance-${selectedDate}.csv`;
    a.click();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present': return 'bg-green-100 text-green-800';
      case 'absent': return 'bg-red-100 text-red-800';
      case 'late': return 'bg-yellow-100 text-yellow-800';
      case 'excused': return 'bg-blue-100 text-blue-800';
      case 'on_leave': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              👥 Staff Attendance
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {filteredRecords.length} records for {format(new Date(selectedDate), 'MMMM d, yyyy')}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={exportData}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            
            {selectedStaff.length > 0 && (
              <button
                onClick={() => setShowBulkModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <CheckSquare className="w-4 h-4" />
                Bulk Action ({selectedStaff.length})
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search staff..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
              />
            </div>

            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
              />
            </div>

            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
            >
              <option value="">All Departments</option>
              {departments.map((dept: any) => (
                <option key={dept.id} value={dept.id}>{dept.name}</option>
              ))}
            </select>

            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
            >
              <option value="">All Status</option>
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="late">Late</option>
              <option value="excused">Excused</option>
              <option value="on_leave">On Leave</option>
            </select>
          </div>
        </div>

        {/* Attendance Table */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg overflow-hidden">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-gray-500 dark:text-gray-400">Loading attendance...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-slate-700 border-b border-gray-200 dark:border-gray-600">
                  <tr>
                    <th className="px-6 py-4 text-left">
                      <input
                        type="checkbox"
                        checked={selectedStaff.length === filteredRecords.length && filteredRecords.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedStaff(filteredRecords.map((r: any) => r.staff_id));
                          } else {
                            setSelectedStaff([]);
                          }
                        }}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Staff
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Department
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Time In
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Time Out
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                  <AnimatePresence>
                    {filteredRecords.map((record: any, index: number) => (
                      <motion.tr
                        key={record.staff_id || index}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ delay: index * 0.02 }}
                        className="hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <input
                            type="checkbox"
                            checked={selectedStaff.includes(record.staff_id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedStaff(prev => [...prev, record.staff_id]);
                              } else {
                                setSelectedStaff(prev => prev.filter(id => id !== record.staff_id));
                              }
                            }}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                              {record.first_name?.charAt(0)}{record.last_name?.charAt(0)}
                            </div>
                            <div>
                              <div className="font-medium text-gray-900 dark:text-white">
                                {record.first_name} {record.last_name}
                              </div>
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                {record.staff_no} • {record.position}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-900 dark:text-white">
                            {record.department_name || 'Unassigned'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(record.status || 'not_marked')}`}>
                            {record.status ? record.status.replace('_', ' ').toUpperCase() : 'NOT MARKED'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-900 dark:text-white">
                            {record.time_in || '-'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-900 dark:text-white">
                            {record.time_out || '-'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => updateAttendance(record.staff_id, 'present')}
                              className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                              title="Mark Present"
                            >
                              <UserCheck className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => updateAttendance(record.staff_id, 'absent')}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Mark Absent"
                            >
                              <UserX className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>

              {filteredRecords.length === 0 && (
                <div className="text-center py-12">
                  <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">No attendance records found</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bulk Action Modal */}
        <AnimatePresence>
          {showBulkModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl"
              >
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Bulk Action for {selectedStaff.length} Staff
                </h3>
                
                <div className="space-y-4">
                  <select
                    value={bulkAction}
                    onChange={(e) => setBulkAction(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  >
                    <option value="">Select Action</option>
                    <option value="present">Mark Present</option>
                    <option value="absent">Mark Absent</option>
                    <option value="late">Mark Late</option>
                    <option value="excused">Mark Excused</option>
                    <option value="on_leave">Mark On Leave</option>
                  </select>
                  
                  <div className="flex items-center justify-end gap-3">
                    <button
                      onClick={() => setShowBulkModal(false)}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleBulkAction}
                      disabled={!bulkAction}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default StaffAttendancePage;
