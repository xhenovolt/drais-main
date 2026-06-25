"use client";
/**
 * DRAIS — Bulk Enrollment Page
 *
 * Enroll multiple students at once through a unified workflow:
 *   1. Review selected students
 *   2. Choose enrollment decision (promote/continue/demote/first_time)
 *   3. Select target class, term, academic year
 *   4. Select study mode, curriculum, program
 *   5. Review and confirm bulk enrollment
 *   6. Success summary
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  GraduationCap, ArrowLeft, CheckCircle2, User, BookOpen, Calendar, Layers,
  AlertCircle, Clock, TrendingUp, TrendingDown, Minus, Award, ShieldAlert,
  BarChart2, History, Plus, Check, Loader, X as XIcon, Users, Trash2,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { fetcher } from '@/utils/fetcher';
import clsx from 'clsx';

// ──────────────────────────────────────────────────────── Types ────
interface StudentOption {
  id: number;
  first_name: string;
  last_name: string;
  admission_no?: string;
  photo_url?: string;
}

interface ClassOption { id: number; name: string; class_level?: number | null; }
interface StreamOption { id: number; name: string; class_id?: number; }
interface TermOption {
  id: number; name: string;
  academic_year_id: number; academic_year_name: string;
  start_date?: string; end_date?: string;
}

interface StudentEnrollmentData {
  id: number;
  first_name: string;
  last_name: string;
  admission_no?: string;
  previous_class?: string;
  previous_class_level?: number;
}

type Decision = 'promote' | 'continue' | 'demote' | 'first_time';

const DECISION_CFG: Record<Decision, {
  icon: React.ElementType;
  label: string;
  desc: string;
  activeBg: string;
  activeBorder: string;
  activeText: string;
  activeIcon: string;
  enrollmentType: 'new' | 'continuing' | 'repeat';
}> = {
  promote: {
    icon: TrendingUp, label: 'Promote', desc: 'Move up to next class',
    activeBg: 'bg-emerald-50 dark:bg-emerald-900/20',
    activeBorder: 'border-emerald-500',
    activeText: 'text-emerald-700 dark:text-emerald-300',
    activeIcon: 'text-emerald-600 dark:text-emerald-400',
    enrollmentType: 'continuing',
  },
  continue: {
    icon: Minus, label: 'Continue', desc: 'Same class, new term',
    activeBg: 'bg-indigo-50 dark:bg-indigo-900/20',
    activeBorder: 'border-indigo-500',
    activeText: 'text-indigo-700 dark:text-indigo-300',
    activeIcon: 'text-indigo-600 dark:text-indigo-400',
    enrollmentType: 'continuing',
  },
  demote: {
    icon: TrendingDown, label: 'Demote', desc: 'Repeat lower class',
    activeBg: 'bg-amber-50 dark:bg-amber-900/20',
    activeBorder: 'border-amber-500',
    activeText: 'text-amber-700 dark:text-amber-300',
    activeIcon: 'text-amber-600 dark:text-amber-400',
    enrollmentType: 'repeat',
  },
  first_time: {
    icon: User, label: 'First Time', desc: 'No previous enrollment',
    activeBg: 'bg-purple-50 dark:bg-purple-900/20',
    activeBorder: 'border-purple-500',
    activeText: 'text-purple-700 dark:text-purple-300',
    activeIcon: 'text-purple-600 dark:text-purple-400',
    enrollmentType: 'new',
  },
};

// ──────────────────────────────────── Step Indicator ────────────────────
function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <React.Fragment key={i}>
          <div className={clsx(
            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all',
            i + 1 < step ? 'bg-emerald-500 text-white' :
            i + 1 === step ? 'bg-indigo-600 text-white ring-4 ring-indigo-100 dark:ring-indigo-900' :
            'bg-slate-200 dark:bg-slate-700 text-slate-400',
          )}>
            {i + 1 < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
          </div>
          {i < total - 1 && (
            <div className={clsx('h-0.5 w-8', i + 1 < step ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-700')} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function BulkEnrollPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // State
  const [step, setStep] = useState(1);
  const [studentIds, setStudentIds] = useState<number[]>([]);
  const [students, setStudents] = useState<StudentEnrollmentData[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  // Enrollment selections
  const [decision, setDecision] = useState<Decision | null>(null);
  const [selectedAcademicYear, setSelectedAcademicYear] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedStream, setSelectedStream] = useState('');
  const [selectedStudyMode, setSelectedStudyMode] = useState('');
  const [selectedCurriculum, setSelectedCurriculum] = useState('');
  const [selectedProgram, setSelectedProgram] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Quick-add states
  const [isAddingStudyMode, setIsAddingStudyMode] = useState(false);
  const [newStudyModeName, setNewStudyModeName] = useState('');
  const [isSavingStudyMode, setIsSavingStudyMode] = useState(false);

  const [isAddingCurriculum, setIsAddingCurriculum] = useState(false);
  const [newCurriculumCode, setNewCurriculumCode] = useState('');
  const [newCurriculumName, setNewCurriculumName] = useState('');
  const [isSavingCurriculum, setIsSavingCurriculum] = useState(false);

  const [isAddingProgram, setIsAddingProgram] = useState(false);
  const [newProgramName, setNewProgramName] = useState('');
  const [isSavingProgram, setIsSavingProgram] = useState(false);

  // Remote data
  const { data: termData } = useSWR<any>('/api/terms/current', fetcher);
  const { data: classData } = useSWR<any>('/api/classes', fetcher);
  const { data: streamData } = useSWR<any>(
    selectedClass ? `/api/streams?class_id=${selectedClass}` : '/api/streams', fetcher,
  );
  const { data: studyModeData, mutate: mutateStudyModes } = useSWR<any>('/api/study-modes', fetcher);
  const { data: programData, mutate: mutatePrograms } = useSWR<any>('/api/programs', fetcher);
  const { data: curriculumData, mutate: mutateCurriculums } = useSWR<any>('/api/curriculums', fetcher);

  const currentTerm: TermOption | null = termData?.data?.current ?? null;
  const allTerms: TermOption[] = termData?.data?.all ?? [];
  const classes: ClassOption[] = classData?.data ?? [];
  const streams: StreamOption[] = streamData?.data ?? [];
  const studyModes: { id: number; name: string; is_default: number }[] = studyModeData?.data ?? [];
  const programs: { id: number; name: string; description?: string }[] = programData?.data ?? [];
  const curriculums: { id: number; code: string; name: string }[] = curriculumData?.data ?? [];

  const filteredTerms = selectedAcademicYear
    ? allTerms.filter(t => String(t.academic_year_id) === selectedAcademicYear)
    : allTerms;

  const academicYears = useMemo(() => Array.from(
    new Map(allTerms.map(t => [t.academic_year_id, { id: t.academic_year_id, name: t.academic_year_name }])).values()
  ), [allTerms]);

  const enrollmentType = decision ? DECISION_CFG[decision].enrollmentType : 'continuing';

  // Parse student IDs from URL
  useEffect(() => {
    const studentsParam = searchParams.get('students');
    if (!studentsParam) {
      toast.error('No students selected');
      router.push('/students/list');
      return;
    }
    const ids = studentsParam
      .split(',')
      .map(id => parseInt(id, 10))
      .filter(id => !isNaN(id));
    setStudentIds(ids);
  }, [searchParams, router]);

  // Load student details
  useEffect(() => {
    if (studentIds.length === 0) return;
    const loadStudents = async () => {
      setLoadingStudents(true);
      try {
        const responses = await Promise.all(
          studentIds.map(id =>
            fetch(`/api/students/${id}/profile`, { credentials: 'include' })
              .then(r => r.ok ? r.json() : null)
              .catch(() => null)
          )
        );
        const loaded = responses
          .filter(r => r?.success && r?.data)
          .map(r => ({
            id: r.data.student_id,
            first_name: r.data.first_name,
            last_name: r.data.last_name,
            admission_no: r.data.admission_no,
          }));
        setStudents(loaded);
        if (loaded.length === 0) {
          toast.error('No students found');
          router.push('/students/list');
        }
      } finally {
        setLoadingStudents(false);
      }
    };
    loadStudents();
  }, [studentIds, router]);

  // Auto-select current term on load
  useEffect(() => {
    if (currentTerm && !selectedTerm) {
      setSelectedTerm(String(currentTerm.id));
      setSelectedAcademicYear(String(currentTerm.academic_year_id));
    }
  }, [currentTerm]);

  // Auto-select default study mode
  useEffect(() => {
    if (studyModes.length > 0 && !selectedStudyMode) {
      const def = studyModes.find(sm => sm.is_default);
      if (def) setSelectedStudyMode(String(def.id));
    }
  }, [studyModes]);

  // Update class suggestion when decision changes
  useEffect(() => {
    if (!decision || students.length === 0 || !classes.length) return;
    if (decision === 'continue') {
      // Keep same class (will need to get from previous enrollment)
      // For now, just clear to let user select
      setSelectedClass('');
    } else if (decision === 'promote') {
      // Suggest next level
      const levels = [...new Set(classes.map(c => c.class_level ?? -99))].sort((a, b) => a - b);
      if (levels.length > 0) {
        const nextLevel = Math.max(...levels) < (levels[levels.length - 1] ?? -99)
          ? Math.max(...levels) + 1
          : levels[levels.length - 1];
        const nextClass = classes.find(c => (c.class_level ?? -99) === nextLevel);
        if (nextClass) setSelectedClass(String(nextClass.id));
      }
    } else if (decision === 'demote') {
      // Suggest lower level
      const levels = [...new Set(classes.map(c => c.class_level ?? -99))].sort((a, b) => b - a);
      if (levels.length > 0) {
        const lowerLevel = Math.min(...levels) > (levels[levels.length - 1] ?? -99)
          ? Math.min(...levels) - 1
          : levels[levels.length - 1];
        const lowerClass = classes.find(c => (c.class_level ?? -99) === lowerLevel);
        if (lowerClass) setSelectedClass(String(lowerClass.id));
      }
    }
  }, [decision, students, classes]);

  // Quick-add handlers
  const handleQuickAddStudyMode = async () => {
    const name = newStudyModeName.trim();
    if (!name) { toast.error('Study mode name is required'); return; }
    setIsSavingStudyMode(true);
    try {
      const res = await fetch('/api/study-modes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create study mode');
      await mutateStudyModes();
      setSelectedStudyMode(String(json.data.id));
      setIsAddingStudyMode(false);
      setNewStudyModeName('');
      toast.success(`Study mode "${name}" created`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to create study mode');
    } finally {
      setIsSavingStudyMode(false);
    }
  };

  const handleQuickAddCurriculum = async () => {
    const code = newCurriculumCode.trim();
    const name = newCurriculumName.trim();
    if (!code || !name) { toast.error('Code and name are required'); return; }
    setIsSavingCurriculum(true);
    try {
      const res = await fetch('/api/curriculums', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create curriculum');
      await mutateCurriculums();
      setSelectedCurriculum(String(json.id));
      setIsAddingCurriculum(false);
      setNewCurriculumCode('');
      setNewCurriculumName('');
      toast.success(`Curriculum "${name}" created`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to create curriculum');
    } finally {
      setIsSavingCurriculum(false);
    }
  };

  const handleQuickAddProgram = async () => {
    const name = newProgramName.trim();
    if (!name) { toast.error('Program name is required'); return; }
    setIsSavingProgram(true);
    try {
      const res = await fetch('/api/programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create program');
      await mutatePrograms();
      setSelectedProgram(String(json.data.id));
      setIsAddingProgram(false);
      setNewProgramName('');
      toast.success(`Program "${name}" created`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to create program');
    } finally {
      setIsSavingProgram(false);
    }
  };

  // Bulk enrollment submit
  const handleBulkEnroll = useCallback(async () => {
    if (!selectedClass || !selectedTerm || !selectedAcademicYear || !decision) {
      toast.error('Please complete all required fields');
      return;
    }
    if (!selectedStudyMode) {
      toast.error('Study mode is required');
      setStep(3);
      return;
    }
    if (!selectedCurriculum) {
      toast.error('Curriculum is required');
      setStep(3);
      return;
    }
    if (!selectedProgram) {
      toast.error('Program is required');
      setStep(4);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/enrollments/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'multiple_students',
          student_ids: students.map(s => s.id),
          class_id: parseInt(selectedClass),
          stream_id: selectedStream ? parseInt(selectedStream) : null,
          academic_year_id: parseInt(selectedAcademicYear),
          term_id: parseInt(selectedTerm),
          study_mode_id: parseInt(selectedStudyMode),
          curriculum_id: parseInt(selectedCurriculum),
          program_id: parseInt(selectedProgram),
          enrollment_type: enrollmentType,
          close_previous: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Enrollment failed');
      toast.success(`${data.data?.successful ?? 0} students enrolled successfully!`);
      setStep(6);
    } catch (err: any) {
      toast.error(err.message || 'Enrollment failed');
    } finally {
      setSubmitting(false);
    }
  }, [students, selectedClass, selectedStream, selectedAcademicYear, selectedTerm,
      selectedStudyMode, selectedCurriculum, selectedProgram, enrollmentType, decision]);

  const TOTAL_STEPS = 5;
  const STEP_LABELS = ['Review Students', 'Decision & Class', 'Mode & Curriculum', 'Program', 'Confirm'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/students/list')}
            className="p-2 rounded-lg hover:bg-white/20 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-700 dark:text-white" />
          </button>
          <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg">
            <Users className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Bulk Enrollment</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Enroll {students.length} student{students.length !== 1 ? 's' : ''} at once</p>
          </div>
        </div>

        {/* Step indicator */}
        {step < 6 && (
          <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm">
            <StepIndicator step={step} total={TOTAL_STEPS} />
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{STEP_LABELS[step - 1]}</span>
          </div>
        )}

        {loadingStudents ? (
          <div className="text-center py-20">
            <Loader className="w-10 h-10 animate-spin text-indigo-600 mx-auto mb-3" />
            <p className="text-slate-500 dark:text-slate-400">Loading student details...</p>
          </div>
        ) : students.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-2xl">
            <AlertCircle className="w-10 h-10 text-amber-600 mx-auto mb-3" />
            <p className="text-slate-600 dark:text-slate-300 font-medium">No students loaded</p>
            <Link href="/students/list" className="text-sm text-indigo-600 hover:underline mt-2 inline-block">
              Return to student list
            </Link>
          </div>
        ) : (
          <div className="space-y-4">

            {/* STEP 1: Review Students */}
            {step === 1 && (
              <div className="card-glass p-6 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-5 h-5 text-indigo-500" />
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Review Selected Students</h2>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {students.length} student{students.length !== 1 ? 's' : ''} selected for bulk enrollment. All will be enrolled together.
                </p>

                {/* Student list */}
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {students.map(student => (
                    <div
                      key={student.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-600"
                    >
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-slate-800 dark:text-white truncate">
                          {student.first_name} {student.last_name}
                        </p>
                        {student.admission_no && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">#{student.admission_no}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setStep(2)}
                    className="btn-primary px-6 py-2 rounded-xl text-sm flex items-center gap-2"
                  >
                    Continue <ArrowLeft className="w-4 h-4 rotate-180" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Decision & Class & Term */}
            {step === 2 && (
              <div className="card-glass p-6 space-y-5">
                <div className="flex items-center gap-2 mb-1">
                  <BarChart2 className="w-5 h-5 text-indigo-500" />
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Enrollment Decision</h2>
                </div>

                {/* Decision panel */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                    Academic Decision <span className="text-rose-500">*</span>
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(Object.keys(DECISION_CFG) as Decision[]).map(key => {
                      const cfg = DECISION_CFG[key];
                      const Icon = cfg.icon;
                      const active = decision === key;
                      return (
                        <button
                          key={key}
                          onClick={() => setDecision(key)}
                          className={clsx(
                            'flex flex-col items-center text-center py-3.5 px-2 rounded-2xl border-2 transition-all',
                            active
                              ? `${cfg.activeBg} ${cfg.activeBorder}`
                              : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-indigo-200 dark:hover:border-indigo-700',
                          )}
                        >
                          <Icon className={clsx('w-5 h-5 mb-1.5', active ? cfg.activeIcon : 'text-slate-400')} />
                          <span className={clsx('text-xs font-bold', active ? cfg.activeText : 'text-slate-600 dark:text-slate-400')}>{cfg.label}</span>
                          <span className="text-[10px] text-slate-400 mt-0.5 leading-tight">{cfg.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                  {!decision && (
                    <p className="text-xs text-rose-500 mt-1.5">Please select a decision to continue.</p>
                  )}
                </div>

                {/* Class / Term / Year / Stream */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                  {currentTerm && (
                    <div className="sm:col-span-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 text-xs text-emerald-700 dark:text-emerald-400">
                      <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                      Current term auto-selected: <strong className="ml-1">{currentTerm.academic_year_name} · {currentTerm.name}</strong>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Academic Year <span className="text-rose-500">*</span></label>
                    <select value={selectedAcademicYear} onChange={e => { setSelectedAcademicYear(e.target.value); setSelectedTerm(''); }}
                      className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition">
                      <option value="">Select year…</option>
                      {academicYears.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Term <span className="text-rose-500">*</span></label>
                    <select value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition">
                      <option value="">Select term…</option>
                      {filteredTerms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                      Class <span className="text-rose-500">*</span>
                    </label>
                    <select value={selectedClass} onChange={e => { setSelectedClass(e.target.value); setSelectedStream(''); }}
                      className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition">
                      <option value="">Select class…</option>
                      {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Stream <span className="text-slate-400 font-normal">(optional)</span></label>
                    <select value={selectedStream} onChange={e => setSelectedStream(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition">
                      <option value="">No stream</option>
                      {streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="flex justify-between pt-2">
                  <button onClick={() => setStep(1)} className="btn-secondary px-5 py-2 rounded-xl text-sm">Back</button>
                  <button
                    onClick={() => setStep(3)}
                    disabled={!selectedTerm || !selectedClass || !selectedAcademicYear || !decision}
                    className="btn-primary px-6 py-2 rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    Next <ArrowLeft className="w-4 h-4 rotate-180" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Study Mode + Curriculum */}
            {step === 3 && (
              <div className="card-glass p-6 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Layers className="w-5 h-5 text-indigo-500" />
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Study Mode & Curriculum</h2>
                </div>

                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-700 text-xs text-rose-700 dark:text-rose-400 font-semibold">
                  <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                  Both study mode and curriculum are <strong className="mx-1">required</strong>. Enrollment is blocked without them.
                </div>

                {/* Study Mode Section */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                    Study Mode <span className="text-rose-500">*</span>
                  </p>

                  {studyModes.length === 0 && !isAddingStudyMode ? (
                    <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 flex items-center justify-between">
                      <p className="text-sm text-amber-700 dark:text-amber-400">No study modes configured yet.</p>
                      <button onClick={() => setIsAddingStudyMode(true)}
                        className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:underline">
                        <Plus className="w-4 h-4" /> Add Study Mode
                      </button>
                    </div>
                  ) : isAddingStudyMode ? (
                    <div className="flex items-center gap-2 mb-2">
                      <input autoFocus value={newStudyModeName}
                        onChange={e => setNewStudyModeName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleQuickAddStudyMode(); if (e.key === 'Escape') { setIsAddingStudyMode(false); setNewStudyModeName(''); } }}
                        placeholder="e.g. Day, Boarding…"
                        className="flex-1 px-3 py-2 text-sm border rounded-xl border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-800 text-slate-800 dark:text-white"
                        disabled={isSavingStudyMode} />
                      <button onClick={handleQuickAddStudyMode} disabled={isSavingStudyMode || !newStudyModeName.trim()}
                        className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 transition-colors">
                        {isSavingStudyMode ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      </button>
                      <button onClick={() => { setIsAddingStudyMode(false); setNewStudyModeName(''); }}
                        className="p-2 rounded-xl text-slate-400 hover:text-slate-600 transition-colors">
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {studyModes.map(sm => {
                          const active = selectedStudyMode === String(sm.id);
                          return (
                            <button
                              key={sm.id}
                              onClick={() => setSelectedStudyMode(String(sm.id))}
                              className={clsx(
                                'relative py-4 px-4 rounded-2xl border-2 text-sm font-semibold transition-all text-left',
                                active
                                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 shadow-md'
                                  : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-indigo-300',
                              )}
                            >
                              {active && <CheckCircle2 className="w-4 h-4 text-indigo-500 absolute top-2.5 right-2.5" />}
                              <span className="block">{sm.name}</span>
                              {sm.is_default ? <span className="block text-[10px] font-normal text-slate-400 mt-0.5">Default</span> : null}
                            </button>
                          );
                        })}
                      </div>
                      <button onClick={() => setIsAddingStudyMode(true)}
                        className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 transition-colors mt-2">
                        <Plus className="w-3.5 h-3.5" /> Add study mode
                      </button>
                    </>
                  )}
                </div>

                {/* Curriculum Section */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-700/60">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                    Curriculum <span className="text-rose-500">*</span>
                  </p>

                  {curriculums.length === 0 && !isAddingCurriculum ? (
                    <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 flex items-center justify-between">
                      <p className="text-sm text-amber-700 dark:text-amber-400">No curriculums configured yet.</p>
                      <button onClick={() => setIsAddingCurriculum(true)}
                        className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:underline">
                        <Plus className="w-4 h-4" /> Add Curriculum
                      </button>
                    </div>
                  ) : isAddingCurriculum ? (
                    <div className="space-y-2 mb-2">
                      <div className="flex items-center gap-2">
                        <input autoFocus value={newCurriculumCode}
                          onChange={e => setNewCurriculumCode(e.target.value)}
                          placeholder="Code (e.g. UNEB)"
                          className="w-24 px-3 py-2 text-sm border rounded-xl border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-800 text-slate-800 dark:text-white"
                          disabled={isSavingCurriculum} />
                        <input value={newCurriculumName}
                          onChange={e => setNewCurriculumName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleQuickAddCurriculum(); if (e.key === 'Escape') { setIsAddingCurriculum(false); setNewCurriculumCode(''); setNewCurriculumName(''); } }}
                          placeholder="Name (e.g. National Curriculum)"
                          className="flex-1 px-3 py-2 text-sm border rounded-xl border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-800 text-slate-800 dark:text-white"
                          disabled={isSavingCurriculum} />
                        <button onClick={handleQuickAddCurriculum} disabled={isSavingCurriculum || !newCurriculumCode.trim() || !newCurriculumName.trim()}
                          className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 transition-colors">
                          {isSavingCurriculum ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        </button>
                        <button onClick={() => { setIsAddingCurriculum(false); setNewCurriculumCode(''); setNewCurriculumName(''); }}
                          className="p-2 rounded-xl text-slate-400 hover:text-slate-600 transition-colors">
                          <XIcon className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-xs text-slate-400">Press Enter to save · Esc to cancel</p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {curriculums.map(cur => {
                          const active = selectedCurriculum === String(cur.id);
                          return (
                            <button
                              key={cur.id}
                              onClick={() => setSelectedCurriculum(String(cur.id))}
                              className={clsx(
                                'relative py-4 px-4 rounded-2xl border-2 text-sm font-semibold transition-all text-left',
                                active
                                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 shadow-md'
                                  : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-emerald-300',
                              )}
                            >
                              {active && <CheckCircle2 className="w-4 h-4 text-emerald-500 absolute top-2.5 right-2.5" />}
                              <span className="block">{cur.name}</span>
                              <span className="block text-[10px] font-normal text-slate-400 mt-0.5">{cur.code}</span>
                            </button>
                          );
                        })}
                      </div>
                      <button onClick={() => setIsAddingCurriculum(true)}
                        className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 transition-colors mt-2">
                        <Plus className="w-3.5 h-3.5" /> Add curriculum
                      </button>
                    </>
                  )}
                </div>

                <div className="flex justify-between pt-2">
                  <button onClick={() => setStep(2)} className="btn-secondary px-5 py-2 rounded-xl text-sm">Back</button>
                  <button
                    onClick={() => {
                      if (!selectedStudyMode && studyModes.length > 0) {
                        toast.error('Study mode is required — select one to continue');
                        return;
                      }
                      if (!selectedCurriculum && curriculums.length > 0) {
                        toast.error('Curriculum is required — select one to continue');
                        return;
                      }
                      setStep(4);
                    }}
                    disabled={studyModes.length === 0 || curriculums.length === 0}
                    className="btn-primary px-6 py-2 rounded-xl text-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next <ArrowLeft className="w-4 h-4 rotate-180" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: Program */}
            {step === 4 && (
              <div className="card-glass p-6 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <BookOpen className="w-5 h-5 text-indigo-500" />
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Program</h2>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Select the academic program for all {students.length} student{students.length !== 1 ? 's' : ''}.
                </p>

                {programs.length === 0 && !isAddingProgram ? (
                  <div className="flex flex-col items-start gap-3 py-2">
                    <p className="text-sm text-slate-400 italic">No programs configured yet.</p>
                    <button
                      onClick={() => setIsAddingProgram(true)}
                      className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:underline"
                    >
                      <Plus className="w-4 h-4" /> Quick Add Program
                    </button>
                  </div>
                ) : isAddingProgram ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={newProgramName}
                        onChange={e => setNewProgramName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleQuickAddProgram(); if (e.key === 'Escape') { setIsAddingProgram(false); setNewProgramName(''); } }}
                        placeholder="e.g. Secular Studies, Tahfiz..."
                        className="flex-1 px-3 py-2 text-sm border rounded-xl border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-800 text-slate-800 dark:text-white"
                        disabled={isSavingProgram}
                      />
                      <button
                        onClick={handleQuickAddProgram}
                        disabled={isSavingProgram || !newProgramName.trim()}
                        className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 transition-colors"
                      >
                        {isSavingProgram ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => { setIsAddingProgram(false); setNewProgramName(''); }}
                        className="p-2 rounded-xl text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs text-slate-400">Press Enter to save · Esc to cancel</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {programs.map(prog => {
                      const active = selectedProgram === String(prog.id);
                      return (
                        <button key={prog.id} onClick={() => setSelectedProgram(String(prog.id))}
                          className={clsx(
                            'w-full flex items-start gap-3 p-4 rounded-2xl border-2 text-left transition-all',
                            active ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-indigo-200',
                          )}>
                          <div className={clsx(
                            'w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center',
                            active ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300 dark:border-slate-500',
                          )}>
                            {active && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-slate-800 dark:text-white">{(prog as any).display_name || prog.name}</p>
                            {prog.description && <p className="text-xs text-slate-400 mt-0.5">{prog.description}</p>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {programs.length > 0 && !isAddingProgram && (
                  <div className="mt-2">
                    <button
                      onClick={() => setIsAddingProgram(true)}
                      className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add another program
                    </button>
                  </div>
                )}

                <div className="flex justify-between pt-2">
                  <button onClick={() => setStep(3)} className="btn-secondary px-5 py-2 rounded-xl text-sm">Back</button>
                  <button
                    onClick={() => {
                      if (!selectedProgram && programs.length > 0) {
                        toast.error('Please select a program to continue');
                        return;
                      }
                      if (programs.length === 0 && !isAddingProgram) {
                        toast.error('Please add at least one program');
                        return;
                      }
                      setStep(5);
                    }}
                    className="btn-primary px-6 py-2 rounded-xl text-sm flex items-center gap-2"
                  >
                    Review <ArrowLeft className="w-4 h-4 rotate-180" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 5: Confirm */}
            {step === 5 && (
              <div className="card-glass p-6 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Confirm Bulk Enrollment</h2>
                </div>

                <div className="rounded-2xl bg-slate-50 dark:bg-slate-700/50 p-5 space-y-3">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-600">
                    <span className="text-sm text-slate-600 dark:text-slate-300">Students to enroll:</span>
                    <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{students.length}</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-300">Decision:</span>
                      <span className={clsx(
                        'capitalize px-2 py-0.5 rounded-lg text-xs font-bold',
                        decision === 'promote' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
                        decision === 'demote' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                        decision === 'first_time' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' :
                        'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
                      )}>{decision?.replace('_', ' ')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-300">Academic Year:</span>
                      <span className="font-semibold text-slate-800 dark:text-white">{academicYears.find(y => String(y.id) === selectedAcademicYear)?.name ?? '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-300">Term:</span>
                      <span className="font-semibold text-slate-800 dark:text-white">{allTerms.find(t => String(t.id) === selectedTerm)?.name ?? '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-300">Class:</span>
                      <span className="font-semibold text-slate-800 dark:text-white">{classes.find(c => String(c.id) === selectedClass)?.name ?? '—'}</span>
                    </div>
                    {selectedStream && (
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-300">Stream:</span>
                        <span className="font-semibold text-slate-800 dark:text-white">{streams.find(s => String(s.id) === selectedStream)?.name ?? '—'}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-300">Study Mode:</span>
                      <span className="font-semibold text-slate-800 dark:text-white">{studyModes.find(sm => String(sm.id) === selectedStudyMode)?.name ?? '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-300">Curriculum:</span>
                      <span className="font-semibold text-slate-800 dark:text-white">{curriculums.find(c => String(c.id) === selectedCurriculum)?.name ?? '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-300">Program:</span>
                      <span className="font-semibold text-slate-800 dark:text-white">{programs.find(p => String(p.id) === selectedProgram)?.name ?? '—'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 text-xs text-blue-700 dark:text-blue-400">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  All students' previous active enrollments will be closed and marked as completed.
                </div>

                <div className="flex justify-between pt-2">
                  <button onClick={() => setStep(4)} className="btn-secondary px-5 py-2 rounded-xl text-sm">Back</button>
                  <button
                    onClick={handleBulkEnroll}
                    disabled={submitting}
                    className="btn-primary px-6 py-2 rounded-xl text-sm flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {submitting
                      ? <><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" /> Enrolling {students.length}…</>
                      : <>Enroll All {students.length} <CheckCircle2 className="w-4 h-4" /></>
                    }
                  </button>
                </div>
              </div>
            )}

            {/* STEP 6: Success */}
            {step === 6 && (
              <div className="card-glass p-8 text-center space-y-5">
                <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">Bulk Enrollment Complete!</h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  All <strong>{students.length}</strong> students have been successfully enrolled in{" "}
                  <strong>{classes.find(c => String(c.id) === selectedClass)?.name}</strong>.
                </p>
                <div className="flex flex-wrap gap-3 justify-center">
                  <button
                    onClick={() => router.push('/students/list')}
                    className="btn-primary px-5 py-2 rounded-xl text-sm"
                  >
                    Return to Student List
                  </button>
                  <button
                    onClick={() => router.push('/students/enrollments')}
                    className="btn-secondary px-5 py-2 rounded-xl text-sm"
                  >
                    View Enrollments
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
