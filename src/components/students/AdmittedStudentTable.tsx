"use client";
/**
 * DRAIS — AdmittedStudentTable
 * Shows students who have been admitted but not yet enrolled in the current term.
 * Includes a direct "Enroll" action for each student.
 */
import React, { useState, useCallback, useMemo } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, UserPlus, RefreshCw, GraduationCap, Calendar, Users, CheckCircle2, Circle, MoreVertical } from 'lucide-react';
import clsx from 'clsx';
import { fetcher } from '@/utils/fetcher';
import Pagination from '@/components/ui/Pagination';
import { MediaImg } from '@/components/media/MediaImg';

interface AdmittedStudent {
  id: number;
  admission_no: string | null;
  first_name: string;
  last_name: string;
  other_name?: string;
  gender?: string;
  date_of_birth?: string;
  photo_url?: string;
  admission_date?: string;
  status: string;
}

function Avatar({ student }: { student: AdmittedStudent }) {
  const initials = `${student.first_name?.[0] ?? ''}${student.last_name?.[0] ?? ''}`.toUpperCase();
  if (student.photo_url) {
    return <MediaImg src={student.photo_url} alt={initials} className="w-9 h-9 rounded-full object-cover flex-shrink-0 ring-1 ring-slate-200 dark:ring-slate-700" />;
  }
  const colors = ['bg-blue-100 text-blue-700', 'bg-violet-100 text-violet-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700'];
  const color = colors[(student.id ?? 0) % colors.length];
  return <div className={clsx('w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0', color)}>{initials || '?'}</div>;
}

export default function AdmittedStudentTable() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const limit = 50;

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set('search', search);
    return `/api/students/admitted?${params}`;
  }, [search, page]);

  const { data, isLoading, mutate } = useSWR(buildUrl, fetcher);

  const students: AdmittedStudent[] = useMemo(
    () => [...(data?.data ?? [])].sort((a: AdmittedStudent, b: AdmittedStudent) =>
      (a.last_name ?? '').localeCompare(b.last_name ?? '', undefined, { sensitivity: 'base' }) ||
      (a.first_name ?? '').localeCompare(b.first_name ?? '', undefined, { sensitivity: 'base' })
    ),
    [data]
  );
  const meta = data?.meta ?? {};
  const totalPages = meta.pages ?? 1;

  const allSelected = students.length > 0 && selectedIds.size === students.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < students.length;

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPage(1);
    mutate();
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(students.map(s => s.id)));
    }
  }

  function toggleSelectStudent(id: number) {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  }

  function handleEnrollSelected() {
    if (selectedIds.size === 0) return;
    const studentIds = Array.from(selectedIds).join(',');
    router.push(`/students/enroll-bulk?students=${studentIds}`);
  }

  return (
    <div className="container mx-auto px-4 py-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <form onSubmit={handleSearch} className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={e => { setSearch(e.target.value); if (!e.target.value) { setPage(1); mutate(); } }}
            placeholder="Search by name or admission no…"
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] dark:text-white"
          />
        </form>
        <div className="flex items-center gap-2">
          {meta.current_term_name && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-xs font-semibold text-amber-700 dark:text-amber-400">
              <Calendar className="w-3.5 h-3.5" />
              Not enrolled: {meta.current_term_name}
            </span>
          )}
          {!isLoading && meta.total != null && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <Users className="w-3.5 h-3.5" />
              {meta.total} student{meta.total !== 1 ? 's' : ''}
            </span>
          )}
          <button onClick={() => mutate()} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors" title="Refresh">
            <RefreshCw className="w-4 h-4 text-slate-500" />
          </button>
          <Link href="/students/admit" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white text-sm font-semibold shadow-md hover:opacity-90 transition-opacity">
            <UserPlus className="w-4 h-4" />
            Admit new
          </Link>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/60 backdrop-blur shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="space-y-0 divide-y divide-slate-100 dark:divide-slate-700/50">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse flex items-center gap-3 p-4">
                <div className="w-5 h-5 rounded border bg-slate-200 dark:bg-slate-700 flex-shrink-0" />
                <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-1/3 rounded bg-slate-200 dark:bg-slate-700" />
                  <div className="h-3 w-1/4 rounded bg-slate-100 dark:bg-slate-800" />
                </div>
                <div className="h-8 w-20 rounded-lg bg-slate-100 dark:bg-slate-700" />
              </div>
            ))}
          </div>
        ) : students.length === 0 ? (
          <div className="py-20 text-center">
            <Users className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 dark:text-slate-400 font-medium">
              {search ? 'No students match your search' : 'All admitted students are enrolled this term!'}
            </p>
            {!search && (
              <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
                New students will appear here after admission
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Table Header with Select All */}
            <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-700/20 border-b border-slate-100 dark:border-slate-700/50">
              <button
                onClick={toggleSelectAll}
                className="flex-shrink-0 p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                title={allSelected ? 'Deselect all' : 'Select all'}
              >
                {allSelected ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                ) : someSelected ? (
                  <div className="w-5 h-5 rounded border-2 border-emerald-600 dark:border-emerald-400 bg-emerald-50 dark:bg-emerald-900/30" />
                ) : (
                  <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600" />
                )}
              </button>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select students'}
              </p>
            </div>

            {/* Table Rows */}
            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {students.map(student => {
                const isSelected = selectedIds.has(student.id);
                return (
                  <div
                    key={student.id}
                    className={clsx(
                      'flex items-center gap-3 px-4 py-3 transition-colors',
                      isSelected
                        ? 'bg-emerald-50/60 dark:bg-emerald-900/20'
                        : 'hover:bg-slate-50/80 dark:hover:bg-slate-700/30'
                    )}
                  >
                    <button
                      onClick={() => toggleSelectStudent(student.id)}
                      className="flex-shrink-0 p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                    >
                      {isSelected ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600" />
                      )}
                    </button>
                    <Avatar student={student} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                        {student.first_name} {student.last_name}
                        {student.other_name ? ` ${student.other_name}` : ''}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {student.admission_no && (
                          <span className="text-xs text-slate-500 dark:text-slate-400">#{student.admission_no}</span>
                        )}
                        {student.admission_date && (
                          <span className="text-xs text-slate-400 dark:text-slate-500">Admitted {student.admission_date.slice(0, 10)}</span>
                        )}
                        {student.gender && (
                          <span className="text-xs text-slate-400 dark:text-slate-500">{student.gender}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Link
                        href={`/students/${student.id}`}
                        className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        View
                      </Link>
                      <Link
                        href={`/students/enroll?student_id=${student.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20 hover:bg-[var(--color-primary)]/20 transition-colors font-semibold"
                      >
                        <GraduationCap className="w-3.5 h-3.5" />
                        Enroll
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Sticky Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 shadow-2xl z-50 p-4">
          <div className="container mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-sm font-bold">
                {selectedIds.size}
              </div>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                student{selectedIds.size !== 1 ? 's' : ''} selected
              </span>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => setSelectedIds(new Set())}
                className="flex-1 sm:flex-none px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-sm font-semibold"
              >
                Clear
              </button>
              <button
                onClick={handleEnrollSelected}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors text-sm font-semibold shadow-lg"
              >
                <GraduationCap className="w-4 h-4" />
                Enroll Selected ({selectedIds.size})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className={clsx('mt-4', selectedIds.size > 0 && 'pb-32 sm:pb-24')}>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={meta.total ?? 0}
            itemsPerPage={limit}
            onPageChange={setPage}
          />
        </div>
      )}
      
      {/* Add padding when bulk actions bar is visible */}
      {selectedIds.size > 0 && totalPages <= 1 && (
        <div className="h-24" />
      )}
    </div>
  );
}
