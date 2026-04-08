"use client";
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Building, 
  Users, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  UserCog,
  DollarSign,
  Clipboard,
  MoreVertical,
  Filter
} from 'lucide-react';
import useSWR from 'swr';
import { apiFetch } from '@/lib/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { showToast, confirmAction } from '@/lib/toast';
import NewBadge from '@/components/ui/NewBadge';

interface Department {
  id: number;
  name: string;
  description?: string;
  head_staff_id?: number;
  budget: number;
  staff_count: number;
  head_first_name?: string;
  head_last_name?: string;
  head_staff_no?: string;
  created_at: string;
}

const DepartmentsPage: React.FC = () => {
  const { user } = useAuth();
  const schoolId = user?.schoolId ?? 0;
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Fetch departments
  const { data: departmentsData, isLoading, mutate } = useSWR(
    `/api/departments?school_id=${schoolId}`,
    { refreshInterval: 30000 }
  );

  const departments: Department[] = departmentsData?.data || [];

  // Filter departments based on search
  const filteredDepartments = departments.filter(dept =>
    !searchQuery || 
    dept.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (dept.description && dept.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleEdit = (department: Department) => {
    setSelectedDepartment(department);
    setShowEditModal(true);
  };

  const handleDelete = async (department: Department) => {
    const confirmed = await confirmAction('Delete Department', `Are you sure you want to delete ${department.name}?`, 'Yes, delete');
    if (!confirmed) return;

    try {
      await apiFetch('/api/departments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: department.id })
      });
      mutate();
    } catch (error) {
      // apiFetch already showed toast
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                🏢 Departments
              </h1>
              <NewBadge size="sm" animated />
            </div>
            <p className="text-gray-600 dark:text-gray-400">
              {filteredDepartments.length} departments
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all duration-200"
          >
            <Plus className="w-5 h-5" />
            Add Department
          </button>
        </div>

        {/* Search and Filters */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search departments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
            />
          </div>
        </div>

        {/* Departments Grid */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-gray-500 dark:text-gray-400">Loading departments...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence>
              {filteredDepartments.map((department, index) => (
                <motion.div
                  key={department.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                        <Building className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {department.name}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          ID: {department.id}
                        </p>
                      </div>
                    </div>
                    
                    <div className="relative group">
                      <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                        <div className="p-2">
                          <button
                            onClick={() => handleEdit(department)}
                            className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md flex items-center gap-2"
                          >
                            <Edit className="w-4 h-4" />
                            Edit Department
                          </button>
                          <button
                            onClick={() => handleDelete(department)}
                            className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md flex items-center gap-2"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  {department.description && (
                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-2">
                      {department.description}
                    </p>
                  )}

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                        {department.staff_count}
                      </div>
                      <div className="text-xs text-blue-600 dark:text-blue-400">Staff</div>
                    </div>
                    <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <div className="text-lg font-bold text-green-600 dark:text-green-400">
                        ${department.budget.toLocaleString()}
                      </div>
                      <div className="text-xs text-green-600 dark:text-green-400">Budget</div>
                    </div>
                    <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                      <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                        {department.head_staff_id ? '✓' : '—'}
                      </div>
                      <div className="text-xs text-purple-600 dark:text-purple-400">Head</div>
                    </div>
                  </div>

                  {/* Department Head */}
                  {department.head_first_name && (
                    <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                      <UserCog className="w-4 h-4 text-gray-500" />
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {department.head_first_name} {department.head_last_name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Department Head • {department.head_staff_no}
                        </p>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {filteredDepartments.length === 0 && (
              <div className="col-span-full text-center py-12">
                <Building className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">No departments found</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DepartmentsPage;