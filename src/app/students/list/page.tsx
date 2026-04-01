'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import {
  Search,
  Plus,
  Download,
  Eye,
  Trash2,
  AlertCircle,
  CheckSquare,
  Square,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Users,
  MoreVertical,
  Zap,
  Move,
  Camera,
  Loader,
  UserPlus,
  GraduationCap,
  FileDown,
  Check,
  MoreHorizontal,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import ReassignClassModal from '../_client/ReassignClassModal';
import { BulkPhotoUploadModal } from '@/components/students/BulkPhotoUploadModal';
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
  enrollment_type?: string;
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
  const [filterClassId, setFilterClassId] = useState<number>(0);
  const [filterYearId, setFilterYearId]   = useState<number>(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Pagination
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);

  // Inline editing (optimistic UI)
  const [inlineEdits, setInlineEdits] = useState<Map<number, { first_name: string; last_name: string }>>(new Map());
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const debounceTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // Bulk Action State
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [showPhotoUploadModal, setShowPhotoUploadModal] = useState(false);
  const [isReassigning, setIsReassigning] = useState(false);
  
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filterClassId, filterYearId]);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search });
      if (filterClassId)  params.set('class_id',          String(filterClassId));
      if (filterYearId)  {
        params.set('academic_year_id', String(filterYearId));
        // Show all terms for the chosen year, not just the current term
        params.set('historical',       'true');
      }
      logger.log('Fetching students — search:', search, 'class:', filterClassId, 'year:', filterYearId);
      
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

  // ── Inline name editing (optimistic UI) ──────────────────────────────────
  const getDisplayName = (student: Student) => {
    const edit = inlineEdits.get(student.id);
    return {
      first_name: edit?.first_name ?? student.first_name,
      last_name:  edit?.last_name  ?? student.last_name,
    };
  };

  const handleNameChange = (studentId: number, field: 'first_name' | 'last_name', value: string, original: Student) => {
    setInlineEdits(prev => {
      const next = new Map(prev);
      const cur = next.get(studentId) ?? { first_name: original.first_name, last_name: original.last_name };
      next.set(studentId, { ...cur, [field]: value });
      return next;
    });
    const existing = debounceTimers.current.get(studentId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => saveInlineName(studentId, original), 800);
    debounceTimers.current.set(studentId, timer);
  };

  const saveInlineName = async (studentId: number, original: Student) => {
    const edit = inlineEdits.get(studentId);
    if (!edit) return;
    if (edit.first_name === original.first_name && edit.last_name === original.last_name) return;
    setSavingIds(prev => new Set(prev).add(studentId));
    try {
      const res = await fetch('/api/students/edit', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: studentId, ...edit }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Save failed');
      setEnrolledStudents(prev => prev.map(s => s.id === studentId ? { ...s, ...edit } : s));
      setAdmittedStudents(prev => prev.map(s => s.id === studentId ? { ...s, ...edit } : s));
      setInlineEdits(prev => { const m = new Map(prev); m.delete(studentId); return m; });
    } catch {
      setInlineEdits(prev => { const m = new Map(prev); m.delete(studentId); return m; });
      toast.error('Failed to save — changes reverted');
    } finally {
      setSavingIds(prev => { const s = new Set(prev); s.delete(studentId); return s; });
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
        setSelectedIds(prev => { const next = new Set(prev); next.delete(enrollForm.student_id); return next; });
        fetchStudents();
      } else {
        const errorMsg = data.message || data.error || 'Enrollment failed';
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

  // Bulk class reassignment with optimistic UI update
  const handleReassignClass = async (newClassId: number, reason: string) => {
    if (selectedIds.size === 0) {
      toast.error('Please select students first');
      return;
    }
    setIsReassigning(true);
    try {
      const res = await fetch('/api/students/reassign-class', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_ids: Array.from(selectedIds),
          new_class_id: newClassId,
          reason: reason || null,
        }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success(data.message || `${selectedIds.size} student(s) reassigned successfully`);
        // Optimistic update — reflect new class instantly, no page reload
        const newClass = classes.find(c => c.id === newClassId);
        setEnrolledStudents(prev =>
          prev.map(s =>
            selectedIds.has(s.id)
              ? { ...s, class_id: newClassId, class_name: newClass?.name || '' }
              : s
          )
        );
        setSelectedIds(new Set());
        setShowReassignModal(false);
      } else {
        if (data.error_code === 'PARTIAL_SUCCESS') {
          toast.error(
            `⚠️ Partial: ${data.data.success_count} reassigned, ${data.data.failed_count} failed`,
            { duration: 5000 }
          );
        } else if (data.error_code === 'ALL_FAILED') {
          toast.error(`❌ ${data.data.failed_count} students could not be reassigned`, { duration: 5000 });
        } else {
          toast.error(data.message || 'Failed to reassign students');
        }
      }
    } catch {
      toast.error('An error occurred while reassigning students');
    } finally {
      setIsReassigning(false);
    }
  };

  const currentData = activeTab === 'enrolled' ? enrolledStudents : admittedStudents;

  const filteredData = useMemo(() => safeMultiFieldFilter(
    currentData, search, ['first_name', 'last_name', 'admission_no']
  ), [currentData, search]);

  // Client-side pagination
  const totalPages = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageData = filteredData.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const showFrom = filteredData.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const showTo   = Math.min(safePage * PAGE_SIZE, filteredData.length);

  // Reset page when tab/search/filter changes
  const resetPage = () => setPage(1);

  // Select all on current page
  const allPageSelected = pageData.length > 0 && pageData.every(s => selectedIds.has(s.id));
  const handleSelectPage = () => {
    if (allPageSelected) {
      setSelectedIds(prev => { const n = new Set(prev); pageData.forEach(s => n.delete(s.id)); return n; });
    } else {
      setSelectedIds(prev => { const n = new Set(prev); pageData.forEach(s => n.add(s.id)); return n; });
    }
  };

  // ── Avatar helper ────────────────────────────────────────────────────────
  const AvatarCell = ({ student }: { student: Student }) => {
    const initials = `${student.first_name?.[0] ?? ''}${student.last_name?.[0] ?? ''}`.toUpperCase();
    const colors = ['bg-indigo-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500'];
    const color = colors[(student.id ?? 0) % colors.length];
    if (student.photo_url) {
      return <img src={student.photo_url} alt={initials} className="w-7 h-7 rounded-full object-cover ring-1 ring-white dark:ring-slate-700 flex-shrink-0" />;
    }
    return <div className={`w-7 h-7 rounded-full ${color} flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}>{initials || '?'}</div>;
  };

  // ── Inline editable name cell ────────────────────────────────────────────
  const NameCell = ({ student }: { student: Student }) => {
    const { first_name, last_name } = getDisplayName(student);
    const isSaving = savingIds.has(student.id);
    const isDirty  = inlineEdits.has(student.id);

    return (
      <div className="flex items-center gap-2 min-w-0">
        <AvatarCell student={student} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <input
              value={first_name}
              onChange={e => handleNameChange(student.id, 'first_name', e.target.value, student)}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className={`bg-transparent border-0 border-b text-sm font-semibold text-slate-800 dark:text-white w-[90px] focus:outline-none focus:border-indigo-500 focus:ring-0 transition-colors truncate px-0 py-0.5 ${isDirty ? 'border-indigo-400' : 'border-transparent hover:border-slate-300'}`}
              title="Click to edit first name"
              spellCheck={false}
            />
            <input
              value={last_name}
              onChange={e => handleNameChange(student.id, 'last_name', e.target.value, student)}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className={`bg-transparent border-0 border-b text-sm font-semibold text-slate-800 dark:text-white flex-1 min-w-0 focus:outline-none focus:border-indigo-500 focus:ring-0 transition-colors truncate px-0 py-0.5 ${isDirty ? 'border-indigo-400' : 'border-transparent hover:border-slate-300'}`}
              title="Click to edit last name"
              spellCheck={false}
            />
            {isSaving && <Loader className="w-3 h-3 text-indigo-400 animate-spin flex-shrink-0" />}
            {!isSaving && isDirty && <Check className="w-3 h-3 text-emerald-500 flex-shrink-0" />}
          </div>
          {(student as EnrolledStudent).class_name && (
            <p className="text-[11px] text-slate-400 truncate">{(student as EnrolledStudent).class_name}</p>
          )}
        </div>
      </div>
    );
  };

  // ── Skeleton row ─────────────────────────────────────────────────────────
  const SkeletonRow = () => (
    <tr className="animate-pulse border-b border-slate-100 dark:border-slate-800">
      <td className="px-3 py-2.5 w-8"><div className="w-4 h-4 rounded bg-slate-200 dark:bg-slate-700" /></td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex-shrink-0" />
          <div className="space-y-1 flex-1"><div className="h-3 w-28 rounded bg-slate-200 dark:bg-slate-700" /><div className="h-2.5 w-16 rounded bg-slate-100 dark:bg-slate-800" /></div>
        </div>
      </td>
      <td className="px-3 py-2.5"><div className="h-3 w-20 rounded bg-slate-100 dark:bg-slate-800" /></td>
      <td className="px-3 py-2.5"><div className="h-3 w-16 rounded bg-slate-100 dark:bg-slate-800" /></td>
      <td className="px-3 py-2.5"><div className="h-5 w-14 rounded-full bg-slate-100 dark:bg-slate-800" /></td>
      <td className="px-3 py-2.5"><div className="h-5 w-12 rounded-full bg-slate-100 dark:bg-slate-800" /></td>
      <td className="px-3 py-2.5 w-8" />
    </tr>
  );

  const enrolledCount = enrolledStudents.length;
  const admittedCount = admittedStudents.length;

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">

      {/* ── TOOLBAR (48px) ──────────────────────────────────────────────── */}
      <div className="flex-shrink-0 sticky top-0 z-40 h-12 flex items-center gap-2 px-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm">

        {/* Search */}
        <div className="relative flex items-center group">
          <Search className="absolute left-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search students…"
            value={search}
            onChange={e => { setSearch(e.target.value); resetPage(); }}
            className="h-8 pl-8 pr-14 w-48 sm:w-56 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all focus:w-72"
          />
          <kbd className="absolute right-2 text-[10px] font-mono text-slate-400 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 bg-slate-50 dark:bg-slate-800 pointer-events-none select-none">⌘K</kbd>
        </div>

        {/* Inline filters (enrolled only) */}
        {activeTab === 'enrolled' && (
          <>
            <div className="relative hidden sm:flex items-center">
              <select
                value={filterClassId}
                onChange={e => { setFilterClassId(Number(e.target.value)); resetPage(); }}
                className="h-8 pl-2.5 pr-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer"
              >
                <option value={0}>All classes</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <ChevronDown className="absolute right-1.5 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>

            <div className="relative hidden sm:flex items-center">
              <select
                value={filterYearId}
                onChange={e => { setFilterYearId(Number(e.target.value)); resetPage(); }}
                className="h-8 pl-2.5 pr-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer"
              >
                <option value={0}>Current term</option>
                {academicYears.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
              </select>
              <ChevronDown className="absolute right-1.5 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>

            {(filterClassId !== 0 || filterYearId !== 0) && (
              <button onClick={() => { setFilterClassId(0); setFilterYearId(0); resetPage(); }}
                className="flex items-center gap-0.5 h-8 px-2 rounded-lg text-[10px] text-slate-500 hover:text-red-500 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 transition-colors">
                <X className="w-3 h-3" />
              </button>
            )}
          </>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Center: Enrolled / Admitted pill tabs */}
        <div className="flex items-center gap-0.5 h-8 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => { setActiveTab('enrolled'); setSelectedIds(new Set()); resetPage(); }}
            className={`flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'enrolled'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            Enrolled
            <span className={`tabular-nums text-[10px] px-1.5 py-0.5 rounded-full font-bold ${activeTab === 'enrolled' ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>
              {enrolledCount}
            </span>
          </button>
          <button
            onClick={() => { setActiveTab('admitted'); setSelectedIds(new Set()); resetPage(); }}
            className={`flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'admitted'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Admitted
            <span className={`tabular-nums text-[10px] px-1.5 py-0.5 rounded-full font-bold ${activeTab === 'admitted' ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>
              {admittedCount}
            </span>
          </button>
        </div>

        <div className="flex-1" />

        {/* Right: action buttons */}
        <div className="flex items-center gap-1">
          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(v => !v)}
              title="Export students"
              className="group flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            >
              <FileDown className="w-4 h-4" />
            </button>
            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                <div className="absolute right-0 top-9 z-50 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1 text-xs">
                  <button onClick={() => handleExportCSV(filteredData)} disabled={exporting} className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-50 flex items-center gap-2">
                    <FileDown className="w-3.5 h-3.5 text-slate-400" /> CSV
                  </button>
                  <button onClick={() => handleExportExcel(filteredData)} disabled={exporting} className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-50 flex items-center gap-2 border-t border-slate-100 dark:border-slate-700">
                    <FileDown className="w-3.5 h-3.5 text-slate-400" /> Excel
                  </button>
                </div>
              </>
            )}
          </div>

          <Link href="/students/promote" title="Promote students"
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400 transition-colors">
            <Zap className="w-4 h-4" />
          </Link>

          <Link href="/students/admit" title="Add new student"
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors">
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Add</span>
          </Link>
        </div>
      </div>

      {/* ── TABLE AREA ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="flex-1 overflow-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-0">
            {/* Sticky thead */}
            <thead className="sticky top-0 z-30">
              <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <th className="w-9 px-3 py-2.5 text-left">
                  <button onClick={handleSelectPage} className="flex items-center justify-center w-4 h-4 text-slate-400 hover:text-indigo-600 transition-colors">
                    {allPageSelected ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4" />}
                  </button>
                </th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Student</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Adm. No</th>
                {activeTab === 'enrolled' && (
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden sm:table-cell">Year · Term</th>
                )}
                {activeTab === 'admitted' && (
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden sm:table-cell">Admitted</th>
                )}
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Status</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden md:table-cell">Type</th>
                <th className="w-9 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {loading ? (
                Array.from({ length: 12 }).map((_, i) => <SkeletonRow key={i} />)
              ) : pageData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <Users className="w-6 h-6 text-slate-400" />
                      </div>
                      <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                        {search ? `No results for "${search}"` : activeTab === 'enrolled' ? 'No enrolled students' : 'No admitted students'}
                      </p>
                      {search && (
                        <button onClick={() => { setSearch(''); resetPage(); }} className="text-xs text-indigo-600 hover:underline">Clear search</button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                pageData.map((student, rowIdx) => {
                  const enrolled = student as EnrolledStudent;
                  const selected = selectedIds.has(student.id);
                  const isEven = rowIdx % 2 === 0;

                  return (
                    <tr
                      key={`${activeTab}-${student.id}`}
                      className={`group transition-colors ${selected ? 'bg-indigo-50 dark:bg-indigo-950/40' : isEven ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/50 dark:bg-slate-900/50'} hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30`}
                    >
                      {/* Checkbox */}
                      <td className="px-3 py-2.5 w-9">
                        <button onClick={() => handleSelectStudent(student.id)} className="flex items-center justify-center w-4 h-4 text-slate-400 hover:text-indigo-600 transition-colors">
                          {selected ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4" />}
                        </button>
                      </td>

                      {/* Student name (inline editable) */}
                      <td className="px-3 py-2.5 max-w-[220px]">
                        <NameCell student={student} />
                      </td>

                      {/* Admission No */}
                      <td className="px-3 py-2.5 text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {safeString(student.admission_no) || <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>

                      {/* Year · Term (enrolled) or Admitted date */}
                      {activeTab === 'enrolled' ? (
                        <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap hidden sm:table-cell">
                          {enrolled.academic_year_name ? (
                            <span>{enrolled.academic_year_name}{enrolled.term_name ? ` · ${enrolled.term_name}` : ''}</span>
                          ) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                        </td>
                      ) : (
                        <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap hidden sm:table-cell">
                          {student.admission_date ? new Date(student.admission_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                        </td>
                      )}

                      {/* Status badge */}
                      <td className="px-3 py-2.5">
                        <StatusBadge status={(student as any).status ?? (activeTab === 'enrolled' ? (enrolled.enrollment_status ?? 'active') : 'admitted')} />
                      </td>

                      {/* Enrollment type */}
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        {enrolled.enrollment_type ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 capitalize">
                            {enrolled.enrollment_type}
                          </span>
                        ) : null}
                      </td>

                      {/* Row actions */}
                      <td className="px-3 py-2.5 w-9">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {activeTab === 'enrolled' ? (
                            <Link href={`/students/${student.id}`} title="View profile" className="flex items-center justify-center w-6 h-6 rounded-md hover:bg-indigo-100 dark:hover:bg-indigo-900/30 text-slate-400 hover:text-indigo-600 transition-colors">
                              <Eye className="w-3.5 h-3.5" />
                            </Link>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button onClick={() => openEnrollModal(student)} title="Enroll student" className="flex items-center justify-center w-6 h-6 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white transition-colors">
                                <UserPlus className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleDeleteStudent(student.id)} title="Delete" className="flex items-center justify-center w-6 h-6 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-600 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── PAGINATION FOOTER ────────────────────────────────────────── */}
        {!loading && filteredData.length > 0 && (
          <div className="flex-shrink-0 flex items-center justify-between px-4 h-10 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm text-xs text-slate-500 dark:text-slate-400">
            <span className="tabular-nums">
              Showing <strong className="text-slate-700 dark:text-slate-200">{showFrom}–{showTo}</strong> of <strong className="text-slate-700 dark:text-slate-200">{filteredData.length}</strong>
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="flex items-center justify-center w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              {/* Page pills */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const mid = Math.min(Math.max(safePage, 3), totalPages - 2);
                const p = totalPages <= 5 ? i + 1 : mid - 2 + i;
                if (p < 1 || p > totalPages) return null;
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={`flex items-center justify-center w-7 h-7 rounded-lg text-xs font-semibold border transition-colors ${p === safePage ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="flex items-center justify-center w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
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
          setForm={(form) => { setEnrollForm(form); validateEnrollForm(form); }}
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

      {/* FLOATING BULK ACTION BAR */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
          >
            <div className="pointer-events-auto flex items-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-slate-800 text-white rounded-2xl shadow-2xl border border-slate-700 ring-1 ring-white/10 backdrop-blur-xl">
              <span className="text-xs font-semibold text-slate-300 whitespace-nowrap tabular-nums">
                {selectedIds.size} selected
              </span>
              <div className="w-px h-4 bg-slate-700" />
              <button
                onClick={() => setShowReassignModal(true)}
                disabled={isReassigning}
                className="flex items-center gap-1.5 h-7 px-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors"
              >
                {isReassigning ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Move className="w-3.5 h-3.5" />}
                Move class
              </button>
              <button
                onClick={() => setShowPhotoUploadModal(true)}
                className="flex items-center gap-1.5 h-7 px-3 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-semibold transition-colors"
              >
                <Camera className="w-3.5 h-3.5" /> Photos
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-slate-700 transition-colors"
                title="Clear selection"
              >
                <X className="w-3.5 h-3.5" />
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
          selectedStudentCount={selectedIds.size}
        />
      )}

      {/* BULK PHOTO UPLOAD MODAL */}
      <BulkPhotoUploadModal
        open={showPhotoUploadModal}
        onClose={() => setShowPhotoUploadModal(false)}
        students={(activeTab === 'enrolled' ? enrolledStudents : admittedStudents)
          .filter(s => selectedIds.has(s.id))
          .map(s => ({
            id: s.id,
            person_id: (s as any).person_id ?? s.id,
            first_name: s.first_name,
            last_name: s.last_name,
            admission_no: s.admission_no,
            photo_url: s.photo_url,
          }))}
        onUploadComplete={() => {
          setShowPhotoUploadModal(false);
          toast.success('Photos uploaded successfully');
          fetchStudents();
        }}
      />
    </div>
  );
}

// ─── STATUS BADGE ──────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { dot: string; label: string; bg: string; text: string }> = {
    active:      { dot: 'bg-emerald-500', label: 'Active',     bg: 'bg-emerald-50  dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-400' },
    admitted:    { dot: 'bg-sky-500',     label: 'Admitted',   bg: 'bg-sky-50      dark:bg-sky-900/20',     text: 'text-sky-700    dark:text-sky-400' },
    suspended:   { dot: 'bg-amber-500',   label: 'Suspended',  bg: 'bg-amber-50    dark:bg-amber-900/20',   text: 'text-amber-700  dark:text-amber-400' },
    inactive:    { dot: 'bg-slate-400',   label: 'Inactive',   bg: 'bg-slate-100   dark:bg-slate-800',      text: 'text-slate-500  dark:text-slate-400' },
    dropped_out: { dot: 'bg-red-500',     label: 'Dropped',    bg: 'bg-red-50      dark:bg-red-900/20',     text: 'text-red-600    dark:text-red-400' },
    expelled:    { dot: 'bg-red-700',     label: 'Expelled',   bg: 'bg-red-50      dark:bg-red-900/20',     text: 'text-red-700    dark:text-red-400' },
    on_leave:    { dot: 'bg-violet-500',  label: 'On Leave',   bg: 'bg-violet-50   dark:bg-violet-900/20',  text: 'text-violet-700 dark:text-violet-400' },
  };
  const cfg = map[status] ?? map['inactive'];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── ENROLLMENT MODAL ──────────────────────────────────────
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

