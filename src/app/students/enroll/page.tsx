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
import {
  GraduationCap, Search, CheckCircle2,
  User, BookOpen, Calendar, Layers, ArrowRight, Users,
  RotateCcw, AlertCircle, Clock, TrendingUp, TrendingDown,
  Minus, Award, ShieldAlert, BarChart2, History,
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

// ─────────────────────────────── Student Search Picker ──────────────────
function StudentPicker({
  value, onChange,
}: { value: StudentOption | null; onChange: (s: StudentOption | null) => void }) {
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
            <p className="text-xs text-slate-500">{value.admission_no ?? 'No Adm. No'}</p>
          </div>
          <button onClick={() => onChange(null)} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium">Change</button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text" value={q}
              onChange={e => { setQ(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              placeholder="Search student by name or admission no…"
              className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>
          {open && results.length > 0 && (
            <div className="absolute z-30 w-full mt-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden max-h-60 overflow-y-auto">
              {results.map(s => (
                <button key={s.id} onClick={() => { onChange(s); setOpen(false); setQ(''); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-left transition-colors">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {s.first_name[0]}{s.last_name[0]}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-white">{s.first_name} {s.last_name}</p>
                    <p className="text-xs text-slate-400">{s.admission_no ?? 'No Adm. No'}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {open && q.length >= 2 && results.length === 0 && (
            <div className="absolute z-30 w-full mt-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl p-4 text-center">
              <p className="text-sm text-slate-500">No students found. <Link href="/students/admit" className="text-indigo-600 hover:underline">Admit a new student?</Link></p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ──────────────────────────── Previous Context Banner ───────────────────
function PreviousContextBanner({ prev, loading }: { prev: PreviousEnrollment | null; loading: boolean }) {
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
          No previous enrollment — this will be the student's first placement.
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-indigo-200 dark:border-indigo-700 bg-indigo-50/60 dark:bg-indigo-900/20 p-4 space-y-3">
      <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-[11px] font-bold uppercase tracking-wide">
        <History className="w-3.5 h-3.5" /> Previous Enrollment
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
        <CItem label="Class" value={prev.class_name} />
        <CItem label="Academic Year" value={prev.academic_year_name} />
        <CItem label="Term" value={prev.term_name} />
        <CItem label="Study Mode" value={prev.study_mode_name ?? '—'} />
        <CItem label="Status" value={
          <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-bold uppercase',
            prev.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400')}>{prev.status}</span>
        } />
        {prev.programs.length > 0 && (
          <CItem label="Programs" value={prev.programs.map(p => p.name).join(', ')} />
        )}
      </div>
      {prev.results_summary && (prev.results_summary.result_count ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 border-t border-indigo-100 dark:border-indigo-800">
          <div className="flex items-center gap-1.5 text-xs text-indigo-700 dark:text-indigo-300">
            <Award className="w-3.5 h-3.5" />
            <span><strong>{prev.results_summary.result_count}</strong> subjects</span>
          </div>
          {prev.results_summary.avg_score != null && (
            <span className="text-xs text-indigo-600 dark:text-indigo-400">Avg: <strong>{prev.results_summary.avg_score}</strong></span>
          )}
          {prev.results_summary.max_score != null && (
            <span className="text-xs text-indigo-600 dark:text-indigo-400">Best: <strong>{prev.results_summary.max_score}</strong></span>
          )}
          {prev.results_summary.passed_count != null && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">Passed: <strong>{prev.results_summary.passed_count}</strong></span>
          )}
        </div>
      )}
      {prev.top_subjects && prev.top_subjects.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {prev.top_subjects.map((s, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white dark:bg-slate-700 border border-indigo-100 dark:border-indigo-700 text-slate-600 dark:text-slate-300">
              {s.subject_name}: <strong>{s.score}</strong>{s.grade ? ` (${s.grade})` : ''}
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
      <span className="font-semibold text-slate-800 dark:text-white text-right">{value}</span>
    </div>
  );
}

// ─────────────────────────────────── Main Page ──────────────────────────
export default function EnrollStudentPage() {
  const router = useRouter();
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
  const [selectedPrograms, setSelectedPrograms] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);

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
  const { data: studyModeData } = useSWR<any>('/api/study-modes', fetcher);
  const { data: programData } = useSWR<any>('/api/programs', fetcher);

  const currentTerm: TermOption | null = termData?.data?.current ?? null;
  const allTerms: TermOption[] = termData?.data?.all ?? [];
  const classes: ClassOption[] = classData?.data ?? [];
  const streams: StreamOption[] = streamData?.data ?? [];
  const studyModes: { id: number; name: string; is_default: number }[] = studyModeData?.data ?? [];
  const programs: { id: number; name: string; description?: string }[] = programData?.data ?? [];

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        if (prev?.programs?.length) {
          setSelectedPrograms(prev.programs.map(p => p.id));
        }
        if (prev?.class_id) {
          setSelectedClass(String(prev.class_id));
        }
      })
      .catch(() => {})
      .finally(() => setPreviousEnrollmentLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      toast.error('Please complete all required fields');
      return;
    }
    if (!selectedStudyMode) {
      toast.error('Study mode is required — select one before enrolling');
      setStudyModeError(true);
      setStep(3);
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
          program_ids: selectedPrograms,
          enrollment_type: enrollmentType,
          close_previous: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Enrollment failed');
      toast.success(`${selectedStudent.first_name} enrolled successfully!`);
      setStep(6);
    } catch (err: any) {
      toast.error(err.message || 'Enrollment failed');
    } finally {
      setSubmitting(false);
    }
  }, [selectedStudent, selectedClass, selectedStream, selectedAcademicYear, selectedTerm,
      selectedStudyMode, selectedPrograms, enrollmentType, decision]);

  // ── Bulk promote submit ──────────────────────────────────────────────────
  const handleBulkPromote = useCallback(async () => {
    if (!bulkFromClass || !bulkToClass || !bulkAcademicYear) {
      toast.error('Select from class, to class, and academic year');
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
      if (!res.ok) throw new Error(data.error || 'Promotion failed');
      toast.success(`${data.data?.enrolled ?? 0} students promoted successfully!`);
      router.push('/students/list');
    } catch (err: any) {
      toast.error(err.message || 'Promotion failed');
    } finally {
      setBulkSubmitting(false);
    }
  }, [bulkFromClass, bulkToClass, bulkAcademicYear, bulkTerm, router]);

  const resetSingle = () => {
    setStep(1);
    setSelectedStudent(null);
    setPreviousEnrollment(null);
    setDecision(null);
    setSelectedClass('');
    setSelectedStream('');
    setSelectedStudyMode('');
    setSelectedPrograms([]);
    setStudyModeError(false);
  };

  const TOTAL_STEPS = 5;
  const STEP_LABELS = ['Select Student', 'Decision & Class', 'Study Mode', 'Programs', 'Confirm'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg">
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Enroll Student</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Informed academic placement with full context</p>
          </div>
        </div>

        {/* ── Mode toggle ── */}
        <div className="flex rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
          {(['single', 'bulk'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} className={clsx(
              'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-all',
              mode === m ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700',
            )}>
              {m === 'single' ? <User className="w-4 h-4" /> : <Users className="w-4 h-4" />}
              {m === 'single' ? 'Single Student' : 'Bulk Promotion'}
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
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Select Student</h2>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Search for an admitted student. Their previous academic record will load automatically.
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
                      setSelectedPrograms([]);
                    }
                  }}
                />
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  Student must be admitted first.{" "}
                  <Link href="/students/admit" className="text-indigo-600 hover:underline ml-1">Admit a new student →</Link>
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => { if (selectedStudent) setStep(2); }}
                    disabled={!selectedStudent || previousEnrollmentLoading}
                    className="btn-primary px-6 py-2 rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {previousEnrollmentLoading
                      ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Loading context…</>
                      : <>Next <ArrowRight className="w-4 h-4" /></>
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
                      {decision && previousEnrollment && (
                        <span className="ml-1.5 text-indigo-500 font-normal text-[10px]">
                          {decision === 'continue' && `(previous: ${previousEnrollment.class_name})`}
                          {decision === 'promote' && '(suggested: next level)'}
                          {decision === 'demote' && '(suggested: lower level)'}
                        </span>
                      )}
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
                    Next <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ─────────────────── STEP 3: Study Mode (REQUIRED) ───────────── */}
            {step === 3 && (
              <div className="card-glass p-6 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Layers className="w-5 h-5 text-indigo-500" />
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Study Mode</h2>
                </div>

                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-700 text-xs text-rose-700 dark:text-rose-400 font-semibold">
                  <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                  Study mode is <strong className="mx-1">required</strong>. Enrollment is blocked without it.
                </div>

                {studyModeError && !selectedStudyMode && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-xs text-red-700 dark:text-red-400 font-semibold">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    No study mode selected — you must select one to proceed.
                  </div>
                )}

                {studyModes.length === 0 ? (
                  <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      No study modes configured for your school.{" "}
                      <Link href="/settings/study-modes" className="font-bold underline">Set them up first →</Link>
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {studyModes.map(sm => {
                      const active = selectedStudyMode === String(sm.id);
                      const isPrevious = previousEnrollment?.study_mode_id === sm.id;
                      return (
                        <button
                          key={sm.id}
                          onClick={() => { setSelectedStudyMode(String(sm.id)); setStudyModeError(false); }}
                          className={clsx(
                            'relative py-4 px-4 rounded-2xl border-2 text-sm font-semibold transition-all text-left',
                            active
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 shadow-md'
                              : studyModeError && !selectedStudyMode
                                ? 'border-red-300 dark:border-red-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-indigo-300'
                                : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-indigo-300',
                          )}
                        >
                          {active && <CheckCircle2 className="w-4 h-4 text-indigo-500 absolute top-2.5 right-2.5" />}
                          <span className="block">{sm.name}</span>
                          {sm.is_default ? <span className="block text-[10px] font-normal text-slate-400 mt-0.5">Default</span> : null}
                          {isPrevious && <span className="block text-[10px] font-bold text-indigo-400 mt-0.5">← Previous</span>}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex justify-between pt-2">
                  <button onClick={() => setStep(2)} className="btn-secondary px-5 py-2 rounded-xl text-sm">Back</button>
                  <button
                    onClick={() => {
                      if (!selectedStudyMode && studyModes.length > 0) {
                        setStudyModeError(true);
                        toast.error('Study mode is required — select one to continue');
                        return;
                      }
                      setStep(4);
                    }}
                    disabled={studyModes.length === 0}
                    className="btn-primary px-6 py-2 rounded-xl text-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ──────────────────────── STEP 4: Programs ───────────────────── */}
            {step === 4 && (
              <div className="card-glass p-6 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <BookOpen className="w-5 h-5 text-indigo-500" />
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Programs</h2>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Programs are independent of class (e.g. Tahfiz, Secular, Theology). A student can be in multiple.
                  Previous programs are pre-selected.
                </p>

                {programs.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">
                    No programs configured.{" "}
                    <Link href="/settings/programs" className="text-indigo-600 hover:underline">Set them up →</Link>
                  </p>
                ) : (
                  <div className="space-y-2">
                    {programs.map(prog => {
                      const checked = selectedPrograms.includes(prog.id);
                      const wasPrevious = previousEnrollment?.programs?.some(p => p.id === prog.id);
                      return (
                        <label key={prog.id} className={clsx(
                          'flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all',
                          checked ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-indigo-200',
                        )}>
                          <input type="checkbox" checked={checked} className="w-4 h-4 accent-indigo-600 mt-0.5 flex-shrink-0"
                            onChange={() => setSelectedPrograms(prev => checked ? prev.filter(id => id !== prog.id) : [...prev, prog.id])} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-slate-800 dark:text-white">{prog.name}</p>
                              {wasPrevious && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300">Previous</span>
                              )}
                            </div>
                            {prog.description && <p className="text-xs text-slate-400 mt-0.5">{prog.description}</p>}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}

                <div className="flex justify-between pt-2">
                  <button onClick={() => setStep(3)} className="btn-secondary px-5 py-2 rounded-xl text-sm">Back</button>
                  <button onClick={() => setStep(5)} className="btn-primary px-6 py-2 rounded-xl text-sm flex items-center gap-2">
                    Review <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ──────────────────────── STEP 5: Confirm ────────────────────── */}
            {step === 5 && selectedStudent && (
              <div className="card-glass p-6 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Confirm Enrollment</h2>
                </div>

                {/* Previous vs New comparison */}
                {previousEnrollment && (
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-700/40 p-3 border border-slate-200 dark:border-slate-600 space-y-1">
                      <p className="text-[10px] uppercase tracking-wide font-bold text-slate-400 mb-1.5">Previous</p>
                      <p className="font-semibold text-slate-600 dark:text-slate-300">{previousEnrollment.class_name}</p>
                      <p className="text-slate-400">{previousEnrollment.academic_year_name} · {previousEnrollment.term_name}</p>
                      <p className="text-slate-400">{previousEnrollment.study_mode_name ?? '—'}</p>
                      {previousEnrollment.results_summary?.avg_score != null && (
                        <p className="text-slate-400">Avg score: {previousEnrollment.results_summary.avg_score}</p>
                      )}
                    </div>
                    <div className="rounded-xl bg-indigo-50 dark:bg-indigo-900/20 p-3 border border-indigo-200 dark:border-indigo-700 space-y-1">
                      <p className="text-[10px] uppercase tracking-wide font-bold text-indigo-400 mb-1.5">New Enrollment</p>
                      <p className="font-semibold text-indigo-700 dark:text-indigo-300">{classes.find(c => String(c.id) === selectedClass)?.name ?? '—'}</p>
                      <p className="text-indigo-400">{academicYears.find(y => String(y.id) === selectedAcademicYear)?.name} · {allTerms.find(t => String(t.id) === selectedTerm)?.name}</p>
                      <p className="text-indigo-400">{studyModes.find(sm => String(sm.id) === selectedStudyMode)?.name ?? '—'}</p>
                    </div>
                  </div>
                )}

                {/* Full summary */}
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-700/50 p-5 space-y-3">
                  <Row label="Student" value={`${selectedStudent.first_name} ${selectedStudent.last_name}`} />
                  <Row label="Adm. No" value={selectedStudent.admission_no ?? 'N/A'} />
                  <Row label="Decision" value={
                    decision ? (
                      <span className={clsx(
                        'capitalize px-2 py-0.5 rounded-lg text-xs font-bold',
                        decision === 'promote' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
                        decision === 'demote' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                        decision === 'first_time' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' :
                        'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
                      )}>{decision.replace('_', ' ')}</span>
                    ) : '—'
                  } />
                  <Row label="Academic Year" value={academicYears.find(y => String(y.id) === selectedAcademicYear)?.name ?? '—'} />
                  <Row label="Term" value={allTerms.find(t => String(t.id) === selectedTerm)?.name ?? '—'} />
                  <Row label="Class" value={classes.find(c => String(c.id) === selectedClass)?.name ?? '—'} />
                  {selectedStream && <Row label="Stream" value={streams.find(s => String(s.id) === selectedStream)?.name ?? '—'} />}
                  <Row label="Study Mode" value={
                    selectedStudyMode
                      ? studyModes.find(sm => String(sm.id) === selectedStudyMode)?.name ?? '—'
                      : <span className="text-red-500 font-bold flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5" /> Not selected</span>
                  } />
                  {selectedPrograms.length > 0 && (
                    <Row label="Programs" value={selectedPrograms.map(id => programs.find(p => p.id === id)?.name).filter(Boolean).join(', ')} />
                  )}
                </div>

                {!selectedStudyMode && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 text-sm text-red-700 dark:text-red-400 font-semibold">
                    <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                    Study mode missing — go back to Step 3 to select one before proceeding.
                  </div>
                )}

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Any existing active enrollment for this student will be closed and marked as completed.
                </p>

                <div className="flex justify-between pt-2">
                  <button onClick={() => setStep(4)} className="btn-secondary px-5 py-2 rounded-xl text-sm">Back</button>
                  <button
                    onClick={handleEnroll}
                    disabled={submitting || !selectedStudyMode}
                    className="btn-primary px-6 py-2 rounded-xl text-sm flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {submitting
                      ? <><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" /> Enrolling…</>
                      : <>Confirm Enrollment <CheckCircle2 className="w-4 h-4" /></>
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
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">Enrollment Complete!</h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  <strong>{selectedStudent.first_name} {selectedStudent.last_name}</strong> has been enrolled in{" "}
                  <strong>{classes.find(c => String(c.id) === selectedClass)?.name}</strong>{" "}
                  for <strong>{allTerms.find(t => String(t.id) === selectedTerm)?.name}</strong>.
                </p>
                <div className="flex flex-wrap gap-3 justify-center">
                  <button onClick={resetSingle} className="btn-secondary px-5 py-2 rounded-xl text-sm flex items-center gap-2">
                    <RotateCcw className="w-4 h-4" /> Enroll Another
                  </button>
                  <button onClick={() => router.push('/students/list')} className="btn-primary px-5 py-2 rounded-xl text-sm">
                    View Student List
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
              <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Bulk Class Promotion</h2>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Move all active students from one class to another. Previous enrollments will be closed.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Academic Year <span className="text-rose-500">*</span></label>
                <select value={bulkAcademicYear} onChange={e => setBulkAcademicYear(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition">
                  <option value="">Select year…</option>
                  {academicYears.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Term</label>
                <select value={bulkTerm} onChange={e => setBulkTerm(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition">
                  <option value="">Current term</option>
                  {allTerms.map(t => <option key={t.id} value={t.id}>{t.academic_year_name} · {t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">From Class <span className="text-rose-500">*</span></label>
                <select value={bulkFromClass} onChange={e => setBulkFromClass(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition">
                  <option value="">Select class…</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">To Class <span className="text-rose-500">*</span></label>
                  <select value={bulkToClass} onChange={e => setBulkToClass(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition">
                    <option value="">Select class…</option>
                    {classes.filter(c => String(c.id) !== bulkFromClass).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="pb-2 text-slate-400"><ArrowRight className="w-5 h-5" /></div>
              </div>
            </div>

            {bulkFromClass && bulkToClass && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-sm text-amber-700 dark:text-amber-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                All active students in <strong className="mx-1">{classes.find(c => String(c.id) === bulkFromClass)?.name}</strong>
                will be moved to <strong className="mx-1">{classes.find(c => String(c.id) === bulkToClass)?.name}</strong>.
                This cannot be undone easily.
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleBulkPromote}
                disabled={bulkSubmitting || !bulkFromClass || !bulkToClass || !bulkAcademicYear}
                className="btn-primary px-6 py-2.5 rounded-xl text-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {bulkSubmitting
                  ? <><span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full inline-block" /> Promoting…</>
                  : <><GraduationCap className="w-4 h-4" /> Promote All Students</>
                }
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
