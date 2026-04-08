"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  Search, 
  Filter, 
  Download,
  Eye,
  DollarSign,
  CheckCircle,
  Clock,
  AlertCircle,
  XCircle,
  ChevronDown,
  X,
  RefreshCw
} from 'lucide-react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/apiClient';
import { toast } from 'react-hot-toast';
import Pagination from '@/components/ui/Pagination';

interface LearnerFees {
  student_id: number;
  admission_no: string;
  full_name: string;
  class_id: number;
  class_name: string;
  stream_id: number;
  stream_name: string;
  total_expected?: number;
  total_paid: number;
  total_waived: number;
  total_discount: number;
  balance: number;
  status: 'Cleared' | 'Partially Paid' | 'Unpaid' | 'Undefined';
  fee_items_count: number;
  has_fee_definition: boolean;
}

interface Meta {
  total_learners: number;
  total_expected: number;
  total_paid: number;
  total_balance: number;
  cleared_count: number;
  partially_paid_count: number;
  unpaid_count: number;
  undefined_count: number;
}

const LearnersFeesPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [termFilter, setTermFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedLearner, setSelectedLearner] = useState<LearnerFees | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [page, setPage] = useState(1);
  const rowsPerPage = 20;

  // Fetch learners fees data
  const { data, isLoading, mutate, error } = useSWR<{ data: LearnerFees[], meta: Meta }>(
    `/api/finance/learners-fees?${classFilter ? `class_id=${classFilter}` : ''}${sectionFilter ? `&section_id=${sectionFilter}` : ''}${statusFilter ? `&status=${statusFilter}` : ''}${termFilter ? `&term_id=${termFilter}` : ''}${yearFilter ? `&year=${yearFilter}` : ''}${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ''}`,
    swrFetcher,
    { refreshInterval: 60000 }
  );

  // Fetch classes for filter
  const { data: classesData } = useSWR('/api/classes', swrFetcher);
  const classes = (classesData as any)?.data || [];

  // Fetch streams for filter
  const { data: streamsData } = useSWR('/api/streams', swrFetcher);
  const streams = (streamsData as any)?.data || [];

  // Fetch terms for filter
  const { data: termsData } = useSWR('/api/terms', swrFetcher);
  const terms = (termsData as any)?.data || [];

  // Filter and paginate learners
  const learners = data?.data || [];
  const meta = data?.meta;

  const totalPages = Math.ceil((learners.length || 0) / rowsPerPage);
  const paginatedLearners = learners.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage
  );

  const handleViewDetails = (learner: LearnerFees) => {
    setSelectedLearner(learner);
    setShowDetailsModal(true);
  };

  const handleExport = () => {
    // Create CSV export
    const headers = ['Admission No', 'Name', 'Class', 'Expected', 'Paid', 'Balance', 'Status'];
    const rows = learners.map(l => [
      l.admission_no,
      l.full_name,
      l.class_name,
      l.total_expected?.toString() || 'Undefined',
      l.total_paid.toString(),
      l.balance.toString(),
      l.status
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `learners-fees-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Exported successfully');
  };

  const clearFilters = () => {
    setSearchQuery('');
    setClassFilter('');
    setSectionFilter('');
    setStatusFilter('');
    setTermFilter('');
    setYearFilter('');
    setPage(1);
  };

  const hasActiveFilters = searchQuery || classFilter || sectionFilter || statusFilter || termFilter || yearFilter;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Cleared':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'Partially Paid':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'Unpaid':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      case 'Undefined':
        return 'bg-gray-100 text-gray-700 dark:bg-gray-700/50 dark:text-gray-400';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Cleared':
        return <CheckCircle className="w-4 h-4" />;
      case 'Partially Paid':
        return <Clock className="w-4 h-4" />;
      case 'Unpaid':
        return <AlertCircle className="w-4 h-4" />;
      case 'Undefined':
        return <XCircle className="w-4 h-4" />;
      default:
        return <DollarSign className="w-4 h-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              👥 Learner Fees Overview
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              {meta?.total_learners || 0} learners • 
              <span className="text-green-600 ml-2">UGX {(meta?.total_paid || 0).toLocaleString()} collected</span>
              <span className="mx-2">•</span>
              <span className="text-red-600">UGX {(meta?.total_balance || 0).toLocaleString()} outstanding</span>
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            <button
              onClick={() => mutate()}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total Learners</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{meta?.total_learners || 0}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Cleared</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{meta?.cleared_count || 0}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Partial</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{meta?.partially_paid_count || 0}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Unpaid</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{meta?.unpaid_count || 0}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Undefined</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{meta?.undefined_count || 0}</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Search and Filters */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg mb-6">
          <div className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name or admission number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                />
              </div>

              {/* Filter Toggle */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-2.5 border rounded-lg transition-colors ${
                  hasActiveFilters 
                    ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 text-blue-600' 
                    : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-slate-700'
                }`}
              >
                <Filter className="w-4 h-4" />
                Filters
                {hasActiveFilters && (
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                )}
                <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              </button>

              {/* Clear Filters */}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <X className="w-4 h-4" />
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Expandable Filters */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-t border-gray-200 dark:border-gray-700 overflow-hidden"
              >
                <div className="p-4 grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <select
                    value={classFilter}
                    onChange={(e) => setClassFilter(e.target.value)}
                    className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  >
                    <option value="">All Classes</option>
                    {classes.map((cls: any) => (
                      <option key={cls.id} value={cls.id}>{cls.name}</option>
                    ))}
                  </select>

                  <select
                    value={sectionFilter}
                    onChange={(e) => setSectionFilter(e.target.value)}
                    className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  >
                    <option value="">All Sections</option>
                    {streams.map((stream: any) => (
                      <option key={stream.id} value={stream.id}>{stream.name}</option>
                    ))}
                  </select>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  >
                    <option value="">All Status</option>
                    <option value="Cleared">Cleared</option>
                    <option value="Partially Paid">Partially Paid</option>
                    <option value="Unpaid">Unpaid</option>
                    <option value="Undefined">Undefined</option>
                  </select>

                  <select
                    value={termFilter}
                    onChange={(e) => setTermFilter(e.target.value)}
                    className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  >
                    <option value="">All Terms</option>
                    {terms.map((term: any) => (
                      <option key={term.id} value={term.id}>{term.name}</option>
                    ))}
                  </select>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Learners Table */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-gray-500 dark:text-gray-400">Loading learners fees...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">Failed to load data</p>
                <button
                  onClick={() => mutate()}
                  className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  Try Again
                </button>
              </div>
            </div>
          ) : learners.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">No learners found</p>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="mt-4 px-4 py-2 text-blue-500 hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead className="bg-gray-50 dark:bg-slate-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Learner
                      </th>
                      <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Class
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Expected
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Paid
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Balance
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {paginatedLearners.map((learner, index) => (
                      <motion.tr
                        key={learner.student_id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                        className="hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {learner.full_name}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {learner.admission_no}
                            </div>
                          </div>
                        </td>
                        <td className="hidden sm:table-cell px-6 py-4">
                          <div className="text-sm text-gray-900 dark:text-white">
                            {learner.class_name}
                          </div>
                          {learner.stream_name && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {learner.stream_name}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {learner.total_expected 
                              ? `UGX ${learner.total_expected.toLocaleString()}` 
                              : <span className="text-gray-400 italic">Undefined</span>
                            }
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-green-600 dark:text-green-400 font-medium">
                            UGX {learner.total_paid.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`text-sm font-medium ${
                            learner.balance > 0 
                              ? 'text-red-600 dark:text-red-400' 
                              : 'text-green-600 dark:text-green-400'
                          }`}>
                            UGX {learner.balance.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(learner.status)}`}>
                            {getStatusIcon(learner.status)}
                            {learner.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleViewDetails(learner)}
                              title="View fee details"
                              className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                            >
                              <Eye className="w-4 h-4" />
                              <span className="hidden sm:inline">View</span>
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                  <Pagination
                    currentPage={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                    totalItems={learners.length}
                    itemsPerPage={rowsPerPage}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Simple Details Modal */}
      <AnimatePresence>
        {showDetailsModal && selectedLearner && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowDetailsModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Fee Details</h2>
                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Users className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedLearner.full_name}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{selectedLearner.admission_no} • {selectedLearner.class_name}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-4">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Expected Amount</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">
                      {selectedLearner.total_expected ? `UGX ${selectedLearner.total_expected.toLocaleString()}` : 'Undefined'}
                    </p>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                    <p className="text-xs text-green-600 dark:text-green-400">Amount Paid</p>
                    <p className="text-xl font-bold text-green-600 dark:text-green-400">
                      UGX {selectedLearner.total_paid.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
                    <p className="text-xs text-yellow-600 dark:text-yellow-400">Waived/Discount</p>
                    <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">
                      UGX {(selectedLearner.total_waived + selectedLearner.total_discount).toLocaleString()}
                    </p>
                  </div>
                  <div className={`rounded-lg p-4 ${selectedLearner.balance > 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-green-50 dark:bg-green-900/20'}`}>
                    <p className={`text-xs ${selectedLearner.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>Balance</p>
                    <p className={`text-xl font-bold ${selectedLearner.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      UGX {selectedLearner.balance.toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(selectedLearner.status)}`}>
                    {getStatusIcon(selectedLearner.status)}
                    {selectedLearner.status}
                  </span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LearnersFeesPage;
