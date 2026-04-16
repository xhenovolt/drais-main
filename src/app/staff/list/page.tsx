"use client";
import React, { useState, useEffect } from 'react';
import { Search, Filter, Plus, Users, Mail, Phone, Edit, Trash2, MoreVertical, Loader2, Wifi, Fingerprint } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiClient';
import Link from 'next/link';
import { showToast, confirmAction } from '@/lib/toast';
import AddStaffModal from '@/components/staff/AddStaffModal';
import SyncDeviceModal from '@/components/device/SyncDeviceModal';
import StaffBiometricModal from '@/components/staff/StaffBiometricModal';

const StaffListPage: React.FC = () => {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showBiometricModal, setShowBiometricModal] = useState(false);
  const [selectedStaffForBiometric, setSelectedStaffForBiometric] = useState<any>(null);

  // Device ID editing state
  const [deviceIdEditingCell, setDeviceIdEditingCell] = useState<{staffId: number} | null>(null);
  const [deviceIdValue, setDeviceIdValue] = useState('');
  const [isUpdatingDeviceId, setIsUpdatingDeviceId] = useState(false);

  // Fetch staff data using the corrected API endpoint
  const { data: staffData, isLoading, error: staffError, mutate } = useSWR(
    `/api/staff/full`,
    { refreshInterval: 30000 }
  );

  // Fetch departments for filter
  const { data: departmentsData } = useSWR(
    `/api/departments/list`
  );

  const allStaff = staffData?.data || [];
  const departments = departmentsData?.data || [];

  // Filter staff on the client side
  const staff = allStaff.filter((member: any) => {
    const fullName = `${member.first_name} ${member.last_name} ${member.other_name || ''}`.toLowerCase();
    const matchesSearch = !searchQuery || fullName.includes(searchQuery.toLowerCase()) || 
                         (member.staff_no && member.staff_no.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = !statusFilter || member.status === statusFilter;
    const matchesDepartment = !departmentFilter || member.department_id === parseInt(departmentFilter);
    
    return matchesSearch && matchesStatus && matchesDepartment;
  });

  const handleViewDetails = (staffMember: any) => {
    router.push(`/staff/${staffMember.id}`);
  };

  const handleStatusChange = async (staffId: number, newStatus: string) => {
    try {
      await apiFetch(`/api/staff/${staffId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      mutate();
    } catch (error) {
      // apiFetch already showed toast
    }
  };

  const handleDeleteStaff = async (staffId: number, staffName: string) => {
    const confirmed = await confirmAction('Delete Staff Member', `Are you sure you want to delete ${staffName}? This action cannot be undone.`, 'Yes, delete');
    if (!confirmed) return;

    try {
      await apiFetch(`/api/staff/${staffId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
      mutate();
    } catch (error) {
      // apiFetch already showed toast
    }
  };

  // Device ID editing functions
  const startDeviceIdEdit = (staffId: number, currentValue: number) => {
    if (isUpdatingDeviceId || deviceIdEditingCell) return;
    setDeviceIdEditingCell({ staffId });
    setDeviceIdValue(currentValue.toString());
  };

  const cancelDeviceIdEdit = () => {
    setDeviceIdEditingCell(null);
    setDeviceIdValue('');
  };

  const saveDeviceIdCallback = async () => {
    if (!deviceIdEditingCell || isUpdatingDeviceId) return;

    const staffMember = staff.find(s => s.id === deviceIdEditingCell.staffId);
    if (!staffMember) return;

    const newDeviceId = parseInt(deviceIdValue) || 0;
    if (newDeviceId === (staffMember.device_user_id || 0)) {
      cancelDeviceIdEdit();
      return;
    }

    setIsUpdatingDeviceId(true);

    try {
      if (newDeviceId === 0) {
        // Delete device mapping
        if (staffMember.device_mapping_id) {
          await apiFetch(`/api/device-mappings/${staffMember.device_mapping_id}`, {
            method: 'DELETE'
          });
        }
      } else {
        // Update or create device mapping
        if (staffMember.device_mapping_id) {
          await apiFetch(`/api/device-mappings/${staffMember.device_mapping_id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              device_user_id: newDeviceId,
              status: 'active'
            })
          });
        } else {
          await apiFetch(`/api/device-mappings/by-device`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              staff_id: staffMember.id,
              device_user_id: newDeviceId
            })
          });
        }
      }

      mutate();
      cancelDeviceIdEdit();
    } catch (error: any) {
      console.error('Device ID update error:', error);
      setDeviceIdValue(staffMember.device_user_id?.toString() || '');
    } finally {
      setIsUpdatingDeviceId(false);
    }
  };

  const handleDeviceIdKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveDeviceIdCallback();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelDeviceIdEdit();
    }
  };

  // Effect to handle clicking outside of device ID editing input
  useEffect(() => {
    if (!deviceIdEditingCell || isUpdatingDeviceId) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('input[type="number"]') && !target.closest('.device-id-edit-container')) {
        saveDeviceIdCallback();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [deviceIdEditingCell?.staffId, isUpdatingDeviceId]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              👥 Staff List
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {staff.length} staff members
            </p>
          </div>
          <button
            onClick={() => setShowSyncModal(true)}
            className="btn-secondary flex items-center gap-2 border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg px-4 py-3 transition-colors"
            title="Sync users &amp; fingerprints from ZKTeco device"
          >
            <Wifi className="w-5 h-5" />
            Sync Device
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg px-6 py-3 flex items-center gap-2 shadow-lg hover:shadow-xl transition-all duration-200"
          >
            <Plus className="w-5 h-5" />
            Add Staff
          </button>
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

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>

            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
            >
              <option value="">All Departments</option>
              {departments.map((dept: any) => (
                <option key={dept.id} value={dept.id}>{dept.name}</option>
              ))}
            </select>

            <button
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('');
                setDepartmentFilter('');
              }}
              className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* Staff Table */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg overflow-hidden">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-gray-500 dark:text-gray-400">Loading staff...</p>
            </div>
          ) : staffError ? (
            <div className="text-center py-12">
              <p className="text-red-500 text-lg font-medium mb-2">Failed to load staff data</p>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">Check your connection and try again</p>
              <button onClick={() => mutate()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Retry</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-slate-700 border-b border-gray-200 dark:border-gray-600">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Staff Member
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Position
                    </th>
                    <th className="hidden md:table-cell px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="hidden lg:table-cell px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Performance
                    </th>
                    <th className="hidden sm:table-cell px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Device ID
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                  <AnimatePresence>
                    {staff.map((member: any, index: number) => (
                      <motion.tr
                        key={member.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ delay: index * 0.05 }}
                        className="hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                        onClick={() => handleViewDetails(member)}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                              {member.first_name?.charAt(0)}{member.last_name?.charAt(0)}
                            </div>
                            <div>
                              <div className="font-medium text-gray-900 dark:text-white">
                                {member.first_name} {member.last_name}
                              </div>
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                {member.staff_no}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900 dark:text-white">
                            {member.position}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {member.department_name || 'No Department'}
                          </div>
                        </td>
                        <td className="hidden md:table-cell px-6 py-4">
                          <div className="space-y-1">
                            {member.email && (
                              <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                                <Mail className="w-3 h-3" />
                                {member.email}
                              </div>
                            )}
                            {member.phone && (
                              <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                                <Phone className="w-3 h-3" />
                                {member.phone}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="hidden lg:table-cell px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-20 bg-gray-200 dark:bg-slate-600 rounded-full h-2">
                              <div
                                className="bg-gradient-to-r from-green-500 to-blue-500 h-2 rounded-full"
                                style={{ width: `${(member.performance_rating || 0) * 20}%` }}
                              />
                            </div>
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              {member.performance_rating || 0}/5
                            </span>
                          </div>
                        </td>
                        <td className="hidden sm:table-cell px-6 py-4">
                          <div className="text-sm text-gray-900 dark:text-white">
                            {deviceIdEditingCell?.staffId === member.id ? (
                              <div className="flex items-center gap-2 device-id-edit-container">
                                <input
                                  type="number"
                                  value={deviceIdValue}
                                  onChange={(e) => setDeviceIdValue(e.target.value)}
                                  onBlur={saveDeviceIdCallback}
                                  onKeyDown={handleDeviceIdKeyDown}
                                  autoFocus
                                  disabled={isUpdatingDeviceId}
                                  className="border-2 border-blue-300 dark:border-blue-600 rounded px-2 py-1 text-sm w-24 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500"
                                  placeholder="Device ID"
                                />
                                {isUpdatingDeviceId && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                              </div>
                            ) : (
                              <>
                                {member.device_user_id ? (
                                  <div className="flex items-center gap-2">
                                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                      ID: {member.device_user_id}
                                    </span>
                                    <button
                                      onClick={() => startDeviceIdEdit(member.id, member.device_user_id || 0)}
                                      className="p-1 text-gray-400 hover:text-blue-600 rounded transition-colors"
                                      title="Edit Device ID"
                                    >
                                      <Edit className="w-3 h-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => startDeviceIdEdit(member.id, 0)}
                                    className="text-xs text-gray-400 hover:text-blue-600 hover:underline transition-colors"
                                  >
                                    + Assign Device ID
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                          {member.device_name && !deviceIdEditingCell?.staffId && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {member.device_name}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            member.status === 'active' 
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                              : member.status === 'inactive'
                              ? 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                          }`}>
                            {member.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedStaffForBiometric(member);
                                setShowBiometricModal(true);
                              }}
                              className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors whitespace-nowrap text-xs sm:text-base"
                              title="Enroll Biometric"
                            >
                              <Fingerprint className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewDetails(member);
                              }}
                              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors whitespace-nowrap text-xs sm:text-base"
                              title="Edit"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteStaff(member.id, `${member.first_name} ${member.last_name}`);
                              }}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors whitespace-nowrap text-xs sm:text-base"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>

              {staff.length === 0 && (
                <div className="text-center py-12">
                  <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">No staff members found</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Staff Modal */}
      <AddStaffModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          setShowAddModal(false);
          mutate();
        }}
      />

      {/* Sync from Device Modal */}
      <SyncDeviceModal
        open={showSyncModal}
        onClose={() => setShowSyncModal(false)}
      />

      {/* Staff Biometric Modal */}
      {selectedStaffForBiometric && (
        <StaffBiometricModal
          isOpen={showBiometricModal}
          onClose={() => {
            setShowBiometricModal(false);
            setSelectedStaffForBiometric(null);
          }}
          staffId={selectedStaffForBiometric.id}
          staffName={`${selectedStaffForBiometric.first_name} ${selectedStaffForBiometric.last_name}`}
          onSuccess={() => {
            mutate();
          }}
        />
      )}
    </div>
  );
};

export default StaffListPage;