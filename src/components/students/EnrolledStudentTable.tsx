"use client";
/**
 * DRAIS Phase 1 — EnrolledStudentTable
 * Term-aware student list. Shows students enrolled in the CURRENT TERM by default.
 * Supports full filtering by year / term / class / stream, plus historical view.
 */
import React, { useState, useCallback, useMemo } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search, Filter, Users, UserCheck, Clock, Eye, Edit2,
  Download, ChevronDown, ChevronUp, BookOpen, LayoutGrid, List,
  GraduationCap, RefreshCw, UserPlus, Layers,
} from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'react-hot-toast';
import { fetcher } from '@/utils/fetcher';
import Pagination from '@/components/ui/Pagination';

// ---------- Types ----------

interface TermOption { id: number; name: string; academic_year_id?: number; academic_year_name: string; }
interface ClassOption { id: number; name: string; level?: number; }
interface StreamOption { id: number; name: string; }
interface AcademicYearOption { id: number; name: string; }

interface EnrolledStudent {
  enrollment_id: number;
  student_id: number;
  id: number;
  admission_no?: string;
  first_name: string;
  last_name: string;
  other_name?: string;
  gender?: string;
  date_of_birth?: string;
  photo_url?: string;
  phone?: string;
  enrollment_type?: string;
  enrollment_status?: string;
  class_name?: string;
  class_level?: number;
  stream_name?: string;
  academic_year_name?: string;
  term_name?: string;
  joined_at?: string;
}

// ---------- Skeleton ----------

function RowSkeleton() {
  return (
    <div className="animate-pulse flex items-center gap-3 p-4 border-b border-slate-100 dark:border-slate-700/50">
      <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-1/3 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-3 w-1/4 rounded bg-slate-100 dark:bg-slate-800" />
      </div>
      <div className="h-6 w-20 rounded-full bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-700" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-3 w-1/3 rounded bg-slate-100 dark:bg-slate-800" />
        </div>
      </div>
      <div className="h-3 w-1/2 rounded bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}

// ---------- Avatar ----------

function Avatar({ student }: { student: EnrolledStudent }) {
  const initials = `${student.first_name?.[0] ?? ''}${student.last_name?.[0] ?? ''}`.toUpperCase();
  if (student.photo_url) {
    return (
      <img
        src={student.photo_url}
        alt={initials}
        className="w-9 h-9 rounded-full object-cover ring-2 ring-white dark:ring-slate-700 shadow"
      />
    );
  }
  const colors = [
    'from-indigo-500 to-purple-600',
    'from-emerald-500 to-teal-600',
    'from-pink-500 to-rose-600',
    'from-amber-500 to-orange-600',
    'from-cyan-500 to-blue-600',
  ];
  const color = colors[(student.id ?? 0) % colors.length];
  return (
    <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-white text-xs font-bold shadow`}>
      {initials}
    </div>
  );
}

// ---------- Enrollment type badge ----------

const enrollmentTypeBadge: Record<string, string> = {
  new: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  continuing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  transfer: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  repeat: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
};

// ---------- Main Component ----------

export default function EnrolledStudentTable() {
  const router = useRouter();

  // View state
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [historical, setHistorical] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Filter state
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [termId, setTermId] = useState('');
  const [academicYearId, setAcademicYearId] = useState('');
  const [classId, setClassId] = useState('');
  const [streamId, setStreamId] = useState('');
  const [page, setPage] = useState(1);
  const LIMIT = 50;

  // Debounce search
  const handleSearchChange = (val: string) => {
    setSearch(val);
    clearTimeout((handleSearchChange as any)._t);
    (handleSearchChange as any)._t = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 350);
  };

  // Build query string
  const queryStr = useMemo(() => {
    const p = new URLSearchParams();
    if (historical) p.set('historical', 'true');
    if (termId) p.set('term_id', termId);
    if (academicYearId) p.set('academic_year_id', academicYearId);
    if (classId) p.set('class_id', classId);
    if (streamId) p.set('stream_id', streamId);
    if (debouncedSearch) p.set('search', debouncedSearch);
    p.set('page', String(page));
    p.set('limit', String(LIMIT));
    return p.toString();
  }, [historical, termId, academicYearId, classId, streamId, debouncedSearch, page]);

  // Data fetches
  const { data, isLoading, mutate } = useSWR<any>(`/api/students/enrolled?${queryStr}`, fetcher);
  const { data: termData } = useSWR<any>('/api/terms/current', fetcher);
  const { data: classData } = useSWR<any>('/api/classes', fetcher);
  const { data: streamData } = useSWR<any>('/api/streams', fetcher);

  const students: EnrolledStudent[] = useMemo(() => {
    const raw: EnrolledStudent[] = data?.data ?? [];
    return [...raw].sort((a, b) =>
      (a.last_name ?? '').localeCompare(b.last_name ?? '', undefined, { sensitivity: 'base' }) ||
      (a.first_name ?? '').localeCompare(b.first_name ?? '', undefined, { sensitivity: 'base' })
    );
  }, [data]);
  const meta = data?.meta ?? {};
  const currentTerm: TermOption | null = termData?.data?.current ?? null;
  const allTerms: TermOption[] = termData?.data?.all ?? [];
  const classes: ClassOption[] = classData?.data ?? [];
  const streams: StreamOption[] = streamData?.data ?? [];

  // Unique academic years from terms list
  const academicYears: AcademicYearOption[] = useMemo(() => {
    const seen = new Set<string>();
    return allTerms
      .filter((t: TermOption) => { if (seen.has(String(t.academic_year_name))) return false; seen.add(String(t.academic_year_name)); return true; })
      .map((t: TermOption) => ({ id: t.academic_year_id as any, name: t.academic_year_name }));
  }, [allTerms]);

  const resetFilters = () => {
    setSearch(''); setDebouncedSearch('');
    setTermId(''); setAcademicYearId('');
    setClassId(''); setStreamId('');
    setPage(1);
  };

  const handleExport = useCallback(async () => {
    try {
      const resp = await fetch(`/api/students/export?${queryStr}`);
      if (!resp.ok) throw new Error('Export failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `students-${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch {
      toast.error('Export failed');
    }
  }, [queryStr]);

  // ---------- Active term chip ----------
  const termChip = currentTerm && !historical && !termId ? (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-semibold">
      <Clock className="w-3 h-3" />
      {currentTerm.academic_year_name} · {currentTerm.name}
    </span>
  ) : null;

  // ---------- Header ----------
  return (
    <div className="px-4 py-6 space-y-5">
      {/* Title row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Students</h1>
            <div className="flex items-center gap-2 mt-0.5">
              {termChip}
              {!isLoading && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {meta.total ?? students.length} student{(meta.total ?? students.length) !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Current / Historical toggle */}
          <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
            <button
              onClick={() => { setHistorical(false); resetFilters(); }}
              className={clsx(
                'px-3 py-1.5 text-xs font-semibold transition-colors',
                !historical
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
              )}
            >
              Current Students
            </button>
            <button
              onClick={() => { setHistorical(true); setPage(1); }}
              className={clsx(
                'px-3 py-1.5 text-xs font-semibold transition-colors',
                historical
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
              )}
            >
              <Layers className="w-3 h-3 inline mr-1" />
              Historical
            </button>
          </div>

          {/* View mode */}
          <div className="hidden sm:flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
            <button onClick={() => setViewMode('table')} className={clsx('p-1.5 transition-colors', viewMode === 'table' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400')}>
              <List className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('cards')} className={clsx('p-1.5 transition-colors', viewMode === 'cards' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400')}>
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>

          <Link
            href="/students/enroll"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-semibold shadow-md hover:from-indigo-700 hover:to-purple-700 transition-all"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Enroll Student
          </Link>

          <Link
            href="/students/admit"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold shadow-md hover:bg-emerald-700 transition-all"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Admit Student
          </Link>
        </div>
      </div>

      {/* Search + Filter row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search name or admission no…"
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition"
          />
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold shadow-sm transition-colors',
            showFilters
              ? 'bg-indigo-600 border-indigo-600 text-white'
              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
          )}
        >
          <Filter className="w-3.5 h-3.5" />
          Filters
          {showFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {(termId || academicYearId || classId || streamId || debouncedSearch) && (
          <button
            onClick={resetFilters}
            className="flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-50 shadow-sm transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>

      {/* Expanded Filters */}
      {showFilters && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm">
          {/* Academic Year */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Academic Year</label>
            <select
              value={academicYearId}
              onChange={e => { setAcademicYearId(e.target.value); setTermId(''); setPage(1); }}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Years</option>
              {academicYears.map(y => (
                <option key={y.id} value={y.id}>{y.name}</option>
              ))}
            </select>
          </div>

          {/* Term */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Term</label>
            <select
              value={termId}
              onChange={e => { setTermId(e.target.value); setPage(1); }}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">{historical ? 'All Terms' : 'Current Term'}</option>
              {allTerms.map((t: TermOption) => (
                <option key={t.id} value={t.id}>{t.academic_year_name} · {t.name}</option>
              ))}
            </select>
          </div>

          {/* Class */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Class</label>
            <select
              value={classId}
              onChange={e => { setClassId(e.target.value); setStreamId(''); setPage(1); }}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Classes</option>
              {classes.map((c: ClassOption) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Stream */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Stream</label>
            <select
              value={streamId}
              onChange={e => { setStreamId(e.target.value); setPage(1); }}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Streams</option>
              {streams.map((s: StreamOption) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="rounded-2xl overflow-hidden bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm">
        {isLoading ? (
          viewMode === 'cards'
            ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">{Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}</div>
            : <div>{Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} />)}</div>
        ) : students.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-1">No students enrolled</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
              {historical
                ? 'No enrollment records match your filters.'
                : `No students are enrolled in ${currentTerm ? `${currentTerm.academic_year_name} · ${currentTerm.name}` : 'the current term'}.`}
            </p>
            <div className="flex gap-2 mt-5">
              <Link href="/students/enroll" className="btn-primary text-xs px-4 py-2 rounded-xl">
                Enroll a Student
              </Link>
              {!!termId || !!classId ? (
                <button onClick={resetFilters} className="btn-secondary text-xs px-4 py-2 rounded-xl">
                  Clear Filters
                </button>
              ) : null}
            </div>
          </div>
        ) : viewMode === 'cards' ? (
          <CardView students={students} router={router} />
        ) : (
          <TableView students={students} router={router} />
        )}
      </div>

      {/* Pagination */}
      {!isLoading && (meta.total ?? 0) > LIMIT && (
        <div className="flex justify-center">
          <Pagination
            currentPage={page}
            totalPages={meta.pages ?? 1}
            totalItems={meta.total ?? 0}
            itemsPerPage={LIMIT}
            onPageChange={(p) => { setPage(p); window.scrollTo(0, 0); }}
          />
        </div>
      )}
    </div>
  );
}

// ---------- Table View ----------

function TableView({ students, router }: { students: EnrolledStudent[]; router: any }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
            {['Student', 'Adm. No', 'Class', 'Stream', 'Term', 'Type', ''].map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
          {students.map(s => (
            <tr
              key={s.enrollment_id}
              className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors group cursor-pointer"
              onClick={() => router.push(`/students/${s.student_id}`)}
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Avatar student={s} />
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {s.first_name} {s.last_name}
                      {s.other_name ? ` ${s.other_name}` : ''}
                    </p>
                    {s.gender && (
                      <p className="text-xs text-slate-400 capitalize">{s.gender}</p>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300 font-mono">
                {s.admission_no ?? '—'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                {s.class_name ?? '—'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                {s.stream_name ?? '—'}
              </td>
              <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {s.academic_year_name} · {s.term_name}
              </td>
              <td className="px-4 py-3">
                {s.enrollment_type && (
                  <span className={clsx('inline-flex px-2 py-0.5 rounded-full text-xs font-semibold capitalize', enrollmentTypeBadge[s.enrollment_type] ?? 'bg-slate-100 text-slate-600')}>
                    {s.enrollment_type}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={e => { e.stopPropagation(); router.push(`/students/${s.student_id}`); }}
                  className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-slate-400 hover:text-indigo-600 transition-colors"
                >
                  <Eye className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Card View (mobile-first) ----------

function CardView({ students, router }: { students: EnrolledStudent[]; router: any }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
      {students.map(s => (
        <button
          key={s.enrollment_id}
          onClick={() => router.push(`/students/${s.student_id}`)}
          className="group text-left rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500 hover:shadow-lg shadow-sm transition-all p-4 space-y-3 active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <Avatar student={s} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-slate-800 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate transition-colors">
                {s.first_name} {s.last_name}
              </p>
              <p className="text-xs text-slate-400 font-mono">{s.admission_no ?? 'No Adm. No'}</p>
            </div>
            {s.enrollment_type && (
              <span className={clsx('inline-flex px-2 py-0.5 rounded-full text-xs font-semibold capitalize flex-shrink-0', enrollmentTypeBadge[s.enrollment_type] ?? 'bg-slate-100 text-slate-600')}>
                {s.enrollment_type}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div>
              <span className="text-slate-400">Class</span>
              <p className="font-medium text-slate-700 dark:text-slate-200 truncate">{s.class_name ?? '—'}</p>
            </div>
            <div>
              <span className="text-slate-400">Stream</span>
              <p className="font-medium text-slate-700 dark:text-slate-200 truncate">{s.stream_name ?? '—'}</p>
            </div>
            <div className="col-span-2">
              <span className="text-slate-400">Term</span>
              <p className="font-medium text-slate-700 dark:text-slate-200">{s.academic_year_name} · {s.term_name}</p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
