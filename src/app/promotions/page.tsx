"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Check,
  AlertCircle,
  AlertTriangle,
  Loader,
  Search,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Shield,
  Users,
  ArrowRight,
  XCircle,
  CheckCircle2,
  Ban,
} from 'lucide-react';
import useSWR from 'swr';
import { showToast, confirmAction } from '@/lib/toast';
import { apiFetch, swrFetcher } from '@/lib/apiClient';

// ─── Types ──────────────────────────────────────────────────────────────────

interface EligibilityStudent {
  id: number;
  admission_no: string;
  first_name: string;
  last_name: string;
  class_name: string;
  enrollment_id: number;
  enrollment_type: string;
  promoted_from_enrollment_id: number | null;
  total_marks: number | null;
  average_marks: number | null;
  attendance_count: number;
  results_count: number;
  reason: string;
}

interface ConflictInfo {
  type: string;
  description: string;
  affected_student_ids: number[];
}

interface EligibilityData {
  eligible: EligibilityStudent[];
  ineligible: EligibilityStudent[];
  already_promoted: EligibilityStudent[];
  conflicts: ConflictInfo[];
  from_class: { id: number; name: string; level: number | null };
  to_class: { id: number; name: string; level: number | null } | null;
  summary: {
    total_in_class: number;
    eligible_count: number;
    ineligible_count: number;
    already_promoted_count: number;
    conflict_count: number;
  };
}

interface ClassOption {
  id: number;
  name: string;
  level: number | null;
}

interface YearOption {
  id: number;
  name: string;
  status: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function PromotionsPage() {
  // ─── State ──────────────────────────────────────────────────────────────
  const [academicYearId, setAcademicYearId] = useState<string>('');
  const [classId, setClassId] = useState<string>('');
  const [toClassId, setToClassId] = useState<string>('');
  const [toAcademicYearId, setToAcademicYearId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  // Eligibility analysis
  const [eligibility, setEligibility] = useState<EligibilityData | null>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [selectedForPromotion, setSelectedForPromotion] = useState<Set<number>>(new Set());
  const [isPromoting, setIsPromoting] = useState(false);

  // UI state
  const [showEligible, setShowEligible] = useState(true);
  const [showIneligible, setShowIneligible] = useState(false);
  const [showAlreadyPromoted, setShowAlreadyPromoted] = useState(false);

  // ─── Data Fetching ────────────────────────────────────────────────────
  const { data: yearsData } = useSWR('/api/academic_years', swrFetcher, { revalidateOnFocus: false });
  const years: YearOption[] = yearsData?.data || [];

  const { data: classesData } = useSWR('/api/classes', swrFetcher, { revalidateOnFocus: false });
  const classes: ClassOption[] = (classesData?.data || []).sort(
    (a: ClassOption, b: ClassOption) => (a.level ?? 999) - (b.level ?? 999) || a.name.localeCompare(b.name),
  );

  // Auto-select active year
  useEffect(() => {
    if (years.length > 0 && !academicYearId) {
      const active = years.find((y: YearOption) => y.status === 'active');
      if (active) setAcademicYearId(String(active.id));
    }
  }, [years, academicYearId]);

  // Auto-detect destination class when eligibility returns
  useEffect(() => {
    if (classId && eligibility?.to_class) {
      setToClassId(String(eligibility.to_class.id));
    }
  }, [classId, eligibility]);

  // Auto-set destination year = same as source year by default
  useEffect(() => {
    if (academicYearId && !toAcademicYearId) {
      setToAcademicYearId(academicYearId);
    }
  }, [academicYearId, toAcademicYearId]);

  // ─── Eligibility Analysis ────────────────────────────────────────────
  const runAnalysis = useCallback(async () => {
    if (!classId || !academicYearId) {
      showToast('error', 'Please select both academic year and source class');
      return;
    }
    setIsAnalysing(true);
    setEligibility(null);
    setSelectedForPromotion(new Set());
    try {
      const data = await apiFetch<EligibilityData>(
        `/api/promotions/eligibility?from_class_id=${classId}&academic_year_id=${academicYearId}`,
        { silent: true },
      );
      setEligibility(data);

      // Auto-select all eligible students
      if (data.eligible) {
        setSelectedForPromotion(new Set(data.eligible.map((s: EligibilityStudent) => s.id)));
      }

      // Auto-set destination class
      if (data.to_class) {
        setToClassId(String(data.to_class.id));
      }

      // Show conflicts if any
      if (data.conflicts && data.conflicts.length > 0) {
        showToast('warning', `${data.conflicts.length} conflict(s) detected — review before promoting`);
      }
    } catch {
      showToast('error', 'Failed to analyse eligibility');
    } finally {
      setIsAnalysing(false);
    }
  }, [classId, academicYearId]);

  // ─── Promotion Execution ─────────────────────────────────────────────
  const handleBulkPromote = async () => {
    if (selectedForPromotion.size === 0) {
      showToast('error', 'No students selected');
      return;
    }
    if (!toClassId) {
      showToast('error', 'No destination class selected');
      return;
    }

    const destClass = classes.find(c => c.id === Number(toClassId));
    const srcClass = classes.find(c => c.id === Number(classId));

    const confirmed = await confirmAction(
      `Promote ${selectedForPromotion.size} Students`,
      `This will promote ${selectedForPromotion.size} student(s) from ${srcClass?.name || 'source'} to ${destClass?.name || 'destination'}. New enrollments will be created and old ones closed. This cannot be undone easily.`,
      'Promote Now',
    );
    if (!confirmed) return;

    setIsPromoting(true);
    try {
      const result = await apiFetch<{
        promoted_count: number;
        failed_count: number;
      }>('/api/promotions/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'manual',
          academic_year_id: Number(academicYearId),
          from_class_id: Number(classId),
          to_class_id: Number(toClassId),
          to_academic_year_id: Number(toAcademicYearId || academicYearId),
          student_ids: Array.from(selectedForPromotion),
        }),
        silent: true,
      });

      if (result.promoted_count > 0) {
        showToast('success', `${result.promoted_count} student(s) promoted successfully`);
      }
      if (result.failed_count > 0) {
        showToast('error', `${result.failed_count} student(s) failed to promote`);
      }

      // Re-run analysis to refresh
      setSelectedForPromotion(new Set());
      await runAnalysis();
    } catch {
      showToast('error', 'Promotion failed');
    } finally {
      setIsPromoting(false);
    }
  };

  // ─── Student Selection ────────────────────────────────────────────────
  const toggleStudent = (id: number) => {
    setSelectedForPromotion(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (students: EligibilityStudent[]) => {
    const allSelected = students.every(s => selectedForPromotion.has(s.id));
    setSelectedForPromotion(prev => {
      const next = new Set(prev);
      if (allSelected) {
        students.forEach(s => next.delete(s.id));
      } else {
        students.forEach(s => next.add(s.id));
      }
      return next;
    });
  };

  // ─── Filtered lists ───────────────────────────────────────────────────
  const filterStudents = useCallback((list: EligibilityStudent[]) => {
    if (!searchTerm) return list;
    const term = searchTerm.toLowerCase();
    return list.filter(
      s =>
        s.first_name.toLowerCase().includes(term) ||
        s.last_name.toLowerCase().includes(term) ||
        (s.admission_no || '').toLowerCase().includes(term),
    );
  }, [searchTerm]);

  const filteredEligible = useMemo(() => filterStudents(eligibility?.eligible || []), [eligibility, filterStudents]);
  const filteredIneligible = useMemo(() => filterStudents(eligibility?.ineligible || []), [eligibility, filterStudents]);
  const filteredAlready = useMemo(() => filterStudents(eligibility?.already_promoted || []), [eligibility, filterStudents]);

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <Shield className="w-7 h-7 text-blue-600" />
            Smart Promotions
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
            Order-independent promotion engine — new enrollees are never accidentally promoted
          </p>
        </div>
      </div>

      {/* Step 1: Select Academic Year + Source Class */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">1</span>
          Select Class to Promote
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Academic Year */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Academic Year</label>
            <select
              value={academicYearId}
              onChange={e => { setAcademicYearId(e.target.value); setEligibility(null); setSelectedForPromotion(new Set()); }}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-400"
            >
              <option value="">Select Year</option>
              {years.map((y: YearOption) => (
                <option key={y.id} value={y.id}>{y.name} {y.status === 'active' ? '(Active)' : ''}</option>
              ))}
            </select>
          </div>

          {/* Source Class */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Source Class (From)</label>
            <select
              value={classId}
              onChange={e => { setClassId(e.target.value); setEligibility(null); setSelectedForPromotion(new Set()); setToClassId(''); }}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-400"
            >
              <option value="">Select Class</option>
              {classes.map((c: ClassOption) => (
                <option key={c.id} value={c.id}>{c.name} {c.level !== null ? `(Level ${c.level})` : ''}</option>
              ))}
            </select>
          </div>

          {/* Destination Class (auto-detected) */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Destination Class (To)
              {eligibility?.to_class && <span className="text-green-500 ml-1">(auto-detected)</span>}
            </label>
            <select
              value={toClassId}
              onChange={e => setToClassId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-400"
            >
              <option value="">Select Destination</option>
              {classes.map((c: ClassOption) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Destination Year */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Destination Year</label>
            <select
              value={toAcademicYearId}
              onChange={e => setToAcademicYearId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-400"
            >
              <option value="">Same as source</option>
              {years.map((y: YearOption) => (
                <option key={y.id} value={y.id}>{y.name}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={runAnalysis}
          disabled={!classId || !academicYearId || isAnalysing}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold text-sm disabled:opacity-50 transition-colors"
        >
          {isAnalysing ? <Loader className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Analyse Eligibility
        </button>
      </div>

      {/* Step 2: Analysis Results */}
      {eligibility && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <SummaryCard label="Total in Class" value={eligibility.summary.total_in_class} icon={<Users className="w-4 h-4" />} color="slate" />
            <SummaryCard
              label="Eligible"
              value={eligibility.summary.eligible_count}
              icon={<CheckCircle2 className="w-4 h-4" />}
              color="green"
              onClick={() => { setShowEligible(true); setShowIneligible(false); setShowAlreadyPromoted(false); }}
            />
            <SummaryCard
              label="Ineligible (New)"
              value={eligibility.summary.ineligible_count}
              icon={<Ban className="w-4 h-4" />}
              color="amber"
              onClick={() => { setShowEligible(false); setShowIneligible(true); setShowAlreadyPromoted(false); }}
            />
            <SummaryCard
              label="Already Promoted"
              value={eligibility.summary.already_promoted_count}
              icon={<Check className="w-4 h-4" />}
              color="blue"
              onClick={() => { setShowEligible(false); setShowIneligible(false); setShowAlreadyPromoted(true); }}
            />
            <SummaryCard
              label="Conflicts"
              value={eligibility.summary.conflict_count}
              icon={<AlertTriangle className="w-4 h-4" />}
              color={eligibility.summary.conflict_count > 0 ? 'red' : 'slate'}
            />
          </div>

          {/* Conflicts Warning */}
          {eligibility.conflicts.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 space-y-2">
              <h3 className="text-sm font-bold text-red-700 dark:text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Enrollment Conflicts Detected
              </h3>
              {eligibility.conflicts.map((c, i) => (
                <div key={i} className="text-sm text-red-600 dark:text-red-400 flex items-start gap-2">
                  <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span><strong>{c.type.replace('_', ' ')}:</strong> {c.description} ({c.affected_student_ids.length} affected)</span>
                </div>
              ))}
            </div>
          )}

          {/* Smart Suggestion Banner */}
          {eligibility.summary.eligible_count > 0 && eligibility.to_class && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                    {eligibility.summary.eligible_count} learner{eligibility.summary.eligible_count !== 1 ? 's' : ''} eligible for promotion
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                    {eligibility.from_class.name} <ArrowRight className="w-3 h-3 inline" /> {eligibility.to_class.name}
                    {eligibility.summary.ineligible_count > 0 && (
                      <span className="ml-2 text-amber-600 dark:text-amber-400">
                        ({eligibility.summary.ineligible_count} newly enrolled — will NOT be promoted)
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={handleBulkPromote}
                disabled={isPromoting || selectedForPromotion.size === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg font-semibold text-sm disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {isPromoting ? <Loader className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                Promote {selectedForPromotion.size} Student{selectedForPromotion.size !== 1 ? 's' : ''}
              </button>
            </div>
          )}

          {/* Search within results */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name or admission number..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-400"
            />
          </div>

          {/* Eligible Students */}
          <StudentSection
            title="Eligible for Promotion"
            subtitle="These students have prior enrollment history and can be safely promoted"
            icon={<CheckCircle2 className="w-4 h-4 text-green-600" />}
            students={filteredEligible}
            color="green"
            isOpen={showEligible}
            onToggle={() => setShowEligible(!showEligible)}
            selectable
            selectedIds={selectedForPromotion}
            onToggleStudent={toggleStudent}
            onToggleAll={() => toggleAll(filteredEligible)}
          />

          {/* Ineligible Students */}
          <StudentSection
            title="Ineligible — Newly Enrolled"
            subtitle="These students were directly enrolled in this class — they will NOT be promoted"
            icon={<Ban className="w-4 h-4 text-amber-600" />}
            students={filteredIneligible}
            color="amber"
            isOpen={showIneligible}
            onToggle={() => setShowIneligible(!showIneligible)}
          />

          {/* Already Promoted */}
          <StudentSection
            title="Already Promoted"
            subtitle="These students have already been promoted in this academic year"
            icon={<Check className="w-4 h-4 text-blue-600" />}
            students={filteredAlready}
            color="blue"
            isOpen={showAlreadyPromoted}
            onToggle={() => setShowAlreadyPromoted(!showAlreadyPromoted)}
          />
        </>
      )}

      {/* Empty State */}
      {!eligibility && !isAnalysing && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
          <Shield className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Select a class to analyse
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Choose an academic year and source class, then click &quot;Analyse Eligibility&quot; to see which students
            can be safely promoted and which are newly enrolled.
          </p>
        </div>
      )}

      {isAnalysing && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
          <Loader className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-600 dark:text-slate-400">Analysing enrollment history and eligibility...</p>
        </div>
      )}
    </div>
  );
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

function SummaryCard({
  label, value, icon, color, onClick,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  onClick?: () => void;
}) {
  const colorMap: Record<string, string> = {
    slate: 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300',
    green: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300',
    amber: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
    blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
    red: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300',
  };

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`rounded-xl border p-3.5 text-left transition-all ${colorMap[color] || colorMap.slate} ${onClick ? 'hover:shadow-md cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex items-center gap-2 mb-1.5">{icon}<span className="text-xs font-medium uppercase tracking-wider">{label}</span></div>
      <div className="text-2xl font-bold">{value}</div>
    </button>
  );
}

function StudentSection({
  title, subtitle, icon, students, color, isOpen, onToggle,
  selectable, selectedIds, onToggleStudent, onToggleAll,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  students: EligibilityStudent[];
  color: string;
  isOpen: boolean;
  onToggle: () => void;
  selectable?: boolean;
  selectedIds?: Set<number>;
  onToggleStudent?: (id: number) => void;
  onToggleAll?: () => void;
}) {
  if (students.length === 0) return null;

  const borderColor: Record<string, string> = {
    green: 'border-green-200 dark:border-green-800',
    amber: 'border-amber-200 dark:border-amber-800',
    blue: 'border-blue-200 dark:border-blue-800',
  };

  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl border ${borderColor[color] || 'border-slate-200 dark:border-slate-700'} overflow-hidden`}>
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {icon}
          <div className="text-left">
            <span className="text-sm font-bold text-slate-800 dark:text-white">{title}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">({students.length})</span>
          </div>
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {isOpen && (
        <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700/50">
              <tr>
                {selectable && (
                  <th className="px-4 py-2.5 w-10">
                    <input
                      type="checkbox"
                      checked={students.length > 0 && students.every(s => selectedIds?.has(s.id))}
                      onChange={onToggleAll}
                      className="w-3.5 h-3.5 rounded text-blue-600"
                    />
                  </th>
                )}
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Adm #</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Class</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Type</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Marks</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {students.map(s => (
                <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  {selectable && (
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={selectedIds?.has(s.id) || false}
                        onChange={() => onToggleStudent?.(s.id)}
                        className="w-3.5 h-3.5 rounded text-blue-600"
                      />
                    </td>
                  )}
                  <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-white whitespace-nowrap">
                    {s.first_name} {s.last_name}
                    {s.promoted_from_enrollment_id && (
                      <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300" title="Has enrollment lineage">
                        LINEAGE
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{s.admission_no}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{s.class_name}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                      s.enrollment_type === 'new' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
                      s.enrollment_type === 'continuing' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                      'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                    }`}>
                      {s.enrollment_type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-600 dark:text-slate-400">
                    {s.total_marks != null ? Number(s.total_marks).toFixed(0) : '\u2014'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 max-w-xs truncate" title={s.reason}>
                    {s.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
