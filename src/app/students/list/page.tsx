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
import { 
  safeArray, 
  safeString, 
  safeMultiFieldFilter,
  scopedLogger,
  standardizeResponse,
  assertArray,
} from '@/lib/safety';

// Scoped logger for this module
const logger = scopedLogger('StudentsList');

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
  const [enrollError, setEnrollError] = useState<string>('');
  const [enrollmentValidation, setEnrollmentValidation] = useState<Record<string, boolean>>({
    class_id: false,
    program_ids: false,
    study_mode_id: false,
    academic_year_id: false,
    term_id: false,
  });
  
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
    logger.log('Loading dropdown options...');
    try {
      const [classRes, streamRes, progRes, modeRes, yearRes, termRes] = await Promise.all([
        fetch('/api/classes'),
        fetch('/api/streams'),
        fetch('/api/programs'),
        fetch('/api/study-modes'),
        fetch('/api/academic_years'),
        fetch('/api/terms'),
      ]);

      // Safely handle all responses
      if (classRes.ok) {
        const classData = await classRes.json();
        const normalizedClasses = standardizeResponse<SelectOption>(classData);
        setClasses(normalizedClasses.data);
        logger.debug('[Classes]', normalizedClasses.data);
      } else {
        logger.warn('Failed to fetch classes:', classRes.status);
        setClasses([]);
      }

      if (streamRes.ok) {
        const streamData = await streamRes.json();
        const normalizedStreams = standardizeResponse<SelectOption>(streamData);
        setStreams(normalizedStreams.data);
        logger.debug('[Streams]', normalizedStreams.data);
      } else {
        setStreams([]);
      }

      if (progRes.ok) {
        const progData = await progRes.json();
        const normalizedPrograms = standardizeResponse<SelectOption>(progData);
        setPrograms(normalizedPrograms.data);
        logger.debug('[Programs]', normalizedPrograms.data);
      } else {
        setPrograms([]);
      }

      if (modeRes.ok) {
        const modeData = await modeRes.json();
        const normalizedModes = standardizeResponse<SelectOption>(modeData);
        setStudyModes(normalizedModes.data);
        logger.debug('[StudyModes]', normalizedModes.data);
      } else {
        setStudyModes([]);
      }

      if (yearRes.ok) {
        const yearData = await yearRes.json();
        const normalizedYears = standardizeResponse<SelectOption>(yearData);
        setAcademicYears(normalizedYears.data);
        logger.debug('[AcademicYears]', normalizedYears.data);
      } else {
        setAcademicYears([]);
      }

      if (termRes.ok) {
        const termData = await termRes.json();
        const normalizedTerms = standardizeResponse<SelectOption>(termData);
        setTerms(normalizedTerms.data);
        logger.debug('[Terms]', normalizedTerms.data);
      } else {
        setTerms([]);
      }

      logger.log('✅ All dropdown options loaded');
    } catch (error) {
      logger.error('Failed to load options:', error);
      // Set empty arrays on error
      setClasses([]);
      setStreams([]);
      setPrograms([]);
      setStudyModes([]);
      setAcademicYears([]);
      setTerms([]);
      toast.error('Failed to load form options');
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
      logger.log('Fetching students with search:', search);
      
      // Fetch enrolled students
      const enrolledRes = await fetch(`/api/students/enrolled?${params}`);
      if (enrolledRes.ok) {
        const enrolledData = await enrolledRes.json();
        const normalizedEnrolled = standardizeResponse<EnrolledStudent>(enrolledData);
        const safeEnroled = assertArray(normalizedEnrolled.data, 'Enrolled students', logger)
          ? normalizedEnrolled.data
          : [];
        setEnrolledStudents(safeEnroled);
        logger.debug('[Enrolled Students]', safeEnroled.length, 'records');
      } else {
        logger.warn('Enrolled fetch failed:', enrolledRes.status);
        setEnrolledStudents([]);
      }

      // Fetch admitted students (no enrollment)
      const admittedRes = await fetch(`/api/students/admitted?${params}`);
      if (admittedRes.ok) {
        const admittedData = await admittedRes.json();
        const normalizedAdmitted = standardizeResponse<Student>(admittedData);
        const safeAdmitted = assertArray(normalizedAdmitted.data, 'Admitted students', logger)
          ? normalizedAdmitted.data
          : [];
        setAdmittedStudents(safeAdmitted);
        logger.debug('[Admitted Students]', safeAdmitted.length, 'records');
      } else {
        logger.warn('Admitted fetch failed:', admittedRes.status);
        setAdmittedStudents([]);
      }
    } catch (error) {
      logger.error('Failed to fetch students:', error);
      toast.error('Failed to load students');
      // Set empty arrays on error
      setEnrolledStudents([]);
      setAdmittedStudents([]);
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
    setEnrollError('');
    setEnrollmentValidation({
      class_id: false,
      program_ids: false,
      study_mode_id: false,
      academic_year_id: false,
      term_id: false,
    });
    setShowEnrollModal(true);
  };

  // Real-time form validation
  const validateEnrollForm = (form: EnrollmentFormData) => {
    const validation = {
      class_id: form.class_id !== 0,
      program_ids: form.program_ids.length > 0,
      study_mode_id: form.study_mode_id !== 0,
      academic_year_id: form.academic_year_id !== 0,
      term_id: form.term_id !== 0,
    };
    setEnrollmentValidation(validation);
    return Object.values(validation).every(v => v);
  };

  // Check if student is already enrolled in the same academic year
  const checkDuplicateEnrollment = (studentId: number, academicYearId: number): boolean => {
    return enrolledStudents.some(
      s => s.id === studentId && s.academic_year_id === academicYearId
    );
  };

  const handleEnroll = async () => {
    // Validation
    if (!validateEnrollForm(enrollForm)) {
      toast.error('Please fill all required fields');
      setEnrollError('All fields marked with * are required');
      return;
    }

    // Check for duplicate enrollment
    if (checkDuplicateEnrollment(enrollForm.student_id, enrollForm.academic_year_id)) {
      setEnrollError('Student is already enrolled in this academic year');
      toast.error('Student is already enrolled in this academic year');
      return;
    }

    setEnrollLoading(true);
    setEnrollError('');
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
        const errorMsg = data.error || 'Enrollment failed';
        toast.error(errorMsg);
        setEnrollError(errorMsg);
      }
    } catch (error) {
      console.error('Enrollment error:', error);
      const errorMsg = 'Enrollment failed - please try again';
      toast.error(errorMsg);
      setEnrollError(errorMsg);
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

  // Delete student handler
  const handleDeleteStudent = async (studentId: number) => {
    const student = admittedStudents.find(s => s.id === studentId);
    if (!student) return;

    // Confirmation dialog
    const confirmed = window.confirm(
      `Are you sure you want to delete ${safeString(student.first_name)} ${safeString(student.last_name)}? This action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      const res = await fetch('/api/students/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: studentId }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('Student deleted successfully');
        // Refresh the list
        fetchStudents();
      } else {
        toast.error(data.message || 'Failed to delete student');
      }
    } catch (error) {
      logger.error('Delete error:', error);
      toast.error('Failed to delete student');
    }
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
  
  // Safe search filter using utility function
  const displayedData = safeMultiFieldFilter(
    currentData,
    search,
    ['first_name', 'last_name', 'admission_no']
  );

  logger.debug('Displayed data:', displayedData.length, 'of', currentData.length);

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
                onDelete={() => handleDeleteStudent(student.id)}
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
          setForm={(form) => {
            setEnrollForm(form);
            validateEnrollForm(form);
          }}
          error={enrollError}
          validation={enrollmentValidation}
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
  onDelete?: () => void;
}

function StudentCard({
  student,
  isSelected,
  onSelect,
  isEnrolled,
  onEnroll,
  onDelete,
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
                alt={`${safeString(student.first_name)} ${safeString(student.last_name)}`}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm">
                {safeString(student.first_name)[0] || '?'}{safeString(student.last_name)[0] || '?'}
              </div>
            )}
            <div>
              <h3 className="font-semibold text-gray-900">
                {safeString(student.first_name)} {safeString(student.last_name)}
              </h3>
              <p className="text-sm text-gray-500">{safeString(student.admission_no)}</p>
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
                  {safeArray(enrolled.programs).length > 0 ? (
                    safeArray(enrolled.programs).map((p) => (
                      <span key={p.id} className="inline-block px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                        {safeString(p.name)}
                      </span>
                    ))
                  ) : (
                    <p className="text-sm text-gray-600">-</p>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">STUDY MODE</p>
                <p className="text-sm font-medium text-gray-900">{safeString(enrolled.study_mode_name) || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">ACADEMIC YEAR</p>
                <p className="text-sm font-medium text-gray-900">{safeString(enrolled.academic_year_name)}</p>
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
            <div className="flex gap-2">
              <button
                onClick={onEnroll}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-2 transition-colors"
              >
                <Plus size={16} /> Enroll
              </button>
              <button
                onClick={onDelete}
                className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                title="Delete Learner"
              >
                <Trash2 size={18} className="text-red-600" />
              </button>
            </div>
          )}

          {showMenu && (
            <div className="absolute right-0 mt-1 w-48 bg-white border rounded-lg shadow-lg z-50">
              <Link href={`/students/${student.id}`} className="flex items-center gap-2 px-4 py-2 hover:bg-gray-50 border-b text-sm">
                <Eye size={16} /> View Profile
              </Link>
              <Link href={`/students/${student.id}/edit`} className="flex items-center gap-2 px-4 py-2 hover:bg-gray-50 border-b text-sm">
                <Edit size={16} /> Edit
              </Link>
              <button
                onClick={() => {
                  setShowMenu(false);
                  if (onDelete) onDelete();
                }}
                className="w-full text-left flex items-center gap-2 px-4 py-2 hover:bg-gray-50 text-red-600 text-sm"
              >
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
  error: string;
  validation: Record<string, boolean>;
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
  error,
  validation,
  classes,
  streams,
  programs,
  studyModes,
  academicYears,
  terms,
  toggleProgram,
}: EnrollmentModalProps) {
  const modalLogger = scopedLogger('EnrollmentModal');
  
  // Defensive array checks
  const safeClasses = Array.isArray(classes) ? classes : [];
  const safeStreams = Array.isArray(streams) ? streams : [];
  const safePrograms = Array.isArray(programs) ? programs : [];
  const safeStudyModes = Array.isArray(studyModes) ? studyModes : [];
  const safeAcademicYears = Array.isArray(academicYears) ? academicYears : [];
  const safeTerms = Array.isArray(terms) ? terms : [];

  // Determine if all required fields are valid
  const allFieldsValid = Object.values(validation).every(v => v);

  // Filtered terms based on selected academic year
  const filteredTerms = safeTerms.filter(t => {
    // If no academic year selected, show all
    if (form.academic_year_id === 0) return true;
    // Otherwise, you might want to filter by academic_year_id if available
    return true;
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Sticky Header */}
        <div className="sticky top-0 z-20 bg-gradient-to-r from-white/95 to-white/90 dark:from-slate-900/95 dark:to-slate-900/90 backdrop-blur-xl border-b border-slate-200 dark:border-slate-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Enroll Student</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                {student.first_name} {student.last_name} · Admission # {student.admission_no}
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={loading}
              className="p-2 hover:bg-slate-200/50 dark:hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
              aria-label="Close modal"
            >
              <X size={24} className="text-slate-600 dark:text-slate-400" />
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
              <AlertCircle size={18} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="space-y-6">
            {/* Row 1: Class, Stream, Academic Year */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Class Selection */}
              <div className={`space-y-2 p-4 rounded-lg border-2 transition-all ${
                validation.class_id
                  ? 'border-emerald-300 dark:border-emerald-600 bg-emerald-50/30 dark:bg-emerald-900/10'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20'
              }`}>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-400">
                  Class <span className="text-red-600">*</span>
                </label>
                <select
                  value={form.class_id}
                  onChange={(e) => setForm({ ...form, class_id: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-sm font-medium focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-400 transition-all"
                  disabled={safeClasses.length === 0}
                >
                  <option value={0}>
                    {safeClasses.length === 0 ? '⚠️ No classes' : 'Select class'}
                  </option>
                  {safeClasses.map(c => (
                    <option key={c.id} value={c.id}>{safeString(c.name)}</option>
                  ))}
                </select>
                {safeClasses.length === 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">Contact administrator to add classes.</p>
                )}
              </div>

              {/* Stream Selection */}
              <div className="space-y-2 p-4 rounded-lg border-2 border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20">
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-400">Stream (Optional)</label>
                <select
                  value={form.stream_id || 0}
                  onChange={(e) => setForm({ ...form, stream_id: e.target.value ? parseInt(e.target.value) : undefined })}
                  className="w-full px-3 py-2 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-sm font-medium focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-400 transition-all"
                >
                  <option value={0}>No Stream</option>
                  {safeStreams.map(s => (
                    <option key={s.id} value={s.id}>{safeString(s.name)}</option>
                  ))}
                </select>
              </div>

              {/* Academic Year Selection */}
              <div className={`space-y-2 p-4 rounded-lg border-2 transition-all ${
                validation.academic_year_id
                  ? 'border-emerald-300 dark:border-emerald-600 bg-emerald-50/30 dark:bg-emerald-900/10'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20'
              }`}>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-400">
                  Academic Year <span className="text-red-600">*</span>
                </label>
                <select
                  value={form.academic_year_id}
                  onChange={(e) => setForm({ ...form, academic_year_id: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-sm font-medium focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-400 transition-all"
                  disabled={safeAcademicYears.length === 0}
                >
                  <option value={0}>
                    {safeAcademicYears.length === 0 ? '⚠️ No years' : 'Select year'}
                  </option>
                  {safeAcademicYears.map(y => (
                    <option key={y.id} value={y.id}>{safeString(y.name)}</option>
                  ))}
                </select>
                {safeAcademicYears.length === 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">No academic years configured.</p>
                )}
              </div>
            </div>

            {/* Row 2: Study Mode, Term, Programs */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Study Mode Selection */}
                <div className={`space-y-2 p-4 rounded-lg border-2 transition-all ${
                  validation.study_mode_id
                    ? 'border-emerald-300 dark:border-emerald-600 bg-emerald-50/30 dark:bg-emerald-900/10'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20'
                }`}>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-400">
                    Study Mode <span className="text-red-600">*</span>
                  </label>
                  {safeStudyModes.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {safeStudyModes.map(m => (
                        <button
                          key={m.id}
                          onClick={() => setForm({ ...form, study_mode_id: m.id })}
                          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                            form.study_mode_id === m.id
                              ? 'bg-indigo-600 text-white ring-2 ring-indigo-400 dark:ring-indigo-500'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:border-indigo-300 dark:hover:border-indigo-600'
                          }`}
                        >
                          {safeString(m.name)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-amber-600 dark:text-amber-400">No study modes available.</p>
                  )}
                </div>

                {/* Term Selection */}
                <div className={`space-y-2 p-4 rounded-lg border-2 transition-all ${
                  validation.term_id
                    ? 'border-emerald-300 dark:border-emerald-600 bg-emerald-50/30 dark:bg-emerald-900/10'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20'
                }`}>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-400">
                    Term <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={form.term_id}
                    onChange={(e) => setForm({ ...form, term_id: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-sm font-medium focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-400 transition-all"
                    disabled={filteredTerms.length === 0}
                  >
                    <option value={0}>
                      {filteredTerms.length === 0 ? '⚠️ No terms' : 'Select term'}
                    </option>
                    {filteredTerms.map(t => (
                      <option key={t.id} value={t.id}>{safeString(t.name)}</option>
                    ))}
                  </select>
                  {filteredTerms.length === 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">No terms available for selected year.</p>
                  )}
                </div>
              </div>

              {/* Programs Selection (Full Width) */}
              <div className={`space-y-3 p-4 rounded-lg border-2 transition-all ${
                validation.program_ids
                  ? 'border-emerald-300 dark:border-emerald-600 bg-emerald-50/30 dark:bg-emerald-900/10'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20'
              }`}>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-400">
                  Programs <span className="text-red-600">*</span> — Select at least one
                </label>
                {safePrograms.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                    {safePrograms.map((p, idx) => (
                      <label key={p.id} className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-all ${
                        form.program_ids.includes(p.id)
                          ? 'bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-300 dark:border-indigo-600'
                          : `border border-slate-200 dark:border-slate-600 hover:border-indigo-300 dark:hover:border-indigo-600 ${idx % 2 === 0 ? 'bg-white dark:bg-slate-800/50' : 'bg-slate-50/50 dark:bg-slate-800/30'}`
                      }`}>
                        <input
                          type="checkbox"
                          checked={form.program_ids.includes(p.id)}
                          onChange={() => toggleProgram(p.id)}
                          className="w-4 h-4 rounded text-indigo-600 dark:text-indigo-500 cursor-pointer"
                        />
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{safeString(p.name)}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-amber-600 dark:text-amber-400">No programs available. Contact administrator.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="sticky bottom-0 bg-gradient-to-r from-white/95 to-white/90 dark:from-slate-900/95 dark:to-slate-900/90 backdrop-blur-xl border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onEnroll}
            disabled={loading || !allFieldsValid}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600 text-white hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
          >
            {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
            {loading ? 'Enrolling...' : 'Enroll Student'}
          </button>
        </div>
      </div>
    </div>
  );
}

