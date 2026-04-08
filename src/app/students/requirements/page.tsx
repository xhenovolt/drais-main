"use client";
import React, { useState, useMemo } from 'react';
import { Search, Filter, CheckSquare, Plus, Settings, Eye, School } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import useSWR from 'swr';
import { fetcher } from '@/utils/fetcher';
import { toast } from 'react-hot-toast';
import AddRequirementModal from '@/components/students/AddRequirementModal';
import ClassRequirementsManager from '@/components/students/ClassRequirementsManager';

const RequirementsPage: React.FC = () => {
  const { user } = useAuth();
  const schoolId = user?.schoolId ?? 0;
  const [searchQuery, setSearchQuery] = useState('');
  const [termFilter, setTermFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showClassManager, setShowClassManager] = useState(false);

  // Fetch requirements data
  const { data: requirementsData, isLoading, mutate } = useSWR(
    `/api/students/requirements?school_id=${schoolId}${termFilter ? `&term_id=${termFilter}` : ''}${classFilter ? `&class_id=${classFilter}` : ''}`,
    fetcher,
    { refreshInterval: 30000 }
  );

  // Fetch terms and classes for filters
  const { data: termsData } = useSWR(`/api/terms?school_id=${schoolId}`, fetcher);
  const { data: classesData } = useSWR(`/api/classes?school_id=${schoolId}`, fetcher);

  // Fetch class-level requirements
  const { data: classRequirementsData } = useSWR(
    `/api/requirements/class?school_id=${schoolId}${classFilter ? `&class_id=${classFilter}` : ''}${termFilter ? `&term_id=${termFilter}` : ''}`,
    fetcher
  );

  const requirements = requirementsData?.data || [];
  const terms = termsData?.data || [];
  const classes = classesData?.data || [];
  const classRequirements = classRequirementsData?.data || [];

  // Debounced search function
  const filteredRequirements = useMemo(() => {
    return requirements.filter((req: any) => {
      const fullName = `${req.first_name} ${req.last_name}`.toLowerCase();
      const matchesSearch = !searchQuery || 
        fullName.includes(searchQuery.toLowerCase()) ||
        req.requirement_name.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = !statusFilter || 
        (statusFilter === 'brought' && req.brought) ||
        (statusFilter === 'not_brought' && !req.brought);
      
      return matchesSearch && matchesStatus;
    });
  }, [requirements, searchQuery, statusFilter]);

  const handleStatusUpdate = async (requirementId: number, brought: boolean) => {
    try {
      const response = await fetch('/api/students/requirements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: requirementId,
          brought
        })
      });

      if (response.ok) {
        toast.success('Requirement status updated');
        mutate();
      } else {
        toast.error('Failed to update requirement');
      }
    } catch (error) {
      toast.error('An error occurred');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              📋 Student Requirements
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {filteredRequirements.length} requirement records • {classRequirements.length} class requirements
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowClassManager(true)}
              className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-lg hover:shadow-lg transition-all duration-200"
            >
              <Settings className="w-5 h-5" />
              Manage Class Requirements
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all duration-200"
            >
              <Plus className="w-5 h-5" />
              Add Individual Requirement
            </button>
          </div>
        </div>

        {/* Enhanced Filters */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg mb-8">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search students or requirements..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
              />
            </div>

            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
            >
              <option value="">All Classes</option>
              {classes.map((cls: any) => (
                <option key={cls.id} value={cls.id}>{cls.name}</option>
              ))}
            </select>

            <select
              value={termFilter}
              onChange={(e) => setTermFilter(e.target.value)}
              className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
            >
              <option value="">All Terms</option>
              {terms.map((term: any) => (
                <option key={term.id} value={term.id}>{term.name}</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
            >
              <option value="">All Status</option>
              <option value="brought">Brought</option>
              <option value="not_brought">Not Brought</option>
            </select>

            <button
              onClick={() => {
                setSearchQuery('');
                setTermFilter('');
                setClassFilter('');
                setStatusFilter('');
              }}
              className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* Class Requirements Summary */}
        {classRequirements.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Class Requirements Overview
              </h3>
              <button
                onClick={() => setShowClassManager(true)}
                className="flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm"
              >
                <Settings className="w-4 h-4" />
                Manage
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {classRequirements.slice(0, 6).map((req: any, index: number) => (
                <motion.div
                  key={req.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <School className="w-4 h-4 text-blue-600" />
                    <span className="font-medium text-blue-900 dark:text-blue-100 text-sm">
                      {req.class_name} • {req.term_name}
                    </span>
                  </div>
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    {req.requirement_item}
                  </h4>
                  {req.quantity && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Quantity: {req.quantity}
                    </p>
                  )}
                  {req.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {req.description}
                    </p>
                  )}
                  <div className="mt-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      req.is_mandatory 
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300'
                    }`}>
                      {req.is_mandatory ? 'Mandatory' : 'Optional'}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
            {classRequirements.length > 6 && (
              <div className="mt-4 text-center">
                <button
                  onClick={() => setShowClassManager(true)}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  View all {classRequirements.length} class requirements →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Individual Requirements Table */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Individual Student Requirements
            </h3>
          </div>

          {isLoading ? (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-gray-500 dark:text-gray-400">Loading requirements...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-slate-700 border-b border-gray-200 dark:border-gray-600">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Student
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Class
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Term
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Requirement
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Date Reported
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                  <AnimatePresence>
                    {filteredRequirements.map((req: any, index: number) => (
                      <motion.tr
                        key={req.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ delay: index * 0.05 }}
                        className="hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                              {req.first_name?.charAt(0)}{req.last_name?.charAt(0)}
                            </div>
                            <div>
                              <div className="font-medium text-gray-900 dark:text-white">
                                {req.first_name} {req.last_name}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-900 dark:text-white">
                            {req.class_name || 'Not Assigned'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-900 dark:text-white">
                            {req.term_name}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {req.requirement_name}
                            </div>
                            {req.requirement_description && (
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                {req.requirement_description}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => handleStatusUpdate(req.id, !req.brought)}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                              req.brought
                                ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300'
                                : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300'
                            }`}
                          >
                            {req.brought ? 'Brought ✓' : 'Not Brought ✗'}
                          </button>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-900 dark:text-white">
                            {req.date_reported || 'Not reported'}
                          </span>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>

              {filteredRequirements.length === 0 && (
                <div className="text-center py-12">
                  <CheckSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">No individual requirements found</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <AddRequirementModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          setShowAddModal(false);
          mutate();
        }}
      />

      <ClassRequirementsManager
        open={showClassManager}
        onClose={() => setShowClassManager(false)}
        onSuccess={() => {
          setShowClassManager(false);
          mutate();
        }}
      />
    </div>
  );
};

export default RequirementsPage;
