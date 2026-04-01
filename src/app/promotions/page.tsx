"use client";

import React, { useState, useEffect, useMemo } from 'react';
import {
  Check,
  AlertCircle,
  Loader,
  Search,
  TrendingUp,
  Clock,
  RefreshCw,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import useSWR from 'swr';
import { showToast } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000/api';

interface Student {
  id: number;
  admission_no: string;
  first_name: string;
  last_name: string;
  other_name?: string;
  full_name: string;
  class_id: number;
  class_name: string;
  class_level?: number;
  promotion_status: 'promoted' | 'not_promoted' | 'demoted' | 'dropped_out' | 'completed' | 'pending';
  total_marks?: number;
  average_marks?: number;
  academic_year_id?: number;
  academic_year_name?: string;
  term_promoted_in?: string;
  last_promoted_at?: string;
}

interface FilterState {
  searchTerm: string;
  statusFilter: string;
  academicYearId: string;
  classId: string;
}

interface PreviewData {
  eligible_students: any[];
  ineligible_students: any[];
  summary: any;
}

const statusColors = {
  promoted: { bg: 'bg-green-50', text: 'text-green-700', badge: 'bg-green-100' },
  not_promoted: { bg: 'bg-yellow-50', text: 'text-yellow-700', badge: 'bg-yellow-100' },
  demoted: { bg: 'bg-orange-50', text: 'text-orange-700', badge: 'bg-orange-100' },
  dropped_out: { bg: 'bg-red-50', text: 'text-red-700', badge: 'bg-red-100' },
  completed: { bg: 'bg-blue-50', text: 'text-blue-700', badge: 'bg-blue-100' },
  pending: { bg: 'bg-gray-50', text: 'text-gray-700', badge: 'bg-gray-100' }
};

const getStatusLabel = (status: string) => {
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const PAGE_SIZES = [10, 20, 50, 100];

const PromotionsPage: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [academicYearId, setAcademicYearId] = useState<string>('');
  const [classFilter, setClassFilter] = useState<string>('');
  const [filters, setFilters] = useState<FilterState>({
    searchTerm: '',
    classId: '',
    statusFilter: 'all'
  });
  const [selectedStudents, setSelectedStudents] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [criteria, setCriteria] = useState<PromotionCriteria>({
    minimum_total_marks: 0,
    minimum_average_marks: 0
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Fetch academic years
  const { data: yearsData } = useSWR(`${API_BASE}/academic_years`, {
    revalidateOnFocus: false
  });
  const years = yearsData?.data || [];

  // Fetch classes
  const { data: classesData } = useSWR(`${API_BASE}/classes`, {
    revalidateOnFocus: false
  });
  const classes = classesData?.data || [];

  // Fetch students for promotions - Now works WITHOUT academic year!
  const queryParams = new URLSearchParams();
  if (academicYearId) queryParams.append('academic_year_id', academicYearId);
  if (classFilter) queryParams.append('class_id', classFilter);
  
  const { data: studentsData, isLoading: isFetchingStudents, mutate } = useSWR(
    `${API_BASE}/promotions?${queryParams.toString()}`,
    { 
      revalidateOnFocus: false,
      revalidateOnReconnect: false
    }
  );

  useEffect(() => {
    if (studentsData?.data) {
      setStudents(studentsData.data);
      setCurrentPage(1); // Reset to first page when data changes
    }
  }, [studentsData]);

  // Filter students and calculate pagination
  useEffect(() => {
    let filtered = students.filter(student => {
      const matchesSearch =
        student.first_name.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
        student.last_name.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
        student.admission_no.includes(filters.searchTerm);

      const matchesStatus = filters.statusFilter === 'all' || student.promotion_status === filters.statusFilter;

      return matchesSearch && matchesStatus;
    });

    setFilteredStudents(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  }, [students, filters]);

  // Paginate the filtered results
  const totalPages = Math.ceil(filteredStudents.length / pageSize);
  const paginatedStudents = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredStudents.slice(startIndex, endIndex);
  }, [filteredStudents, currentPage, pageSize]);

  const handlePromoteStudent = async (studentId: number, toClassId: number) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    try {
      await apiFetch(`${API_BASE}/promotions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          from_class_id: student.class_id,
          to_class_id: toClassId,
          from_academic_year_id: academicYearId,
          to_academic_year_id: academicYearId,
          promotion_status: 'promoted',
          promoted_by: 1
        }),
        successMessage: `${student.first_name} ${student.last_name} promoted successfully`,
      });

      const newClass = classes?.find(c => c.id === toClassId);
      const newClassName = newClass?.name || `Class ${toClassId}`;

      setStudents(prev => 
        prev.map(s => 
          s.id === studentId 
            ? { 
                ...s, 
                class_id: toClassId, 
                class_name: newClassName,
                promotion_status: 'promoted' 
              }
            : s
        )
      );
      
      setTimeout(() => {
        mutate();
      }, 500);
      
      setSelectedStudents(new Set());
    } catch (error) {
      // apiFetch already showed error toast
      console.error(error);
    }
  };

  const handleNotPromote = async (studentId: number) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    try {
      await apiFetch(`${API_BASE}/promotions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          from_class_id: student.class_id,
          to_class_id: student.class_id,
          from_academic_year_id: academicYearId,
          to_academic_year_id: academicYearId,
          promotion_status: 'not_promoted',
          promoted_by: 1
        }),
        successMessage: `${student.first_name} ${student.last_name} marked as not promoted`,
      });

      setStudents(prev => 
        prev.map(s => 
          s.id === studentId 
            ? { ...s, promotion_status: 'not_promoted' }
            : s
        )
      );
      
      setTimeout(() => {
        mutate();
      }, 500);
      
      setSelectedStudents(new Set());
    } catch (error) {
      // apiFetch already showed error toast
      console.error(error);
    }
  };

  const handleBulkPromote = async () => {
    if (!academicYearId || !classFilter) {
      showToast('error', 'Please select academic year and class');
      return;
    }

    setBulkProcessing(true);
    try {
      const result = await apiFetch<{ promoted_count: number; not_promoted_count: number }>(`${API_BASE}/promotions/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          academic_year_id: academicYearId,
          from_class_id: classFilter,
          criteria,
          promoted_by: 1
        }),
        successMessage: 'Bulk promotions processed',
      });
      mutate();
    } catch (error) {
      // apiFetch already showed error toast
      console.error(error);
    } finally {
      setBulkProcessing(false);
    }
  };

  const toggleSelectStudent = (studentId: number) => {
    const newSelected = new Set(selectedStudents);
    if (newSelected.has(studentId)) {
      newSelected.delete(studentId);
    } else {
      newSelected.add(studentId);
    }
    setSelectedStudents(newSelected);
  };

  const getNextClass = (currentClassId: number): number | null => {
    const currentClass = classes.find(c => c.id === currentClassId);
    if (!currentClass) return null;

    // Define class progression order (nursery -> primary -> tahfiz)
    const classProgression: { [key: string]: string } = {
      'BABY CLASS': 'MIDDLE CLASS',
      'MIDDLE CLASS': 'TOP CLASS',
      'TOP CLASS': 'PRIMARY ONE',
      'PRIMARY ONE': 'PRIMARY TWO',
      'PRIMARY TWO': 'PRIMARY THREE',
      'PRIMARY THREE': 'PRIMARY FOUR',
      'PRIMARY FOUR': 'PRIMARY FIVE',
      'PRIMARY FIVE': 'PRIMARY SIX',
      'PRIMARY SIX': 'PRIMARY SEVEN',
      'PRIMARY SEVEN': 'TAHFIZ'
    };

    const nextClassName = classProgression[currentClass.name.toUpperCase()];
    if (!nextClassName) return null;

    const nextClass = classes.find(c => c.name.toUpperCase() === nextClassName.toUpperCase());
    return nextClass?.id || null;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'promoted':
        return <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium flex items-center gap-1"><Check className="w-3 h-3" /> Promoted</span>;
      case 'not_promoted':
        return <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-medium flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Not Promoted</span>;
      default:
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-medium flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</span>;
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
          <TrendingUp className="w-8 h-8 text-blue-600" />
          Student Promotions
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">
          Manage student class promotions and track promotion status
        </p>
      </div>

      {/* Controls Section */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 space-y-4">
        {/* Filters Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Academic Year (Optional)
            </label>
            <select
              value={academicYearId}
              onChange={(e) => {
                setAcademicYearId(e.target.value);
                setSelectedStudents(new Set());
              }}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Academic Years</option>
              {years.map(year => (
                <option key={year.id} value={year.id}>
                  {year.name} {year.status === 'active' ? '(Active)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Filter by Class (Optional)
            </label>
            <select
              value={classFilter}
              onChange={(e) => {
                setClassFilter(e.target.value);
                setSelectedStudents(new Set());
              }}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Classes</option>
              {classes.map(cls => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Status Filter
            </label>
            <select
              value={filters.statusFilter}
              onChange={(e) => setFilters({ ...filters, statusFilter: e.target.value as any })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="promoted">Promoted</option>
              <option value="not_promoted">Not Promoted</option>
            </select>
          </div>
        </div>

        {/* Promotion Criteria */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Minimum Total Marks
            </label>
            <input
              type="number"
              value={criteria.minimum_total_marks}
              onChange={(e) => setCriteria({ ...criteria, minimum_total_marks: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              placeholder="0"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Minimum Average Marks
            </label>
            <input
              type="number"
              value={criteria.minimum_average_marks}
              onChange={(e) => setCriteria({ ...criteria, minimum_average_marks: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              placeholder="0"
            />
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or admission number..."
            value={filters.searchTerm}
            onChange={(e) => setFilters({ ...filters, searchTerm: e.target.value })}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleBulkPromote}
            disabled={!classFilter || bulkProcessing || isFetchingStudents}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
          >
            {bulkProcessing ? <Loader className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
            Apply Bulk Promotion
          </button>

          <button
            onClick={() => mutate()}
            disabled={isFetchingStudents}
            className="flex items-center gap-2 px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-900 dark:text-white rounded-lg font-medium transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        {isFetchingStudents ? (
          <div className="flex items-center justify-center py-8">
            <Loader className="w-5 h-5 animate-spin text-blue-600 mr-2" />
            Loading students...
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="text-center py-8 text-slate-600 dark:text-slate-400">
            {students.length === 0 ? (
              <>
                <p className="font-medium mb-1">No students found</p>
                <p className="text-sm">Students will appear here. You can filter by class or search by name.</p>
              </>
            ) : (
              <>
                <p className="font-medium mb-1">No students match your search</p>
                <p className="text-sm">Try adjusting your filters or search term.</p>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-100 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 sticky top-0">
                  <tr>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-slate-900 dark:text-white w-12">
                      <input
                        type="checkbox"
                        checked={selectedStudents.size === paginatedStudents.length && paginatedStudents.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedStudents(new Set(paginatedStudents.map(s => s.id)));
                          } else {
                            setSelectedStudents(new Set());
                          }
                        }}
                        className="w-4 h-4"
                        title="Select all on this page"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-900 dark:text-white">
                      Student Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-900 dark:text-white">
                      Admission No
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-900 dark:text-white">
                      Current Class
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-900 dark:text-white">
                      Total Marks
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-900 dark:text-white">
                      Average
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-slate-900 dark:text-white">
                      Status
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-slate-900 dark:text-white">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {paginatedStudents.map(student => {
                    const nextClassId = getNextClass(student.class_id);
                    const nextClass = classes.find(c => c.id === nextClassId);

                    return (
                      <tr key={student.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                        <td className="px-6 py-4 text-center">
                          <input
                            type="checkbox"
                            checked={selectedStudents.has(student.id)}
                            onChange={() => toggleSelectStudent(student.id)}
                            className="w-4 h-4"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-900 dark:text-white">
                            {student.first_name} {student.last_name}
                          </div>
                          {student.other_name && (
                            <div className="text-xs text-slate-500">{student.other_name}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                          {student.admission_no}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                          {student.class_name}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-medium text-slate-900 dark:text-white">
                          {student.total_marks !== undefined ? student.total_marks.toFixed(2) : '-'}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-medium text-slate-900 dark:text-white">
                          {student.average_marks !== undefined ? student.average_marks.toFixed(2) : '-'}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {getStatusBadge(student.promotion_status)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            {student.promotion_status === 'pending' && nextClass && (
                              <>
                                <button
                                  onClick={() => handlePromoteStudent(student.id, nextClassId!)}
                                  className="px-2 py-1 bg-green-100 hover:bg-green-200 text-green-700 rounded text-xs font-medium transition-colors"
                                  title={`Promote to ${nextClass.name}`}
                                >
                                  Promote
                                </button>
                                <button
                                  onClick={() => handleNotPromote(student.id)}
                                  className="px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs font-medium transition-colors"
                                >
                                  Not Promote
                                </button>
                              </>
                            )}
                            {student.promotion_status !== 'pending' && (
                              <span className="text-xs text-slate-500">
                                {student.promotion_status === 'promoted' ? 'Promoted' : 'Not Promoted'}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="bg-slate-50 dark:bg-slate-700/50 px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="text-sm text-slate-600 dark:text-slate-400">
                Page <span className="font-semibold">{currentPage}</span> of <span className="font-semibold">{totalPages}</span> 
                ({paginatedStudents.length} of {filteredStudents.length} students)
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-slate-600 dark:text-slate-400">Per page:</label>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(parseInt(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="px-3 py-1 text-sm rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                  >
                    {PAGE_SIZES.map(size => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  {/* Page number buttons */}
                  <div className="flex gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(pageNum => 
                        pageNum === 1 || 
                        pageNum === totalPages || 
                        (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
                      )
                      .map((pageNum, idx, arr) => {
                        // Add ellipsis if there's a gap
                        if (idx > 0 && arr[idx - 1] !== pageNum - 1) {
                          return (
                            <span key={`ellipsis-${pageNum}`} className="px-1 text-slate-400">
                              ...
                            </span>
                          );
                        }
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`px-3 py-1 text-sm rounded transition-colors ${
                              currentPage === pageNum
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-200 dark:bg-slate-600 text-slate-900 dark:text-white hover:bg-slate-300 dark:hover:bg-slate-500'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                  </div>

                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Summary Footer */}
            <div className="bg-white dark:bg-slate-800 px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex flex-col md:flex-row gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                <span className="text-slate-600 dark:text-slate-400">
                  Promoted: <span className="font-semibold">{students.filter(s => s.promotion_status === 'promoted').length}</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                <span className="text-slate-600 dark:text-slate-400">
                  Not Promoted: <span className="font-semibold">{students.filter(s => s.promotion_status === 'not_promoted').length}</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-yellow-500 rounded-full"></span>
                <span className="text-slate-600 dark:text-slate-400">
                  Pending: <span className="font-semibold">{students.filter(s => s.promotion_status === 'pending').length}</span>
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PromotionsPage;
