"use client";
/**
 * DRAIS Phase 6 — Enrollment Page
 * High-end UX: enroll a student into a class + term with smart defaults.
 * Also supports bulk promotion mode.
 */
import React, { useState, useEffect, useCallback } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import {
  GraduationCap, Search, ChevronRight, CheckCircle2,
  User, BookOpen, Calendar, Layers, ArrowRight, Users,
  RotateCcw, AlertCircle, Clock,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { fetcher } from '@/utils/fetcher';
import clsx from 'clsx';

// ---------- Types ----------
interface StudentOption { id: number; first_name: string; last_name: string; admission_no?: string; photo_url?: string; }
interface ClassOption { id: number; name: string; level?: number; }
interface StreamOption { id: number; name: string; class_id?: number; }
interface TermOption { id: number; name: string; academic_year_id: number; academic_year_name: string; start_date?: string; end_date?: string; }
interface AcademicYear { id: number; name: string; status: string; }

// ---------- Step Indicator ----------
function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <React.Fragment key={i}>
          <div className={clsx(
            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all',
            i + 1 < step ? 'bg-emerald-500 text-white' :
            i + 1 === step ? 'bg-indigo-600 text-white ring-4 ring-indigo-100 dark:ring-indigo-900' :
            'bg-slate-200 dark:bg-slate-700 text-slate-400'
          )}>
            {i + 1 < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
          </div>
          {i < total - 1 && (
            <div className={clsx('flex-1 h-0.5 w-8', i + 1 < step ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-700')} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ---------- Student Search Picker ----------
function StudentPicker({
  value,
  onChange,
}: {
  value: StudentOption | null;
  onChange: (s: StudentOption | null) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const { data } = useSWR<any>(
    q.length >= 2 ? `/api/students/full?q=${encodeURIComponent(q)}&limit=10` : null,
    fetcher
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
              type="text"
              value={q}
              onChange={e => { setQ(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              placeholder="Search student by name or admission no…"
              className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>
          {open && results.length > 0 && (
            <div className="absolute z-30 w-full mt-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden max-h-60 overflow-y-auto">
              {results.map(s => (
                <button
                  key={s.id}
                  onClick={() => { onChange(s); setOpen(false); setQ(''); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-left transition-colors"
                >
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
              <p className="text-sm text-slate-500">No students found. <a href="/students/admit" className="text-indigo-600 hover:underline">Admit a new student?</a></p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------- Main Page ----------
export default function EnrollStudentPage() {
  const router = useRouter();

  // Mode: single | bulk
  const [mode, setMode] = useState<'single' | 'bulk'>('single');

  // SINGLE mode state
  const [step, setStep] = useState(1);
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);
  const [selectedAcademicYear, setSelectedAcademicYear] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedStream, setSelectedStream] = useState('');
  const [enrollmentType, setEnrollmentType] = useState<'new' | 'continuing' | 'transfer' | 'repeat'>('continuing');
  const [submitting, setSubmitting] = useState(false);

  // BULK mode state
  const [bulkFromClass, setBulkFromClass] = useState('');
  const [bulkToClass, setBulkToClass] = useState('');
  const [bulkAcademicYear, setBulkAcademicYear] = useState('');
  const [bulkTerm, setBulkTerm] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  // Data fetches
  const { data: termData } = useSWR<any>('/api/terms/current', fetcher);
  const { data: classData } = useSWR<any>('/api/classes', fetcher);
  const { data: streamData } = useSWR<any>(
    selectedClass ? `/api/streams?class_id=${selectedClass}` : '/api/streams',
    fetcher
  );

  const currentTerm: TermOption | null = termData?.data?.current ?? null;
  const allTerms: TermOption[] = termData?.data?.all ?? [];
  const classes: ClassOption[] = classData?.data ?? [];
  const streams: StreamOption[] = streamData?.data ?? [];

  // Auto-select current term/year when loaded
  useEffect(() => {
    if (currentTerm && !selectedTerm) {
      setSelectedTerm(String(currentTerm.id));
      setSelectedAcademicYear(String(currentTerm.academic_year_id));
      setBulkTerm(String(currentTerm.id));
      setBulkAcademicYear(String(currentTerm.academic_year_id));
    }
  }, [currentTerm]);

  // Filter terms by selected academic year
  const filteredTerms = selectedAcademicYear
    ? allTerms.filter(t => String(t.academic_year_id) === selectedAcademicYear)
    : allTerms;

  const academicYears = Array.from(
    new Map(allTerms.map(t => [t.academic_year_id, { id: t.academic_year_id, name: t.academic_year_name }])).values()
  );

  // ---------- SINGLE ENROLLMENT SUBMIT ----------
  const handleEnroll = useCallback(async () => {
    if (!selectedStudent || !selectedClass || !selectedTerm || !selectedAcademicYear) {
      toast.error('Please complete all required fields');
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
          enrollment_type: enrollmentType,
          close_previous: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Enrollment failed');
      toast.success(`${selectedStudent.first_name} enrolled successfully!`);
      setStep(4); // success step
    } catch (err: any) {
      toast.error(err.message || 'Enrollment failed');
    } finally {
      setSubmitting(false);
    }
  }, [selectedStudent, selectedClass, selectedStream, selectedAcademicYear, selectedTerm, enrollmentType]);

  // ---------- BULK PROMOTE SUBMIT ----------
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

  const TOTAL_STEPS = 3;
  const stepLabels = ['Select Student', 'Choose Term & Class', 'Confirm'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg">
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Enroll Student</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Assign a student to a class and term</p>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
          {(['single', 'bulk'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={clsx(
                'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-all',
                mode === m
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
              )}
            >
              {m === 'single' ? <User className="w-4 h-4" /> : <Users className="w-4 h-4" />}
              {m === 'single' ? 'Single Student' : 'Bulk Promotion'}
            </button>
          ))}
        </div>

        {/* ===== SINGLE MODE ===== */}
        {mode === 'single' && (
          <div className="space-y-5">
            {/* Step indicator */}
            {step < 4 && (
              <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm">
                <StepIndicator step={step} total={TOTAL_STEPS} />
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{stepLabels[step - 1]}</span>
              </div>
            )}

            {/* Step 1: Student */}
            {step === 1 && (
              <div className="card-glass p-6 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-5 h-5 text-indigo-500" />
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Select Student</h2>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Search for an admitted student to enroll.</p>
                <StudentPicker value={selectedStudent} onChange={setSelectedStudent} />
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  Student must be admitted first. <a href="/students/admit" className="text-indigo-600 hover:underline ml-1">Admit a new student →</a>
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setStep(2)}
                    disabled={!selectedStudent}
                    className="btn-primary px-6 py-2 rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    Next <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Term + Class */}
            {step === 2 && (
              <div className="card-glass p-6 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="w-5 h-5 text-indigo-500" />
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Choose Term & Class</h2>
                </div>

                {currentTerm && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 text-xs text-emerald-700 dark:text-emerald-400">
                    <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                    Auto-selected current term: <strong className="ml-1">{currentTerm.academic_year_name} · {currentTerm.name}</strong>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Academic Year */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Academic Year *</label>
                    <select
                      value={selectedAcademicYear}
                      onChange={e => { setSelectedAcademicYear(e.target.value); setSelectedTerm(''); }}
                      className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition"
                    >
                      <option value="">Select year…</option>
                      {academicYears.map(y => (
                        <option key={y.id} value={y.id}>{y.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Term */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Term *</label>
                    <select
                      value={selectedTerm}
                      onChange={e => setSelectedTerm(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition"
                    >
                      <option value="">Select term…</option>
                      {filteredTerms.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Class */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Class *</label>
                    <select
                      value={selectedClass}
                      onChange={e => { setSelectedClass(e.target.value); setSelectedStream(''); }}
                      className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition"
                    >
                      <option value="">Select class…</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Stream */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Stream <span className="text-slate-400 font-normal">(optional)</span></label>
                    <select
                      value={selectedStream}
                      onChange={e => setSelectedStream(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition"
                    >
                      <option value="">No stream</option>
                      {streams.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Enrollment Type */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Enrollment Type</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(['new', 'continuing', 'transfer', 'repeat'] as const).map(et => (
                        <button
                          key={et}
                          onClick={() => setEnrollmentType(et)}
                          className={clsx(
                            'py-2 rounded-xl border-2 text-xs font-semibold capitalize transition-all',
                            enrollmentType === et
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                              : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                          )}
                        >
                          {et}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-between pt-2">
                  <button onClick={() => setStep(1)} className="btn-secondary px-5 py-2 rounded-xl text-sm flex items-center gap-2">
                    Back
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    disabled={!selectedTerm || !selectedClass || !selectedAcademicYear}
                    className="btn-primary px-6 py-2 rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    Review <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Confirm */}
            {step === 3 && selectedStudent && (
              <div className="card-glass p-6 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Confirm Enrollment</h2>
                </div>

                <div className="rounded-2xl bg-slate-50 dark:bg-slate-700/50 p-5 space-y-3">
                  <Row label="Student" value={`${selectedStudent.first_name} ${selectedStudent.last_name}`} />
                  <Row label="Adm. No" value={selectedStudent.admission_no ?? 'N/A'} />
                  <Row label="Academic Year" value={academicYears.find(y => String(y.id) === selectedAcademicYear)?.name ?? '—'} />
                  <Row label="Term" value={allTerms.find(t => String(t.id) === selectedTerm)?.name ?? '—'} />
                  <Row label="Class" value={classes.find(c => String(c.id) === selectedClass)?.name ?? '—'} />
                  <Row label="Stream" value={streams.find(s => String(s.id) === selectedStream)?.name ?? 'None'} />
                  <Row label="Type" value={<span className="capitalize">{enrollmentType}</span>} />
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Any existing active enrollment for this student will be closed and replaced.
                </p>

                <div className="flex justify-between pt-2">
                  <button onClick={() => setStep(2)} className="btn-secondary px-5 py-2 rounded-xl text-sm">Back</button>
                  <button
                    onClick={handleEnroll}
                    disabled={submitting}
                    className="btn-primary px-6 py-2 rounded-xl text-sm flex items-center gap-2 disabled:opacity-60"
                  >
                    {submitting ? <><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" /> Enrolling…</> : <>Confirm Enrollment <CheckCircle2 className="w-4 h-4" /></>}
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Success */}
            {step === 4 && selectedStudent && (
              <div className="card-glass p-8 text-center space-y-5">
                <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">Enrollment Complete!</h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  <strong>{selectedStudent.first_name} {selectedStudent.last_name}</strong> has been enrolled in{' '}
                  <strong>{classes.find(c => String(c.id) === selectedClass)?.name}</strong> for <strong>{allTerms.find(t => String(t.id) === selectedTerm)?.name}</strong>.
                </p>
                <div className="flex flex-wrap gap-3 justify-center">
                  <button
                    onClick={() => { setStep(1); setSelectedStudent(null); setSelectedClass(''); setSelectedStream(''); }}
                    className="btn-secondary px-5 py-2 rounded-xl text-sm flex items-center gap-2"
                  >
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

        {/* ===== BULK PROMOTION MODE ===== */}
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
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Academic Year *</label>
                <select
                  value={bulkAcademicYear}
                  onChange={e => setBulkAcademicYear(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition"
                >
                  <option value="">Select year…</option>
                  {academicYears.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Term</label>
                <select
                  value={bulkTerm}
                  onChange={e => setBulkTerm(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition"
                >
                  <option value="">Current term</option>
                  {allTerms.map(t => <option key={t.id} value={t.id}>{t.academic_year_name} · {t.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">From Class *</label>
                <select
                  value={bulkFromClass}
                  onChange={e => setBulkFromClass(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition"
                >
                  <option value="">Select class…</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">To Class *</label>
                  <select
                    value={bulkToClass}
                    onChange={e => setBulkToClass(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition"
                  >
                    <option value="">Select class…</option>
                    {classes.filter(c => String(c.id) !== bulkFromClass).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="pb-1 text-slate-400">
                  <ArrowRight className="w-5 h-5" />
                </div>
              </div>
            </div>

            {bulkFromClass && bulkToClass && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-sm text-amber-700 dark:text-amber-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                All active students in <strong className="mx-1">{classes.find(c => String(c.id) === bulkFromClass)?.name}</strong> will be moved to <strong className="mx-1">{classes.find(c => String(c.id) === bulkToClass)?.name}</strong>. This cannot be undone easily.
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleBulkPromote}
                disabled={bulkSubmitting || !bulkFromClass || !bulkToClass || !bulkAcademicYear}
                className="btn-primary px-6 py-2.5 rounded-xl text-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {bulkSubmitting
                  ? <><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" /> Promoting…</>
                  : <><Users className="w-4 h-4" /> Promote All Students</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-semibold text-slate-800 dark:text-white">{value}</span>
    </div>
  );
}
