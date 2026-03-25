'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Eye,
  Edit,
  LogOut,
  Trash2,
  Users,
  AlertCircle,
  CheckSquare,
  Square,
  Plus,
  Download,
  Filter,
  FileText,
  Sheet3
} from 'lucide-react';
import { useExport } from '@/hooks/useExport';

interface Student {
  id: number;
  admission_no: string;
  first_name: string;
  last_name: string;
  gender: string;
  photo_url?: string;
  class_name?: string;
  class_id?: number;
  stream_name?: string;
  status: string;
  enrollment_date?: string;
  left_at?: string;
  left_reason?: string;
  result_count?: number;
}

export default function StudentsListPage() {
  const { exportAsCSV, exportAsExcel, exporting } = useExport();
  
  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [page,setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [actionMenuOpen, setActionMenuOpen] = useState<number | null>(null);
  const [bulkActioning, setBulkActioning] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const limit = 50;
  const pages = Math.ceil(total / limit);

  // Fetch students
  useEffect(() => {
    fetchStudents();
  }, [page, search, statusFilter]);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        search,
        status: statusFilter
      });

      const res = await fetch(`/api/students/list?${params}`);
      const data = await res.json();

      if (data.success) {
        setStudents(data.data);
        setTotal(data.total);
      }
    } catch (error) {
      console.error('Failed to fetch students:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.size === students.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(students.map((s) => s.id)));
    }
  };

  const handleSelectStudent = (studentId: number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(studentId)) {
      newSelected.delete(studentId);
    } else {
      newSelected.add(studentId);
    }
    setSelectedIds(newSelected);
  };

  const performBulkAction = async (action: 'delete' | 'enroll' | 'status') => {
    if (!confirm(`Are you sure? This will affect ${selectedIds.size} students.`)) return;

    setBulkActioning(true);
    try {
      const res = await fetch(`/api/students/bulk/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_ids: Array.from(selectedIds),
          ...(action === 'status' && { status: 'left', reason: 'Bulk operation' })
        })
      });

      const data = await res.json();
      if (data.success) {
        setSelectedIds(new Set());
        fetchStudents();
      }
    } catch (error) {
      console.error(`Bulk ${action} failed:`, error);
    } finally {
      setBulkActioning(false);
    }
  };

  const handleExportCSV = () => {
    const dataToExport = students.map(s => ({
      'Admission No': s.admission_no,
      'First Name': s.first_name,
      'Last Name': s.last_name,
      'Class': s.class_name || '-',
      'Status': s.status,
    }));
    exportAsCSV(dataToExport, `students_${statusFilter}`, ['Admission No', 'First Name', 'Last Name', 'Class', 'Status']);
    setShowExportMenu(false);
  };

  const handleExportExcel = () => {
    const dataToExport = students.map(s => ({
      'Admission No': s.admission_no,
      'First Name': s.first_name,
      'Last Name': s.last_name,
      'Class': s.class_name || '-',
      'Status': s.status,
    }));
    exportAsExcel(dataToExport, `students_${statusFilter}`, ['Admission No', 'First Name', 'Last Name', 'Class', 'Status'], 'Student List');
    setShowExportMenu(false);
  };

  const getStatusBadge = (status: string, leftAt?: string) => {
    const badges: Record<string, {bg: string; text: string}> = {
      active: { bg: 'bg-green-100', text: 'text-green-800' },
      left: { bg: 'bg-gray-100', text: 'text-gray-800' },
      graduated: { bg: 'bg-blue-100', text: 'text-blue-800' },
      suspended: { bg: 'bg-red-100', text: 'text-red-800' }
    };

    const badge = badges[status] || badges.active;
    const label = status === 'left' && leftAt ? `Left (${new Date(leftAt).getFullYear()})` : status;

    return (
      <span className={`px-2 py-1 text-xs rounded-full font-medium ${badge.bg} ${badge.text}`}>
        {label}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-3xl font-bold">Students</h1>
            <div className="flex gap-2">
              <Link
                href="/students/import"
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2"
              >
                <Plus size={18} /> Bulk Import
              </Link>
              
              {/* Export Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2"
                >
                  <Download size={18} /> Export
                </button>
                {showExportMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white border rounded-lg shadow-lg z-50 overflow-hidden">
                    <button
                      onClick={handleExportCSV}
                      disabled={exporting}
                      className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
                    >
                      <FileText size={16} />
                      Export as CSV
                    </button>
                    <button
                      onClick={handleExportExcel}
                      disabled={exporting}
                      className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 border-t disabled:opacity-50"
                    >
                      <Sheet3 size={16} />
                      Export as Excel
                    </button>
                  </div>
                )}
              </div>

              <Link
                href="/students/admit"
                className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg font-medium"
              >
                + Add Student
              </Link>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search by name or admission number..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="active">Active Students</option>
              <option value="">All Students</option>
              <option value="left">Left</option>
              <option value="graduated">Graduated</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          {/* Stats */}
          <div className="mt-4 text-sm text-gray-600">
            {statusFilter ? `Showing ${students.length} of ${total}` : `Total: ${total}`} students
          </div>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-50 border-b border-blue-200 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <div className="flex justify-between items-center">
              <span className="font-medium text-blue-900">
                {selectedIds.size} student{selectedIds.size !== 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => performBulkAction('enroll')}
                  disabled={bulkActioning}
                  className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-sm"
                >
                  <Users size={16} />
                  Enroll
                </button>
                <button
                  onClick={() => performBulkAction('status')}
                  disabled={bulkActioning}
                  className="px-3 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2 text-sm"
                >
                  <LogOut size={16} />
                  Mark Left
                </button>
                <button
                  onClick={() => performBulkAction('delete')}
                  disabled={bulkActioning}
                  className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 flex items-center gap-2 text-sm"
                >
                  <Trash2 size={16} />
                  Delete
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="px-3 py-1 bg-gray-300 text-gray-800 rounded hover:bg-gray-400 text-sm"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : students.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border">
            <AlertCircle className="mx-auto text-gray-400 mb-2" size={48} />
            <p className="text-gray-600">No students found</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="w-12 px-4 py-3 text-left">
                    <button onClick={handleSelectAll} className="hover:bg-gray-200 p-1 rounded">
                      {selectedIds.size === students.length ? (
                        <CheckSquare size={18} className="text-blue-600" />
                      ) : (
                        <Square size={18} />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Admission No.</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Class</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Results</th>
                  <th className="w-12 px-4 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {students.map((student) => (
                  <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleSelectStudent(student.id)}
                        className="hover:bg-gray-200 p-1 rounded"
                      >
                        {selectedIds.has(student.id) ? (
                          <CheckSquare size={18} className="text-blue-600" />
                        ) : (
                          <Square size={18} />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {student.photo_url ? (
                          <img
                            src={student.photo_url}
                            alt={`${student.first_name} ${student.last_name}`}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-xs font-bold text-gray-600">
                            {student.first_name[0]}
                          </div>
                        )}
                        <div>
                          <div className="font-medium">
                            {student.first_name} {student.last_name}
                          </div>
                          <div className="text-xs text-gray-500">{student.gender}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">{student.admission_no}</td>
                    <td className="px-4 py-3 text-sm">
                      {student.class_name || '—'}
                      {student.stream_name && <span className="text-xs text-gray-500 ml-1">({student.stream_name})</span>}
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(student.status, student.left_at)}</td>
                    <td className="px-4 py-3 text-center text-sm text-gray-600">
                      {student.result_count || 0}
                    </td>
                    <td className="px-4 py-3 text-right relative">
                      <button
                        onClick={() => setActionMenuOpen(actionMenuOpen === student.id ? null : student.id)}
                        className="p-1 hover:bg-gray-200 rounded"
                      >
                        <MoreVertical size={18} />
                      </button>

                      {actionMenuOpen === student.id && (
                        <div className="absolute right-0 mt-1 w-48 bg-white border rounded-lg shadow-lg z-50">
                          <Link href={`/students/${student.id}`} className="flex items-center gap-2 px-4 py-2 hover:bg-gray-50 border-b">
                            <Eye size={16} /> View Profile
                          </Link>
                          <Link href={`/students/${student.id}/edit`} className="flex items-center gap-2 px-4 py-2 hover:bg-gray-50 border-b">
                            <Edit size={16} /> Edit
                          </Link>
                          <button className="w-full text-left flex items-center gap-2 px-4 py-2 hover:bg-gray-50 border-b text-orange-600">
                            <LogOut size={16} /> Mark as Left
                          </button>
                          <button className="w-full text-left flex items-center gap-2 px-4 py-2 hover:bg-gray-50 text-red-600">
                            <Trash2 size={16} /> Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="mt-6 flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Page {page} of {pages}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-2 border rounded hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1"
              >
                <ChevronLeft size={16} /> Previous
              </button>
              <button
                onClick={() => setPage(Math.min(pages, page + 1))}
                disabled={page === pages}
                className="px-3 py-2 border rounded hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1"
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

