"use client";
/**
 * DRAIS — Enrollment Page (Phase 6+)
 *
 * Informed academic enrollment:
 *   1. Select student
 *   2. View previous academic context → choose Promote / Continue / Demote
 *   3. Study mode (REQUIRED — blocks enrollment if missing)
 *   4. Programs (multi-select, pre-filled from previous enrollment)
 *   5. Confirm (with Previous vs New comparison)
 *   6. Success
 *
 * Bulk class promotion is available via the Bulk Promotion tab.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/components/i18n/I18nProvider';
import {
  GraduationCap, Search, CheckCircle2,
  User, BookOpen, Calendar, Layers, ArrowRight, Users,
  RotateCcw, AlertCircle, Clock, TrendingUp, TrendingDown,
  Minus, Award, ShieldAlert, BarChart2, History,
  Plus, Check, Loader, X as XIcon,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { fetcher } from '@/utils/fetcher';
import clsx from 'clsx';

// ──────────────────────────────────────────────────────────── Types ────
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
interface PreviousEnrollment {
  enrollment_id: number;
  academic_year_id: number; academic_year_name: string;
  term_id: number; term_name: string;
  class_id: number; class_name: string; class_level?: number | null;
  stream_id?: number; stream_name?: string;
  study_mode_id?: number; study_mode_name?: string;
  curriculum_id?: number; curriculum_name?: string;
  program_id?: number; program_name?: string;
  enrollment_type?: string; status: string;
  programs: { id: number; name: string }[];
  results_summary?: {
    result_count: number;
    avg_score: number | null;
    max_score: number | null;
    min_score: number | null;
    passed_count: number;
  } | null;
  top_subjects?: { subject_name: string; score: number; grade: string }[];
}
type Decision = 'promote' | 'continue' | 'demote' | 'first_time';

// Decision config — explicit class strings so Tailwind JIT picks them up
const DECISION_CFG: Record<Decision, {
  icon: React.ElementType;
  activeBg: string;
  activeBorder: string;
  activeText: string;
  activeIcon: string;
  enrollmentType: 'new' | 'continuing' | 'repeat';
}> = {
  promote: {
    icon: TrendingUp,
    activeBg: 'bg-emerald-50 dark:bg-emerald-900/20',
    activeBorder: 'border-emerald-500',
    activeText: 'text-emerald-700 dark:text-emerald-300',
    activeIcon: 'text-emerald-600 dark:text-emerald-400',
    enrollmentType: 'continuing',
  },
  continue: {
    icon: Minus,
    activeBg: 'bg-indigo-50 dark:bg-indigo-900/20',
    activeBorder: 'border-indigo-500',
    activeText: 'text-indigo-700 dark:text-indigo-300',
    activeIcon: 'text-indigo-600 dark:text-indigo-400',
    enrollmentType: 'continuing',
  },
  demote: {
    icon: TrendingDown,
    activeBg: 'bg-amber-50 dark:bg-amber-900/20',
    activeBorder: 'border-amber-500',
    activeText: 'text-amber-700 dark:text-amber-300',
    activeIcon: 'text-amber-600 dark:text-amber-400',
    enrollmentType: 'repeat',
  },
  first_time: {
    icon: User,
    activeBg: 'bg-purple-50 dark:bg-purple-900/20',
    activeBorder: 'border-purple-500',
    activeText: 'text-purple-700 dark:text-purple-300',
    activeIcon: 'text-purple-600 dark:text-purple-400',
    enrollmentType: 'new',
  },
};

// ──────────────────────────────────── Step Indicator ────────────────────
function StepIndicator({ step, total }: { step: number; total: number }) {
  const { digits } = useI18n();
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
            {i + 1 < step ? <CheckCircle2 className="w-4 h-4" /> : digits(i + 1)}
          </div>
          {i < total - 1 && (
            <div className={clsx('h-0.5 w-8', i + 1 < step ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-700')} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─────────────────────────────── Student Search Picker ──────────────────
function StudentPicker({
  value, onChange,
}: { value: StudentOption | null; onChange: (s: StudentOption | null) => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const { data } = useSWR<any>(
    q.length >= 2 ? `/api/students/full?q=${encodeURIComponent(q)}&limit=10` : null,
    fetcher,
  );
  const results: StudentOption[] = data?.data ?? [];

  return (
    <div className="relative">
      {value ? (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-300 dark:border-indigo-600">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold">
            {value.first_name[0]}{value.last_name[0]}
          </div>
          <div className="flex-1">
            <p className="font-semibold text-slate-800 dark:text-white">{value.first_name} {value.last_name}</p>
            <p className="text-xs text-slate-500">{value.admission_no ?? t('students.enroll.noAdmNo')}</p>
          </div>
          <button onClick={() => onChange(null)} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium">{t('students.enroll.change')}</button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text" value={q}
              onChange={e => { setQ(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              placeholder={t('students.enroll.searchPlaceholder')}
              className="w-full ps-10 pe-4 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>
          {open && results.length > 0 && (
            <div className="absolute z-30 w-full mt-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden max-h-60 overflow-y-auto">
              {results.map(s => (
                <button key={s.id} onClick={() => { onChange(s); setOpen(false); setQ(''); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-start transition-colors">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {s.first_name[0]}{s.last_name[0]}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-white">{s.first_name} {s.last_name}</p>
                    <p className="text-xs text-slate-400">{s.admission_no ?? t('students.enroll.noAdmNo')}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {open && q.length >= 2 && results.length === 0 && (
            <div className="absolute z-30 w-full mt-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl p-4 text-center">
              <p className="text-sm text-slate-500">{t('students.enroll.noneFound')}{' '}<Link href="/students/admit" className="text-indigo-600 hover:underline">{t('students.enroll.admitNewQuestion')}</Link></p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ──────────────────────────── Previous Context Banner ───────────────────
function PreviousContextBanner({ prev, loading }: { prev: PreviousEnrollment | null; loading: boolean }) {
  const { t, rich, digits } = useI18n();
  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-800/60 p-4 animate-pulse space-y-2">
        <div className="h-3 w-40 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-3 w-2/3 rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-3 w-1/2 rounded bg-slate-100 dark:bg-slate-800" />
      </div>
    );
  }
  if (!prev) {
    return (
      <div className="rounded-2xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3.5">
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm font-semibold">
          <History className="w-4 h-4 flex-shrink-0" />
          {t('students.enroll.prev.none')}
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-indigo-200 dark:border-indigo-700 bg-indigo-50/60 dark:bg-indigo-900/20 p-4 space-y-3">
      <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-[11px] font-bold uppercase tracking-wide">
        <History className="w-3.5 h-3.5" /> {t('students.enroll.prev.title')}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
        <CItem label={t('students.enroll.field.class')} value={prev.class_name} />
        <CItem label={t('students.enroll.field.academicYear')} value={prev.academic_year_name} />
        <CItem label={t('students.enroll.field.term')} value={prev.term_name} />
        <CItem label={t('students.enroll.field.studyMode')} value={prev.study_mode_name ?? '—'} />
        <CItem label={t('students.enroll.field.curriculum')} value={prev.curriculum_name ?? '—'} />
        <CItem label={t('students.enroll.field.program')} value={prev.program_name ?? '—'} />
        <CItem label={t('students.enroll.field.status')} value={
          <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-bold uppercase',
            prev.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400')}>{t(`students.enroll.status.${prev.status}`, String(prev.status ?? ''))}</span>
        } />
        {prev.programs.length > 0 && (
          <CItem label={t('students.enroll.field.programs')} value={prev.programs.map(p => (p as any).display_name || p.name).join(', ')} />
        )}
      </div>
      {prev.results_summary && (prev.results_summary.result_count ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 border-t border-indigo-100 dark:border-indigo-800">
          <div className="flex items-center gap-1.5 text-xs text-indigo-700 dark:text-indigo-300">
            <Award className="w-3.5 h-3.5" />
            <span>{rich('students.enroll.prev.subjectCount', { n: <strong>{digits(prev.results_summary.result_count)}</strong> }, { count: prev.results_summary.result_count })}</span>
          </div>
          {prev.results_summary.avg_score != null && (
            <span className="text-xs text-indigo-600 dark:text-indigo-400">{rich('students.enroll.prev.avg', { value: <strong>{digits(prev.results_summary.avg_score)}</strong> })}</span>
          )}
          {prev.results_summary.max_score != null && (
            <span className="text-xs text-indigo-600 dark:text-indigo-400">{rich('students.enroll.prev.best', { value: <strong>{digits(prev.results_summary.max_score)}</strong> })}</span>
          )}
          {prev.results_summary.passed_count != null && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">{rich('students.enroll.prev.passed', { value: <strong>{digits(prev.results_summary.passed_count)}</strong> })}</span>
          )}
        </div>
      )}
      {prev.top_subjects && prev.top_subjects.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {prev.top_subjects.map((s, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white dark:bg-slate-700 border border-indigo-100 dark:border-indigo-700 text-slate-600 dark:text-slate-300">
              {s.subject_name}: <strong>{digits(s.score)}</strong>{s.grade ? ` (${s.grade})` : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500 block">{label}</span>
      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{value}</span>
    </div>
  );
}

// ─────────────────────────────── Summary Row ────────────────────────────
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between text-sm gap-4">
      <span className="text-slate-500 dark:text-slate-400 flex-shrink-0">{label}</span>
      <span className="font-semibold text-slate-800 dark:text-white text-end">{value}</span>
    </div>
  );
}

// ─────────────────────────────────── Main Page ──────────────────────────
export default function EnrollStudentPage() {
  const router = useRouter();
  const { t, rich, digits } = useI18n();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<'single' | 'bulk'>('single');

  // Single enrollment state
  const [step, setStep] = useState(1);
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);
  const [previousEnrollment, setPreviousEnrollment] = useState<PreviousEnrollment | null>(null);
  const [previousEnrollmentLoading, setPreviousEnrollmentLoading] = useState(false);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [selectedAcademicYear, setSelectedAcademicYear] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedStream, setSelectedStream] = useState('');
  const [selectedStudyMode, setSelectedStudyMode] = useState('');
  const [studyModeError, setStudyModeError] = useState(false);
  const [selectedCurriculum, setSelectedCurriculum] = useState('');
  const [selectedProgram, setSelectedProgram] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Inline Quick-Add program
  const [isAddingProgram, setIsAddingProgram] = useState(false);
  const [newProgramName, setNewProgramName] = useState('');
  const [isSavingProgram, setIsSavingProgram] = useState(false);

  // Inline Quick-Add curriculum
  const [isAddingCurriculum, setIsAddingCurriculum] = useState(false);
  const [newCurriculumCode, setNewCurriculumCode] = useState('');
  const [newCurriculumName, setNewCurriculumName] = useState('');
  const [isSavingCurriculum, setIsSavingCurriculum] = useState(false);

  // Inline Quick-Add study mode
  const [isAddingStudyMode, setIsAddingStudyMode] = useState(false);
  const [newStudyModeName, setNewStudyModeName] = useState('');
  const [isSavingStudyMode, setIsSavingStudyMode] = useState(false);

  // Bulk mode state
  const [bulkFromClass, setBulkFromClass] = useState('');
  const [bulkToClass, setBulkToClass] = useState('');
  const [bulkAcademicYear, setBulkAcademicYear] = useState('');
  const [bulkTerm, setBulkTerm] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

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
  const termContext: any = termData?.data?.context ?? null;
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

  // ── Pre-populate student from ?student_id= URL param ────────────────────
  useEffect(() => {
    const preId = searchParams.get('student_id');
    if (!preId || selectedStudent) return;
    fetch(`/api/students/${preId}/profile`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.success && d.data) {
          setSelectedStudent({
            id: d.data.student_id,
            first_name: d.data.first_name,
            last_name: d.data.last_name,
            admission_no: d.data.admission_no,
            photo_url: d.data.photo_url,
          });
          setStep(2);
        }
      })
      .catch(() => {});
  }, [searchParams]);

  // ── Auto-select current term on load ────────────────────────────────────
  useEffect(() => {
    if (currentTerm && !selectedTerm) {
      setSelectedTerm(String(currentTerm.id));
      setSelectedAcademicYear(String(currentTerm.academic_year_id));
      setBulkTerm(String(currentTerm.id));
      setBulkAcademicYear(String(currentTerm.academic_year_id));
    }
  }, [currentTerm]);

  // ── Fetch previous enrollment when student is selected ──────────────────
  useEffect(() => {
    if (!selectedStudent) {
      setPreviousEnrollment(null);
      setDecision(null);
      return;
    }
    setPreviousEnrollmentLoading(true);
    fetch(`/api/students/${selectedStudent.id}/previous-enrollment`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.success) return;
        const prev: PreviousEnrollment | null = d.data;
        setPreviousEnrollment(prev);
        setDecision(prev ? 'continue' : 'first_time');
        if (prev?.study_mode_id) {
          setSelectedStudyMode(String(prev.study_mode_id));
        }
        if (prev?.curriculum_id) {
          setSelectedCurriculum(String(prev.curriculum_id));
        }
        if (prev?.program_id) {
          setSelectedProgram(String(prev.program_id));
        } else if (prev?.programs?.length) {
          setSelectedProgram(String(prev.programs[0].id));
        }
        if (prev?.class_id) {
          setSelectedClass(String(prev.class_id));
        }
      })
      .catch(() => {})
      .finally(() => setPreviousEnrollmentLoading(false));
  }, [selectedStudent]);

  // ── Auto-select default study mode when modes load (nothing selected yet) ─
  useEffect(() => {
    if (studyModes.length > 0 && !selectedStudyMode) {
      const def = studyModes.find(sm => sm.is_default);
      if (def) setSelectedStudyMode(String(def.id));
    }
  }, [studyModes]);

  // ── Update class suggestion when decision changes ────────────────────────
  useEffect(() => {
    if (!decision || !previousEnrollment || !classes.length) return;
    if (decision === 'continue') {
      setSelectedClass(String(previousEnrollment.class_id));
    } else if (decision === 'promote') {
      const nextClass = classes.find(
        c => (c.class_level ?? -99) === (previousEnrollment.class_level ?? -99) + 1
      );
      if (nextClass) setSelectedClass(String(nextClass.id));
    } else if (decision === 'demote') {
      const lowerClass = classes.find(
        c => (c.class_level ?? -99) === (previousEnrollment.class_level ?? -99) - 1
      );
      if (lowerClass) setSelectedClass(String(lowerClass.id));
    }
  }, [decision, previousEnrollment, classes]);

  // ── Single enrollment submit ─────────────────────────────────────────────
  const handleEnroll = useCallback(async () => {
    if (!selectedStudent || !selectedClass || !selectedTerm || !selectedAcademicYear || !decision) {
      toast.error(t('students.enroll.toast.completeRequired'));
      return;
    }
    if (!selectedStudyMode) {
      toast.error(t('students.enroll.toast.studyModeRequired'));
      setStudyModeError(true);
      setStep(3);
      return;
    }
    if (!selectedCurriculum) {
      toast.error(t('students.enroll.toast.curriculumRequired'));
      setStep(3);
      return;
    }
    if (!selectedProgram) {
      toast.error(t('students.enroll.toast.programRequired'));
      setStep(4);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/enrollments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: selectedStudent.id,
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
      if (!res.ok) throw new Error(data.message || data.error || t('students.enroll.toast.enrollFailed'));
      toast.success(t('students.enroll.toast.enrolled', { name: selectedStudent.first_name }));
      setStep(6);
    } catch (err: any) {
      toast.error(err.message || t('students.enroll.toast.enrollFailed'));
    } finally {
      setSubmitting(false);
    }
  }, [selectedStudent, selectedClass, selectedStream, selectedAcademicYear, selectedTerm,
      selectedStudyMode, selectedCurriculum, selectedProgram, enrollmentType, decision, t]);

  // ── Bulk promote submit ──────────────────────────────────────────────────
  const handleBulkPromote = useCallback(async () => {
    if (!bulkFromClass || !bulkToClass || !bulkAcademicYear) {
      toast.error(t('students.enroll.toast.bulkRequired'));
      return;
    }
    setBulkSubmitting(true);
    try {
      const res = await fetch('/api/enrollments/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'promote',
          from_class_id: parseInt(bulkFromClass),
          to_class_id: parseInt(bulkToClass),
          academic_year_id: parseInt(bulkAcademicYear),
          term_id: bulkTerm ? parseInt(bulkTerm) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('students.enroll.toast.promoteFailed'));
      toast.success(t('students.enroll.toast.promoted', { count: data.data?.enrolled ?? 0 }));
      router.push('/students/list');
    } catch (err: any) {
      toast.error(err.message || t('students.enroll.toast.promoteFailed'));
    } finally {
      setBulkSubmitting(false);
    }
  }, [bulkFromClass, bulkToClass, bulkAcademicYear, bulkTerm, router, t]);

  const handleQuickAddProgram = async () => {
    const name = newProgramName.trim();
    if (!name) { toast.error(t('students.enroll.toast.programNameRequired')); return; }
    setIsSavingProgram(true);
    try {
      const res = await fetch('/api/programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t('students.enroll.toast.programCreateFailed'));
      // Optimistic: refresh list and auto-select new program
      await mutatePrograms();
      setSelectedProgram(String(json.data.id));
      setIsAddingProgram(false);
      setNewProgramName('');
      toast.success(t('students.enroll.toast.programCreated', { name }));
    } catch (e: any) {
      toast.error(e.message || t('students.enroll.toast.programCreateFailed'));
    } finally {
      setIsSavingProgram(false);
    }
  };

  const handleQuickAddCurriculum = async () => {
    const code = newCurriculumCode.trim();
    const name = newCurriculumName.trim();
    if (!code || !name) { toast.error(t('students.enroll.toast.codeNameRequired')); return; }
    setIsSavingCurriculum(true);
    try {
      const res = await fetch('/api/curriculums', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t('students.enroll.toast.curriculumCreateFailed'));
      await mutateCurriculums();
      setSelectedCurriculum(String(json.id));
      setIsAddingCurriculum(false);
      setNewCurriculumCode('');
      setNewCurriculumName('');
      toast.success(t('students.enroll.toast.curriculumCreated', { name }));
    } catch (e: any) {
      toast.error(e.message || t('students.enroll.toast.curriculumCreateFailed'));
    } finally {
      setIsSavingCurriculum(false);
    }
  };

  const handleQuickAddStudyMode = async () => {
    const name = newStudyModeName.trim();
    if (!name) { toast.error(t('students.enroll.toast.studyModeNameRequired')); return; }
    setIsSavingStudyMode(true);
    try {
      const res = await fetch('/api/study-modes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t('students.enroll.toast.studyModeCreateFailed'));
      await mutateStudyModes();
      setSelectedStudyMode(String(json.data.id));
      setIsAddingStudyMode(false);
      setNewStudyModeName('');
      toast.success(t('students.enroll.toast.studyModeCreated', { name }));
    } catch (e: any) {
      toast.error(e.message || t('students.enroll.toast.studyModeCreateFailed'));
    } finally {
      setIsSavingStudyMode(false);
    }
  };

  const resetSingle = () => {
    setStep(1);
    setSelectedStudent(null);
    setPreviousEnrollment(null);
    setDecision(null);
    setSelectedClass('');
    setSelectedStream('');
    setSelectedStudyMode('');
    setSelectedCurriculum('');
    setSelectedProgram('');
    setStudyModeError(false);
  };

  const TOTAL_STEPS = 5;
  const STEP_LABELS = [t('students.enroll.steps.student'), t('students.enroll.steps.decision'), t('students.enroll.steps.mode'), t('students.enroll.steps.program'), t('students.enroll.steps.confirm')];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg">
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">{t('students.enroll.title')}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('students.enroll.subtitle')}</p>
          </div>
        </div>

        {/* ── Academic term context (canonical resolver) ── */}
        {termContext && (
          termContext.effective ? (
            <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                    {t('students.enroll.term.current', { term: [termContext.effective.name, termContext.effective.academic_year_name].filter(Boolean).join(' · ') })}
                  </p>
                  {termContext.progress && (
                    <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                      {t('students.enroll.term.progress', { day: termContext.progress.daysElapsed, total: termContext.progress.totalDays, remaining: termContext.progress.daysRemaining })}
                      {termContext.progress.percent >= 80 ? ` · ${t('students.enroll.term.endingSoon')}` : ''}
                    </p>
                  )}
                </div>
                {termContext.progress && (
                  <div className="w-24 h-1.5 rounded-full bg-emerald-200 dark:bg-emerald-800 overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, termContext.progress.percent)}%` }} />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t('students.enroll.term.noneTitle')}</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                {t('students.enroll.term.outside')}{' '}
                {termContext.upcoming ? `${t('students.enroll.term.next', { name: termContext.upcoming.name, date: String(termContext.upcoming.start_date).slice(0,10) })} ` : ''}
                {termContext.previous ? `${t('students.enroll.term.last', { name: termContext.previous.name })} ` : ''}
                {t('students.enroll.term.setCurrent')}
              </p>
            </div>
          )
        )}

        {/* ── Mode toggle ── */}
        <div className="flex rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
          {(['single', 'bulk'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} className={clsx(
              'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-all',
              mode === m ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700',
            )}>
              {m === 'single' ? <User className="w-4 h-4" /> : <Users className="w-4 h-4" />}
              {m === 'single' ? t('students.enroll.mode.single') : t('students.enroll.mode.bulk')}
            </button>
          ))}
        </div>

        {/* ══════════════════════════ SINGLE MODE ════════════════════════════ */}
        {mode === 'single' && (
          <div className="space-y-4">

            {/* Step indicator */}
            {step < 6 && (
              <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm">
                <StepIndicator step={step} total={TOTAL_STEPS} />
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{STEP_LABELS[step - 1]}</span>
              </div>
            )}

            {/* Previous enrollment context — visible on steps 2-5 */}
            {step >= 2 && step < 6 && (
              <PreviousContextBanner prev={previousEnrollment} loading={previousEnrollmentLoading} />
            )}

            {/* ────────────────── STEP 1: Select Student ───────────────────── */}
            {step === 1 && (
              <div className="card-glass p-6 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <User className="w-5 h-5 text-indigo-500" />
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-white">{t('students.enroll.steps.student')}</h2>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t('students.enroll.step1.hint')}
                </p>
                <StudentPicker
                  value={selectedStudent}
                  onChange={s => {
                    setSelectedStudent(s);
                    if (!s) {
                      setPreviousEnrollment(null);
                      setDecision(null);
                      setSelectedClass('');
                      setSelectedStudyMode('');
                      setSelectedCurriculum('');
                      setSelectedProgram('');
                    }
                  }}
                />
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  {t('students.enroll.step1.mustAdmit')}{" "}
                  <Link href="/students/admit" className="text-indigo-600 hover:underline ms-1">{t('students.enroll.admitNew')}</Link>
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => { if (selectedStudent) setStep(2); }}
                    disabled={!selectedStudent || previousEnrollmentLoading}
                    className="btn-primary px-6 py-2 rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {previousEnrollmentLoading
                      ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> {t('students.enroll.step1.loadingContext')}</>
                      : <>{t('students.enroll.next')} <ArrowRight className="w-4 h-4 rtl-flip" /></>
                    }
                  </button>
                </div>
              </div>
            )}

            {/* ─────────── STEP 2: Decision + Class / Term ─────────────────── */}
            {step === 2 && (
              <div className="card-glass p-6 space-y-5">
                <div className="flex items-center gap-2 mb-1">
                  <BarChart2 className="w-5 h-5 text-indigo-500" />
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-white">{t('students.enroll.step2.title')}</h2>
                </div>

                {/* Decision panel */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                    {t('students.enroll.step2.decision')} <span className="text-rose-500">*</span>
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
                          <span className={clsx('text-xs font-bold', active ? cfg.activeText : 'text-slate-600 dark:text-slate-400')}>{t(`students.enroll.decision.${key}.label`)}</span>
                          <span className="text-[10px] text-slate-400 mt-0.5 leading-tight">{t(`students.enroll.decision.${key}.desc`)}</span>
                        </button>
                      );
                    })}
                  </div>
                  {!decision && (
                    <p className="text-xs text-rose-500 mt-1.5">{t('students.enroll.step2.selectDecision')}</p>
                  )}
                </div>

                {/* Class / Term / Year / Stream */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                  {currentTerm && (
                    <div className="sm:col-span-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 text-xs text-emerald-700 dark:text-emerald-400">
                      <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                      {t('students.enroll.step2.autoSelected')} <strong className="ms-1">{currentTerm.academic_year_name} · {currentTerm.name}</strong>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">{t('students.enroll.field.academicYear')} <span className="text-rose-500">*</span></label>
                    <select value={selectedAcademicYear} onChange={e => { setSelectedAcademicYear(e.target.value); setSelectedTerm(''); }}
                      className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition">
                      <option value="">{t('students.enroll.select.year')}</option>
                      {academicYears.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">{t('students.enroll.field.term')} <span className="text-rose-500">*</span></label>
                    <select value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition">
                      <option value="">{t('students.enroll.select.term')}</option>
                      {filteredTerms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                      {t('students.enroll.field.class')} <span className="text-rose-500">*</span>
                      {decision && previousEnrollment && (
                        <span className="ms-1.5 text-indigo-500 font-normal text-[10px]">
                          {decision === 'continue' && t('students.enroll.step2.hintPrevious', { name: previousEnrollment.class_name })}
                          {decision === 'promote' && t('students.enroll.step2.hintNext')}
                          {decision === 'demote' && t('students.enroll.step2.hintLower')}
                        </span>
                      )}
                    </label>
                    <select value={selectedClass} onChange={e => { setSelectedClass(e.target.value); setSelectedStream(''); }}
                      className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition">
                      <option value="">{t('students.enroll.select.class')}</option>
                      {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">{t('students.enroll.field.stream')} <span className="text-slate-400 font-normal">{t('students.enroll.optional')}</span></label>
                    <select value={selectedStream} onChange={e => setSelectedStream(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition">
                      <option value="">{t('students.enroll.select.noStream')}</option>
                      {streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="flex justify-between pt-2">
                  <button onClick={() => setStep(1)} className="btn-secondary px-5 py-2 rounded-xl text-sm">{t('students.enroll.back')}</button>
                  <button
                    onClick={() => setStep(3)}
                    disabled={!selectedTerm || !selectedClass || !selectedAcademicYear || !decision}
                    className="btn-primary px-6 py-2 rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {t('students.enroll.next')} <ArrowRight className="w-4 h-4 rtl-flip" />
                  </button>
                </div>
              </div>
            )}

            {/* ─────────────────── STEP 3: Study Mode + Curriculum ──────── */}
            {step === 3 && (
              <div className="card-glass p-6 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Layers className="w-5 h-5 text-indigo-500" />
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-white">{t('students.enroll.step3.title')}</h2>
                </div>

                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-700 text-xs text-rose-700 dark:text-rose-400 font-semibold">
                  <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                  <span>{rich('students.enroll.step3.bothRequired', { required: <strong>{t('students.enroll.step3.required')}</strong> })}</span>
                </div>

                {/* ── Study Mode Section ── */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                    {t('students.enroll.field.studyMode')} <span className="text-rose-500">*</span>
                  </p>

                {studyModeError && !selectedStudyMode && (
                  <div className="flex items-center gap-2 px-3 py-2 mb-2 rounded-xl bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-xs text-red-700 dark:text-red-400 font-semibold">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    {t('students.enroll.step3.noStudyModeSelected')}
                  </div>
                )}

                {studyModes.length === 0 && !isAddingStudyMode ? (
                  <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 flex items-center justify-between">
                    <p className="text-sm text-amber-700 dark:text-amber-400">{t('students.enroll.step3.noStudyModes')}</p>
                    <button onClick={() => setIsAddingStudyMode(true)}
                      className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:underline">
                      <Plus className="w-4 h-4" /> {t('students.enroll.step3.addStudyMode')}
                    </button>
                  </div>
                ) : isAddingStudyMode ? (
                  <div className="flex items-center gap-2 mb-2">
                    <input autoFocus value={newStudyModeName}
                      onChange={e => setNewStudyModeName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleQuickAddStudyMode(); if (e.key === 'Escape') { setIsAddingStudyMode(false); setNewStudyModeName(''); } }}
                      placeholder={t('students.enroll.step3.studyModePlaceholder')}
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
                      const isPrevious = previousEnrollment?.study_mode_id === sm.id;
                      return (
                        <button
                          key={sm.id}
                          onClick={() => { setSelectedStudyMode(String(sm.id)); setStudyModeError(false); }}
                          className={clsx(
                            'relative py-4 px-4 rounded-2xl border-2 text-sm font-semibold transition-all text-start',
                            active
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 shadow-md'
                              : studyModeError && !selectedStudyMode
                                ? 'border-red-300 dark:border-red-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-indigo-300'
                                : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-indigo-300',
                          )}
                        >
                          {active && <CheckCircle2 className="w-4 h-4 text-indigo-500 absolute top-2.5 end-2.5" />}
                          <span className="block">{sm.name}</span>
                          {sm.is_default ? <span className="block text-[10px] font-normal text-slate-400 mt-0.5">{t('students.enroll.default')}</span> : null}
                          {isPrevious && <span className="block text-[10px] font-bold text-indigo-400 mt-0.5">{t('students.enroll.previousArrow')}</span>}
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={() => setIsAddingStudyMode(true)}
                    className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 transition-colors mt-2">
                    <Plus className="w-3.5 h-3.5" /> {t('students.enroll.step3.addStudyModeLink')}
                  </button>
                  </>
                )}
                </div>

                {/* ── Curriculum Section ── */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-700/60">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                    {t('students.enroll.field.curriculum')} <span className="text-rose-500">*</span>
                  </p>

                {curriculums.length === 0 && !isAddingCurriculum ? (
                  <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 flex items-center justify-between">
                    <p className="text-sm text-amber-700 dark:text-amber-400">{t('students.enroll.step3.noCurriculums')}</p>
                    <button onClick={() => setIsAddingCurriculum(true)}
                      className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:underline">
                      <Plus className="w-4 h-4" /> {t('students.enroll.step3.addCurriculum')}
                    </button>
                  </div>
                ) : isAddingCurriculum ? (
                  <div className="space-y-2 mb-2">
                    <div className="flex items-center gap-2">
                      <input autoFocus value={newCurriculumCode}
                        onChange={e => setNewCurriculumCode(e.target.value)}
                        placeholder={t('students.enroll.step3.codePlaceholder')}
                        className="w-24 px-3 py-2 text-sm border rounded-xl border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-800 text-slate-800 dark:text-white"
                        disabled={isSavingCurriculum} />
                      <input value={newCurriculumName}
                        onChange={e => setNewCurriculumName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleQuickAddCurriculum(); if (e.key === 'Escape') { setIsAddingCurriculum(false); setNewCurriculumCode(''); setNewCurriculumName(''); } }}
                        placeholder={t('students.enroll.step3.namePlaceholder')}
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
                    <p className="text-xs text-slate-400">{t('students.enroll.enterEsc')}</p>
                  </div>
                ) : (
                  <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {curriculums.map(cur => {
                      const active = selectedCurriculum === String(cur.id);
                      const isPrevious = previousEnrollment?.curriculum_id === cur.id;
                      return (
                        <button
                          key={cur.id}
                          onClick={() => setSelectedCurriculum(String(cur.id))}
                          className={clsx(
                            'relative py-4 px-4 rounded-2xl border-2 text-sm font-semibold transition-all text-start',
                            active
                              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 shadow-md'
                              : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-emerald-300',
                          )}
                        >
                          {active && <CheckCircle2 className="w-4 h-4 text-emerald-500 absolute top-2.5 end-2.5" />}
                          <span className="block">{cur.name}</span>
                          <span className="block text-[10px] font-normal text-slate-400 mt-0.5">{cur.code}</span>
                          {isPrevious && <span className="block text-[10px] font-bold text-emerald-400 mt-0.5">{t('students.enroll.previousArrow')}</span>}
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={() => setIsAddingCurriculum(true)}
                    className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 transition-colors mt-2">
                    <Plus className="w-3.5 h-3.5" /> {t('students.enroll.step3.addCurriculumLink')}
                  </button>
                  </>
                )}
                </div>

                <div className="flex justify-between pt-2">
                  <button onClick={() => setStep(2)} className="btn-secondary px-5 py-2 rounded-xl text-sm">{t('students.enroll.back')}</button>
                  <button
                    onClick={() => {
                      if (!selectedStudyMode && studyModes.length > 0) {
                        setStudyModeError(true);
                        toast.error(t('students.enroll.toast.studyModeContinue'));
                        return;
                      }
                      if (!selectedCurriculum && curriculums.length > 0) {
                        toast.error(t('students.enroll.toast.curriculumContinue'));
                        return;
                      }
                      setStep(4);
                    }}
                    disabled={studyModes.length === 0 || curriculums.length === 0}
                    className="btn-primary px-6 py-2 rounded-xl text-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t('students.enroll.next')} <ArrowRight className="w-4 h-4 rtl-flip" />
                  </button>
                </div>
              </div>
            )}

            {/* ──────────────────────── STEP 4: Program (single) ──────── */}
            {step === 4 && (
              <div className="card-glass p-6 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <BookOpen className="w-5 h-5 text-indigo-500" />
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-white">{t('students.enroll.field.program')}</h2>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t('students.enroll.step4.hint')}
                </p>

                {programs.length === 0 && !isAddingProgram ? (
                  <div className="flex flex-col items-start gap-3 py-2">
                    <p className="text-sm text-slate-400 italic">{t('students.enroll.step4.none')}</p>
                    <button
                      onClick={() => setIsAddingProgram(true)}
                      className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:underline"
                    >
                      <Plus className="w-4 h-4" /> {t('students.enroll.step4.quickAdd')}
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
                        placeholder={t('students.enroll.step4.placeholder')}
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
                    <p className="text-xs text-slate-400">{t('students.enroll.enterEsc')}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {programs.map(prog => {
                      const active = selectedProgram === String(prog.id);
                      const wasPrevious = previousEnrollment?.program_id === prog.id
                        || previousEnrollment?.programs?.some(p => p.id === prog.id);
                      return (
                        <button key={prog.id} onClick={() => setSelectedProgram(String(prog.id))}
                          className={clsx(
                            'w-full flex items-start gap-3 p-4 rounded-2xl border-2 text-start transition-all',
                            active ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-indigo-200',
                          )}>
                          <div className={clsx(
                            'w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center',
                            active ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300 dark:border-slate-500',
                          )}>
                            {active && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-slate-800 dark:text-white">{(prog as any).display_name || prog.name}</p>
                              {wasPrevious && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300">{t('students.enroll.previous')}</span>
                              )}
                            </div>
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
                      <Plus className="w-3.5 h-3.5" /> {t('students.enroll.step4.addAnother')}
                    </button>
                  </div>
                )}

                <div className="flex justify-between pt-2">
                  <button onClick={() => setStep(3)} className="btn-secondary px-5 py-2 rounded-xl text-sm">{t('students.enroll.back')}</button>
                  <button
                    onClick={() => {
                      if (!selectedProgram && programs.length > 0) {
                        toast.error(t('students.enroll.toast.programContinue'));
                        return;
                      }
                      if (programs.length === 0 && !isAddingProgram) {
                        toast.error(t('students.enroll.toast.programAddOne'));
                        return;
                      }
                      setStep(5);
                    }}
                    className="btn-primary px-6 py-2 rounded-xl text-sm flex items-center gap-2"
                  >
                    {t('students.enroll.review')} <ArrowRight className="w-4 h-4 rtl-flip" />
                  </button>
                </div>
              </div>
            )}

            {/* ──────────────────────── STEP 5: Confirm ────────────────────── */}
            {step === 5 && selectedStudent && (
              <div className="card-glass p-6 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-white">{t('students.enroll.step5.title')}</h2>
                </div>

                {/* Previous vs New comparison */}
                {previousEnrollment && (
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-700/40 p-3 border border-slate-200 dark:border-slate-600 space-y-1">
                      <p className="text-[10px] uppercase tracking-wide font-bold text-slate-400 mb-1.5">{t('students.enroll.previous')}</p>
                      <p className="font-semibold text-slate-600 dark:text-slate-300">{previousEnrollment.class_name}</p>
                      <p className="text-slate-400">{previousEnrollment.academic_year_name} · {previousEnrollment.term_name}</p>
                      <p className="text-slate-400">{previousEnrollment.study_mode_name ?? '—'}</p>
                      <p className="text-slate-400">{previousEnrollment.curriculum_name ?? '—'}</p>
                      <p className="text-slate-400">{previousEnrollment.program_name ?? (previousEnrollment.programs?.length ? previousEnrollment.programs[0]?.name : '—')}</p>
                      {previousEnrollment.results_summary?.avg_score != null && (
                        <p className="text-slate-400">{t('students.enroll.step5.avgScore', { value: previousEnrollment.results_summary.avg_score })}</p>
                      )}
                    </div>
                    <div className="rounded-xl bg-indigo-50 dark:bg-indigo-900/20 p-3 border border-indigo-200 dark:border-indigo-700 space-y-1">
                      <p className="text-[10px] uppercase tracking-wide font-bold text-indigo-400 mb-1.5">{t('students.enroll.step5.newEnrollment')}</p>
                      <p className="font-semibold text-indigo-700 dark:text-indigo-300">{classes.find(c => String(c.id) === selectedClass)?.name ?? '—'}</p>
                      <p className="text-indigo-400">{academicYears.find(y => String(y.id) === selectedAcademicYear)?.name} · {allTerms.find(t => String(t.id) === selectedTerm)?.name}</p>
                      <p className="text-indigo-400">{studyModes.find(sm => String(sm.id) === selectedStudyMode)?.name ?? '—'}</p>
                      <p className="text-indigo-400">{curriculums.find(c => String(c.id) === selectedCurriculum)?.name ?? '—'}</p>
                      <p className="text-indigo-400">{programs.find(p => String(p.id) === selectedProgram)?.name ?? '—'}</p>
                    </div>
                  </div>
                )}

                {/* Full summary */}
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-700/50 p-5 space-y-3">
                  <Row label={t('students.enroll.field.student')} value={`${selectedStudent.first_name} ${selectedStudent.last_name}`} />
                  <Row label={t('students.enroll.field.admNo')} value={selectedStudent.admission_no ?? t('students.enroll.notAvailable')} />
                  <Row label={t('students.enroll.field.decision')} value={
                    decision ? (
                      <span className={clsx(
                        'px-2 py-0.5 rounded-lg text-xs font-bold',
                        decision === 'promote' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
                        decision === 'demote' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                        decision === 'first_time' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' :
                        'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
                      )}>{t(`students.enroll.decision.${decision}.label`)}</span>
                    ) : '—'
                  } />
                  <Row label={t('students.enroll.field.academicYear')} value={academicYears.find(y => String(y.id) === selectedAcademicYear)?.name ?? '—'} />
                  <Row label={t('students.enroll.field.term')} value={allTerms.find(t => String(t.id) === selectedTerm)?.name ?? '—'} />
                  <Row label={t('students.enroll.field.class')} value={classes.find(c => String(c.id) === selectedClass)?.name ?? '—'} />
                  {selectedStream && <Row label={t('students.enroll.field.stream')} value={streams.find(s => String(s.id) === selectedStream)?.name ?? '—'} />}
                  <Row label={t('students.enroll.field.studyMode')} value={
                    selectedStudyMode
                      ? studyModes.find(sm => String(sm.id) === selectedStudyMode)?.name ?? '—'
                      : <span className="text-red-500 font-bold flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5" /> {t('students.enroll.notSelected')}</span>
                  } />
                  <Row label={t('students.enroll.field.curriculum')} value={
                    selectedCurriculum
                      ? curriculums.find(c => String(c.id) === selectedCurriculum)?.name ?? '—'
                      : <span className="text-red-500 font-bold flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5" /> {t('students.enroll.notSelected')}</span>
                  } />
                  <Row label={t('students.enroll.field.program')} value={
                    selectedProgram
                      ? programs.find(p => String(p.id) === selectedProgram)?.name ?? '—'
                      : <span className="text-red-500 font-bold flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5" /> {t('students.enroll.notSelected')}</span>
                  } />
                </div>

                {(!selectedStudyMode || !selectedCurriculum || !selectedProgram) && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 text-sm text-red-700 dark:text-red-400 font-semibold">
                    <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                    {t('students.enroll.step5.missing')}
                  </div>
                )}

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('students.enroll.step5.closeNote')}
                </p>

                <div className="flex justify-between pt-2">
                  <button onClick={() => setStep(4)} className="btn-secondary px-5 py-2 rounded-xl text-sm">{t('students.enroll.back')}</button>
                  <button
                    onClick={handleEnroll}
                    disabled={submitting || !selectedStudyMode || !selectedCurriculum || !selectedProgram}
                    className="btn-primary px-6 py-2 rounded-xl text-sm flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {submitting
                      ? <><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" /> {t('students.enroll.step5.enrolling')}</>
                      : <>{t('students.enroll.step5.title')} <CheckCircle2 className="w-4 h-4" /></>
                    }
                  </button>
                </div>
              </div>
            )}

            {/* ──────────────────────── STEP 6: Success ────────────────────── */}
            {step === 6 && selectedStudent && (
              <div className="card-glass p-8 text-center space-y-5">
                <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">{t('students.enroll.done.title')}</h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {rich('students.enroll.done.body', { name: <strong>{selectedStudent.first_name} {selectedStudent.last_name}</strong>, className: <strong>{classes.find(c => String(c.id) === selectedClass)?.name}</strong>, term: <strong>{allTerms.find(x => String(x.id) === selectedTerm)?.name}</strong> })}
                </p>
                <div className="flex flex-wrap gap-3 justify-center">
                  <button onClick={resetSingle} className="btn-secondary px-5 py-2 rounded-xl text-sm flex items-center gap-2">
                    <RotateCcw className="w-4 h-4" /> {t('students.enroll.done.another')}
                  </button>
                  <button onClick={() => router.push('/students/list')} className="btn-primary px-5 py-2 rounded-xl text-sm">
                    {t('students.enroll.done.viewList')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════ BULK MODE ══════════════════════════════ */}
        {mode === 'bulk' && (
          <div className="card-glass p-6 space-y-5">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-500" />
              <h2 className="text-lg font-semibold text-slate-800 dark:text-white">{t('students.enroll.bulk.title')}</h2>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('students.enroll.bulk.hint')}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">{t('students.enroll.field.academicYear')} <span className="text-rose-500">*</span></label>
                <select value={bulkAcademicYear} onChange={e => setBulkAcademicYear(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition">
                  <option value="">{t('students.enroll.select.year')}</option>
                  {academicYears.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">{t('students.enroll.field.term')}</label>
                <select value={bulkTerm} onChange={e => setBulkTerm(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition">
                  <option value="">{t('students.enroll.bulk.currentTerm')}</option>
                  {allTerms.map(t => <option key={t.id} value={t.id}>{t.academic_year_name} · {t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">{t('students.enroll.bulk.fromClass')} <span className="text-rose-500">*</span></label>
                <select value={bulkFromClass} onChange={e => setBulkFromClass(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition">
                  <option value="">{t('students.enroll.select.class')}</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">{t('students.enroll.bulk.toClass')} <span className="text-rose-500">*</span></label>
                  <select value={bulkToClass} onChange={e => setBulkToClass(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition">
                    <option value="">{t('students.enroll.select.class')}</option>
                    {classes.filter(c => String(c.id) !== bulkFromClass).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="pb-2 text-slate-400"><ArrowRight className="w-5 h-5 rtl-flip" /></div>
              </div>
            </div>

            {bulkFromClass && bulkToClass && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-sm text-amber-700 dark:text-amber-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{rich('students.enroll.bulk.warning', { from: <strong>{classes.find(c => String(c.id) === bulkFromClass)?.name}</strong>, to: <strong>{classes.find(c => String(c.id) === bulkToClass)?.name}</strong> })}</span>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleBulkPromote}
                disabled={bulkSubmitting || !bulkFromClass || !bulkToClass || !bulkAcademicYear}
                className="btn-primary px-6 py-2.5 rounded-xl text-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {bulkSubmitting
                  ? <><span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full inline-block" /> {t('students.enroll.bulk.promoting')}</>
                  : <><GraduationCap className="w-4 h-4" /> {t('students.enroll.bulk.promoteAll')}</>
                }
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
