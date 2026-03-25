'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Search,
  Plus,
  Download,
  Eye,
  Edit,
  LogOut,
  Trash2,
  AlertCircle,
  CheckSquare,
  Square,
  X,
  ChevronDown,
  Users,
  Book,
  Home,
  MoreVertical,
} from 'lucide-react';
import { useExport } from '@/hooks/useExport';
import { toast } from 'react-hot-toast';

// Interfaces
interface Student {
  id: number;
  admission_no: string;
  first_name: string;
  last_name: string;
  gender: string;
  photo_url?: string;
  admission_date?: string;
}

interface EnrolledStudent extends Student {
  enrollment_id: number;
  class_id: number;
  class_name: string;
  stream_id?: number;
  stream_name?: string;
  academic_year_id: number;
  academic_year_name: string;
  term_id?: number;
  term_name?: string;
  study_mode_id?: number;
  study_mode_name?: string;
  programs?: Array<{ id: number; name: string }>;
  enrollment_status: string;
  enrollment_date: string;
}

interface EnrollmentFormData {
  student_id: number;
  class_id: number;
  stream_id?: number;
  program_ids: number[];
  study_mode_id: number;
  academic_year_id: number;
  term_id: number;
}

interface SelectOption {
  id: number;
  name: string;
}

export default function StudentsListPage() {
  const { exportAsCSV, exportAsExcel, exporting } = useExport();
  
  // State Management
  const [activeTab, setActiveTab] = useState<'enrolled' | 'admitted'>('enrolled');
  const [enrolledStudents, setEnrolledStudents] = useState<EnrolledStudent[]>([]);
  const [admittedStudents, setAdmittedStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showExportMenu, setShowExportMenu] = useState(false);
  
  // Enrollment Modal State
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [enrollingStudent, setEnrollingStudent] = useState<Student | null>(null);
  const [enrollForm, setEnrollForm] = useState<EnrollmentFormData>({
    student_id: 0,
    class_id: 0,
    program_ids: [],
    study_mode_id: 0,
    academic_year_id: 0,
    term_id: 0,
  });
  const [enrollLoading, setEnrollLoading] = useState(false);
  
  // Options for Dropdowns
  const [classes, setClasses] = useState<SelectOption[]>([]);
  const [streams, setStreams] = useState<SelectOption[]>([]);
  const [programs, setPrograms] = useState<SelectOption[]>([]);
  const [studyModes, setStudyModes] = useState<SelectOption[]>([]);
  const [academicYears, setAcademicYears] = useState<SelectOption[]>([]);
  const [terms, setTerms] = useState<SelectOption[]>([]);

  // Load options
  useEffect(() => {
    loadOptions();
  }, []);

  const loadOptions = async () => {
    try {
      const [classRes, streamRes, progRes, modeRes, yearRes, termRes] = await Promise.all([
        fetch('/api/classes'),
        fetch('/api/streams'),
        fetch('/api/programs'),
        fetch('/api/study-modes'),
        fetch('/api/academic-years'),
        fetch('/api/terms'),
      ]);

      if (classRes.ok) setClasses(await classRes.json());
      if (streamRes.ok) setStreams(await streamRes.json());
      if (progRes.ok) setPrograms(await progRes.json());
      if (modeRes.ok) setStudyModes(await modeRes.json());
      if (yearRes.ok) setAcademicYears(await yearRes.json());
      if (termRes.ok) setTerms(await termRes.json());
    } catch (error) {
      console.error('Failed to load options:', error);
    }
  };

  // Main data fetching
  useEffect(() => {
    fetchStudents();
  }, [search]);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search });
      
      // Fetch enrolled students
      const enrolledRes = await fetch(`/api/students/enrolled?${params}`);
      if (enrolledRes.ok) {
        const enrolledData = await enrolledRes.json();
        setEnrolledStudents(enrolledData.data || []);
      }

      // Fetch admitted students (no enrollment)
      const admittedRes = await fetch(`/api/students/admitted?${params}`);
      if (admittedRes.ok) {
        const admittedData = await admittedRes.json();
        setAdmittedStudents(admittedData.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch students:', error);
      toast.error('Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  // Enrollment Modal Handlers
  const openEnrollModal = (student: Student) => {
    setEnrollingStudent(student);
    setEnrollForm({
      student_id: student.id,
      class_id: 0,
      program_ids: [],
      study_mode_id: 0,
      academic_year_id: 0,
      term_id: 0,
    });
    setShowEnrollModal(true);
  };

  const handleEnroll = async () => {
    // Validation
    if (!enrollForm.class_id || !enrollForm.study_mode_id || !enrollForm.academic_year_id || !enrollForm.term_id) {
      toast.error('Please fill all required fields');
      return;
    }

    if (enrollForm.program_ids.length === 0) {
      toast.error('Please select at least one program');
      return;
    }

    setEnrollLoading(true);
    try {
      const res = await fetch('/api/enrollments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(enrollForm),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('Student enrolled successfully');
        setShowEnrollModal(false);
        setSelectedIds(new Set(prev => new Set([...prev]).delete(enrollForm.student_id)));
        fetchStudents();
      } else {
        toast.error(data.error || 'Enrollment failed');
      }
    } catch (error) {
      console.error('Enrollment error:', error);
      toast.error('Enrollment failed');
    } finally {
      setEnrollLoading(false);
    }
  };

  // Toggle program selection
  const toggleProgram = (programId: number) => {
    setEnrollForm(prev => ({
      ...prev,
      program_ids: prev.program_ids.includes(programId)
        ? prev.program_ids.filter(id => id !== programId)
        : [...prev.program_ids, programId]
    }));
  };

  // Selection handlers
  const handleSelectAll = () => {
    const currentList = activeTab === 'enrolled' ? enrolledStudents : admittedStudents;
    if (selectedIds.size === currentList.length) {
      setSelectedIds(new Set());
    } else {
      const ids = currentList.map(s => s.id);
      setSelectedIds(new Set(ids));
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

  // Export handlers
  const handleExportCSV = (sourceData: any[]) => {
    const dataToExport = sourceData.map(s => ({
      'Admission No': s.admission_no,
      'First Name': s.first_name,
      'Last Name': s.last_name,
      ...(activeTab === 'enrolled' && {
        'Class': s.class_name || '-',
        'Programs': s.programs?.map((p: any) => p.name).join('; ') || '-',
        'Study Mode': s.study_mode_name || '-',
      }),
    }));
    exportAsCSV(dataToExport, `students_${activeTab}`, []);
    setShowExportMenu(false);
  };

  const handleExportExcel = (sourceData: any[]) => {
    const dataToExport = sourceData.map(s => ({
      'Admission No': s.admission_no,
      'First Name': s.first_name,
      'Last Name': s.last_name,
      ...(activeTab === 'enrolled' && {
        'Class': s.class_name || '-',
        'Programs': s.programs?.map((p: any) => p.name).join('; ') || '-',
        'Study Mode': s.study_mode_name || '-',
      }),
    }));
    exportAsExcel(dataToExport, `students_${activeTab}`, [], 'Student List');
    setShowExportMenu(false);
  };

  const currentData = activeTab === 'enrolled' ? enrolledStudents : admittedStudents;
  const displayedData = currentData.filter(s =>
    search === '' || 
    s.first_name.toLowerCase().includes(search.toLowerCase()) ||
    s.last_name.toLowerCase().includes(search.toLowerCase()) ||
    s.admission_no.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Students</h1>
              <p className="text-sm text-gray-600 mt-1">
                {enrolledStudents.length} enrolled • {admittedStudents.length} admitted
              </p>
            </div>
            <div className="flex gap-2">
              {/* Export Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2"
                >
                  <Download size={18} /> Export
                </button>
                {showExportMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white border rounded-lg shadow-lg z-50">
                    <button
                      onClick={() => handleExportCSV(displayedData)}
                      disabled={exporting}
                      className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
                    >
                      <FileText size={16} /> CSV Export
                    </button>
                    <button
                      onClick={() => handleExportExcel(displayedData)}
                      disabled={exporting}
                      className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 border-t disabled:opacity-50"
                    >
                      <Sheet size={16} /> Excel Export
                    </button>
                  </div>
                )}
              </div>

              <Link
                href="/students/admit"
                className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2"
              >
                <Plus size={18} /> Add Student
              </Link>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b">
            <button
              onClick={() => {
                setActiveTab('enrolled');
                setSelectedIds(new Set());
              }}
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeTab === 'enrolled'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <span className="flex items-center gap-2">
                <Users size={18} /> Enrolled ({enrolledStudents.length})
              </span>
            </button>
            <button
              onClick={() => {
                setActiveTab('admitted');
                setSelectedIds(new Set());
              }}
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeTab === 'admitted'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <span className="flex items-center gap-2">
                <Home size={18} /> Admitted ({admittedStudents.length})
              </span>
            </button>
          </div>

          {/* Search */}
          <div className="mt-4 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search by name or admission number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : displayedData.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border">
            <AlertCircle className="mx-auto text-gray-400 mb-2" size={48} />
            <p className="text-gray-600">
              {activeTab === 'enrolled' ? 'No enrolled students' : 'No admitted students'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayedData.map((student) => (
              <StudentCard
                key={`${activeTab}-${student.id}`}
                student={student as any}
                isSelected={selectedIds.has(student.id)}
                onSelect={() => handleSelectStudent(student.id)}
                isEnrolled={activeTab === 'enrolled'}
                onEnroll={() => openEnrollModal(student)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Enrollment Modal */}
      {showEnrollModal && enrollingStudent && (
        <EnrollmentModal
          student={enrollingStudent}
          onClose={() => setShowEnrollModal(false)}
          onEnroll={handleEnroll}
          loading={enrollLoading}
          form={enrollForm}
          setForm={setEnrollForm}
          classes={classes}
          streams={streams}
          programs={programs}
          studyModes={studyModes}
          academicYears={academicYears}
          terms={terms}
          toggleProgram={toggleProgram}
        />
      )}
    </div>
  );
}

// ─── STUDENT CARD COMPONENT ────────────────────────────────────
interface StudentCardProps {
  student: EnrolledStudent | Student;
  isSelected: boolean;
  onSelect: () => void;
  isEnrolled: boolean;
  onEnroll?: () => void;
}

function StudentCard({
  student,
  isSelected,
  onSelect,
  isEnrolled,
  onEnroll,
}: StudentCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const enrolled = student as EnrolledStudent;

  return (
    <div className="bg-white rounded-lg border hover:border-blue-300 transition-colors">
      <div className="p-4 flex items-start gap-4">
        {/* Avatar */}
        <button
          onClick={onSelect}
          className="flex-shrink-0 pt-2"
        >
          {isSelected ? (
            <CheckSquare size={20} className="text-blue-600" />
          ) : (
            <Square size={20} className="text-gray-400" />
          )}
        </button>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            {student.photo_url ? (
              <img
                src={student.photo_url}
                alt={`${student.first_name} ${student.last_name}`}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm">
                {student.first_name[0]}{student.last_name[0]}
              </div>
            )}
            <div>
              <h3 className="font-semibold text-gray-900">
                {student.first_name} {student.last_name}
              </h3>
              <p className="text-sm text-gray-500">{student.admission_no}</p>
            </div>
          </div>

          {/* Metadata */}
          {isEnrolled && enrolled.class_name && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 pt-3 border-t">
              <div>
                <p className="text-xs text-gray-500 font-medium">CLASS</p>
                <p className="text-sm font-medium text-gray-900">{enrolled.class_name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">PROGRAMS</p>
                <div className="flex gap-1 flex-wrap mt-1">
                  {enrolled.programs?.map((p) => (
                    <span key={p.id} className="inline-block px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                      {p.name}
                    </span>
                  )) || <p className="text-sm text-gray-600">-</p>}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">STUDY MODE</p>
                <p className="text-sm font-medium text-gray-900">{enrolled.study_mode_name || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">ACADEMIC YEAR</p>
                <p className="text-sm font-medium text-gray-900">{enrolled.academic_year_name}</p>
              </div>
            </div>
          )}

          {!isEnrolled && (
            <div className="mt-2">
              <p className="text-xs text-gray-500 font-medium">ADMITTED</p>
              <p className="text-sm text-gray-600">{student.admission_date ? new Date(student.admission_date).toLocaleDateString() : 'N/A'}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="relative flex-shrink-0">
          {isEnrolled ? (
            <div className="flex gap-2">
              <Link
                href={`/students/${student.id}`}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="View Profile"
              >
                <Eye size={18} className="text-gray-600" />
              </Link>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <MoreVertical size={18} className="text-gray-600" />
              </button>
            </div>
          ) : (
            <button
              onClick={onEnroll}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-2 transition-colors"
            >
              <Plus size={16} /> Enroll
            </button>
          )}

          {showMenu && (
            <div className="absolute right-0 mt-1 w-48 bg-white border rounded-lg shadow-lg z-50">
              <Link href={`/students/${student.id}`} className="flex items-center gap-2 px-4 py-2 hover:bg-gray-50 border-b text-sm">
                <Eye size={16} /> View Profile
              </Link>
              <Link href={`/students/${student.id}/edit`} className="flex items-center gap-2 px-4 py-2 hover:bg-gray-50 border-b text-sm">
                <Edit size={16} /> Edit
              </Link>
              <button className="w-full text-left flex items-center gap-2 px-4 py-2 hover:bg-gray-50 text-red-600 text-sm">
                <Trash2 size={16} /> Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ENROLLMENT MODAL ──────────────────────────────────────
interface FileText { size: number }

const FileText = ({ size }: FileText) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="13" x2="12" y2="17"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>;
const Sheet = ({ size }: { size: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="3" x2="9" y2="21"></line></svg>;

interface EnrollmentModalProps {
  student: Student;
  onClose: () => void;
  onEnroll: () => Promise<void>;
  loading: boolean;
  form: EnrollmentFormData;
  setForm: (form: EnrollmentFormData) => void;
  classes: SelectOption[];
  streams: SelectOption[];
  programs: SelectOption[];
  studyModes: SelectOption[];
  academicYears: SelectOption[];
  terms: SelectOption[];
  toggleProgram: (id: number) => void;
}

function EnrollmentModal({
  student,
  onClose,
  onEnroll,
  loading,
  form,
  setForm,
  classes,
  streams,
  programs,
  studyModes,
  academicYears,
  terms,
  toggleProgram,
}: EnrollmentModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b p-6 flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold">Enroll Student</h2>
            <p className="text-gray-600 mt-1">
              {student.first_name} {student.last_name} ({student.admission_no})
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X size={24} />
          </button>
        </div>

        {/* Form */}
        <div className="p-6 space-y-6">
          {/* Class Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Class <span className="text-red-600">*</span>
            </label>
            <select
              value={form.class_id}
              onChange={(e) => setForm({ ...form, class_id: parseInt(e.target.value) })}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={0}>Select Class</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Stream Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">Stream</label>
            <select
              value={form.stream_id || 0}
              onChange={(e) => setForm({ ...form, stream_id: e.target.value ? parseInt(e.target.value) : undefined })}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={0}>No Stream</option>
              {streams.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Programs Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Programs <span className="text-red-600">*</span>
            </label>
            <p className="text-xs text-gray-600 mb-3">Select at least one program</p>
            <div className="grid grid-cols-2 gap-3">
              {programs.map(p => (
                <label key={p.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.program_ids.includes(p.id)}
                    onChange={() => toggleProgram(p.id)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium text-gray-900">{p.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Study Mode Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Study Mode <span className="text-red-600">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              {studyModes.map(m => (
                <button
                  key={m.id}
                  onClick={() => setForm({ ...form, study_mode_id: m.id })}
                  className={`p-3 border rounded-lg font-medium transition-colors ${
                    form.study_mode_id === m.id
                      ? 'border-blue-600 bg-blue-50 text-blue-600'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>

          {/* Academic Year Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Academic Year <span className="text-red-600">*</span>
            </label>
            <select
              value={form.academic_year_id}
              onChange={(e) => setForm({ ...form, academic_year_id: parseInt(e.target.value) })}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={0}>Select Academic Year</option>
              {academicYears.map(y => (
                <option key={y.id} value={y.id}>{y.name}</option>
              ))}
            </select>
          </div>

          {/* Term Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Term <span className="text-red-600">*</span>
            </label>
            <select
              value={form.term_id}
              onChange={(e) => setForm({ ...form, term_id: parseInt(e.target.value) })}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={0}>Select Term</option>
              {terms.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 bg-gray-50 border-t p-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-6 py-2 border rounded-lg font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onEnroll}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
            {loading ? 'Enrolling...' : 'Enroll Student'}
          </button>
        </div>
      </div>
    </div>
  );

