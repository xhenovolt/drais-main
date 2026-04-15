'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Download,
  Filter,
  Plus,
  Edit,
  Eye,
  Trash,
  FileText,
  Sheet,
  Move,
  X,
  Camera,
  Loader,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useExport } from '@/hooks/useExport';
import ReassignClassModal from './ReassignClassModal';
import { BulkPhotoUploadModal } from '@/components/students/BulkPhotoUploadModal';

interface Student {
  id: number;
  person_id?: number;
  admission_no: string;
  first_name: string;
  last_name: string;
  class_name?: string;
  status: string;
  photo_url?: string;
  enrollment_status?: string;
}

interface StudentPageProps {
  enrolledData: Student[];
  admittedData: Student[];
}

export default function StudentsPage({ enrolledData: initialEnrolled = [], admittedData: initialAdmitted = [] }: StudentPageProps) {
  const { exportAsCSV, exportAsExcel, exporting } = useExport();
  const router = useRouter();

  // State Management
  const [tab, setTab] = useState<'enrolled' | 'admitted'>('enrolled');
  const [enrolledData, setEnrolledData] = useState<Student[]>(initialEnrolled);
  const [admittedData] = useState<Student[]>(initialAdmitted);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<Set<number>>(new Set());
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [showPhotoUploadModal, setShowPhotoUploadModal] = useState(false);
  const [isReassigning, setIsReassigning] = useState(false);

  // Filters
  const [filters, setFilters] = useState({
    class: '',
    stream: '',
    studyMode: '',
    program: '',
    gender: '',
    photoStatus: 'all',
  });

  // Get current dataset
  const currentData = tab === 'enrolled' ? enrolledData : admittedData;

  // Filter & Search
  const filteredStudents = useMemo(() => {
    return currentData.filter(student => {
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const fullName = `${student.first_name} ${student.last_name}`.toLowerCase();
        if (!fullName.includes(search) && !student.admission_no.includes(searchTerm)) {
          return false;
        }
      }

      // Apply other filters
      if (filters.class && student.class_name !== filters.class) return false;
      if (filters.gender && student.class_name !== filters.gender) return false;
      if (filters.photoStatus !== 'all') {
        const hasPhoto = !!student.photo_url;
        if (filters.photoStatus === 'with' && !hasPhoto) return false;
        if (filters.photoStatus === 'without' && hasPhoto) return false;
      }

      return true;
    });
  }, [currentData, searchTerm, filters]);

  // Handlers
  const handleSelectAll = useCallback(() => {
    if (selectedStudents.size === filteredStudents.length) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(filteredStudents.map(s => s.id)));
    }
  }, [filteredStudents, selectedStudents.size]);

  const handleToggleStudent = useCallback(
    (studentId: number) => {
      const newSet = new Set(selectedStudents);
      if (newSet.has(studentId)) {
        newSet.delete(studentId);
      } else {
        newSet.add(studentId);
      }
      setSelectedStudents(newSet);
    },
    [selectedStudents]
  );

  const handleExportCSV = useCallback(() => {
    const dataToExport = filteredStudents.map(s => ({
      'Admission No': s.admission_no,
      'First Name': s.first_name,
      'Last Name': s.last_name,
      'Class': s.class_name || '-',
      'Status': tab === 'enrolled' ? s.enrollment_status : s.status,
    }));
    exportAsCSV(dataToExport, `students_${tab}`, ['Admission No', 'First Name', 'Last Name', 'Class', 'Status']);
  }, [filteredStudents, tab, exportAsCSV]);

  const handleExportExcel = useCallback(() => {
    const dataToExport = filteredStudents.map(s => ({
      'Admission No': s.admission_no,
      'First Name': s.first_name,
      'Last Name': s.last_name,
      'Class': s.class_name || '-',
      'Status': tab === 'enrolled' ? s.enrollment_status : s.status,
    }));
    exportAsExcel(dataToExport, `students_${tab}`, ['Admission No', 'First Name', 'Last Name', 'Class', 'Status'], 'Student List');
  }, [filteredStudents, tab, exportAsExcel]);

  const handleReassignClass = useCallback(async (newClassId: number, reason: string) => {
    if (selectedStudents.size === 0) {
      toast.error('Please select students to reassign');
      return;
    }

    setIsReassigning(true);
    try {
      const response = await fetch('/api/students/reassign-class', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_ids: Array.from(selectedStudents),
          new_class_id: newClassId,
          reason: reason || null,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(data.message || `Students reassigned successfully!`);
        // Optimistic update — reflect class change instantly
        const currentIds = new Set(selectedStudents);
        setEnrolledData(prev =>
          prev.map(s =>
            currentIds.has(s.id)
              ? { ...s, class_id: newClassId }
              : s
          )
        );
        setSelectedStudents(new Set());
        setShowReassignModal(false);
        // Silently refresh server data in background
        router.refresh();
      } else {
        // Handle partial success or failure
        if (data.error_code === 'PARTIAL_SUCCESS') {
          toast.error(
            `⚠️ Partial success: ${data.data.success_count} reassigned, ${data.data.failed_count} failed`,
            { duration: 5000 }
          );
        } else if (data.error_code === 'ALL_FAILED') {
          toast.error(
            `❌ ${data.data.failed_count} students could not be reassigned`,
            { duration: 5000 }
          );
        } else {
          toast.error(data.message || 'Failed to reassign students');
        }
      }
    } catch (error) {
      console.error('Error reassigning students:', error);
      toast.error('An error occurred while reassigning students');
    } finally {
      setIsReassigning(false);
    }
  }, [selectedStudents]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20 lg:pb-0">
      {/* HEADER */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Students</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Manage student records</p>
            </div>
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <Plus size={20} />
              <span className="hidden sm:inline">Add Student</span>
            </button>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-16 z-10 lg:static lg:top-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-8">
            <button
              onClick={() => setTab('enrolled')}
              className={`px-4 py-4 font-medium border-b-2 transition-colors ${
                tab === 'enrolled'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Enrolled ({enrolledData.length})
            </button>
            <button
              onClick={() => setTab('admitted')}
              className={`px-4 py-4 font-medium border-b-2 transition-colors ${
                tab === 'admitted'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Admitted ({admittedData.length})
            </button>
          </div>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search by name or admission no..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 flex-wrap lg:flex-nowrap">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <Filter size={20} />
                <span className="hidden sm:inline">Filter</span>
              </button>

              {/* Export Dropdown */}
              <div className="relative group">
                <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <Download size={20} />
                  <span className="hidden sm:inline">Export</span>
                </button>
                <div className="absolute right-0 mt-0 w-48 bg-white dark:bg-gray-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all border border-gray-200 dark:border-gray-600">
                  <button
                    onClick={handleExportCSV}
                    disabled={exporting}
                    className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 flex items-center gap-2"
                  >
                    <FileText size={16} />
                    CSV Export
                  </button>
                  <button
                    onClick={handleExportExcel}
                    disabled={exporting}
                    className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 flex items-center gap-2"
                  >
                    <Sheet size={16} />
                    Excel Export
                  </button>
                </div>
              </div>

              {selectedStudents.size > 0 && (
                <button
                  onClick={() => setSelectedStudents(new Set())}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  <X size={16} />
                  <span>{selectedStudents.size} selected</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {filteredStudents.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">No students found</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedStudents.size === filteredStudents.length}
                      onChange={handleSelectAll}
                      className="rounded"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">Name</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">Admission No</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">Class</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">Status</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                {filteredStudents.map(student => (
                  <tr
                    key={student.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedStudents.has(student.id)}
                        onChange={() => handleToggleStudent(student.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-3">
                        {student.photo_url ? (
                          <img
                            src={student.photo_url}
                            alt={`${student.first_name} ${student.last_name}`}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-xs font-semibold text-blue-700 dark:text-blue-200">
                            {student.first_name?.[0]}{student.last_name?.[0]}
                          </div>
                        )}
                        <div className="font-medium text-gray-900 dark:text-white">
                          {student.first_name} {student.last_name}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{student.admission_no}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{student.class_name || '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      {(() => {
                        const status = (student.enrollment_status || student.status || '').toLowerCase();
                        const badgeColors: Record<string, string> = {
                          enrolled: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200',
                          active: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200',
                          admitted: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200',
                          pending: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-200',
                          suspended: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200',
                          expelled: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200',
                          withdrawn: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
                          graduated: 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-200',
                        };
                        const colors = badgeColors[status] || 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
                        return (
                          <span className={`px-2 py-1 rounded text-xs font-medium ${colors}`}>
                            {student.enrollment_status || student.status}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      <div className="flex justify-end gap-2">
                        <button className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded" title="View">
                          <Eye size={16} />
                        </button>
                        <button className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded" title="Edit">
                          <Edit size={16} />
                        </button>
                        <button className="p-2 text-gray-600 dark:text-gray-400 hover:bg-red-100 dark:hover:bg-red-900 hover:text-red-600 rounded" title="Delete">
                          <Trash size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* FLOATING ACTION BAR */}
      <AnimatePresence>
        {selectedStudents.size > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-2xl shadow-2xl px-6 py-3 flex items-center gap-4">
              <span className="text-sm font-medium whitespace-nowrap">
                {selectedStudents.size} student{selectedStudents.size > 1 ? 's' : ''} selected
              </span>

              <div className="h-6 w-px bg-gray-600 dark:bg-gray-400" />

              <button
                onClick={() => setShowReassignModal(true)}
                disabled={isReassigning}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {isReassigning ? <Loader size={16} className="animate-spin" /> : <Move size={16} />}
                Change Class
              </button>

              <button
                onClick={() => setShowPhotoUploadModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Camera size={16} />
                Upload Photos
              </button>

              <button
                onClick={() => setSelectedStudents(new Set())}
                className="p-2 hover:bg-gray-700 dark:hover:bg-gray-300 rounded-lg transition-colors"
                title="Clear selection"
              >
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* REASSIGN CLASS MODAL */}
      {showReassignModal && (
        <ReassignClassModal
          isOpen={showReassignModal}
          onClose={() => setShowReassignModal(false)}
          onSubmit={handleReassignClass}
          isLoading={isReassigning}
          selectedStudentCount={selectedStudents.size}
        />
      )}

      {/* BULK PHOTO UPLOAD MODAL */}
      <BulkPhotoUploadModal
        open={showPhotoUploadModal}
        onClose={() => setShowPhotoUploadModal(false)}
        students={filteredStudents.map(s => ({
          id: s.id,
          person_id: s.person_id,
          first_name: s.first_name,
          last_name: s.last_name,
          admission_no: s.admission_no,
          photo_url: s.photo_url,
        }))}
        onUploadComplete={() => {
          setShowPhotoUploadModal(false);
          toast.success('Photos uploaded successfully');
          router.refresh();
        }}
      />
    </div>
  );
}
