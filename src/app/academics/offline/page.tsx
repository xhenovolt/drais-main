'use client';

/**
 * Offline Academics — the fifth offline module
 * (docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md Phase 7 sub-effort 17).
 *
 * Browse classes, see who teaches what in one and who's currently
 * enrolled — read-only. No marks entry here; class_results is a separate,
 * deliberately-not-yet-attempted piece (real write-heavy conflict risk,
 * same class of problem as online `results`).
 *
 * Only reachable today by direct navigation — same reason as every other
 * offline page: the mode-switch UI doesn't expose local-sqlite yet.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, WifiOff, ArrowLeft, Users, BookOpen } from 'lucide-react';

interface ClassSummary { id: number; name: string; code: string | null; classLevel: number | null }
interface ClassSubjectRow { subjectId: number; subjectName: string | null; teacherId: number | null; teacherName: string | null; allocationRole: string }
interface ClassStudentRow { studentId: number; name: string; admissionNo: string | null }
interface ClassDetail { id: number; name: string; code: string | null; subjects: ClassSubjectRow[]; roster: ClassStudentRow[] }

async function api<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) throw new Error(body?.error?.message || `Request failed (${res.status})`);
  return body;
}

export default function OfflineAcademicsPage() {
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ClassDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ classes: ClassSummary[] }>('/api/academics/offline');
      setClasses(res.classes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load classes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const open = async (id: number) => {
    setSelectedId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await api<{ class: ClassDetail }>(`/api/academics/offline/${id}`);
      setDetail(res.class);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load class');
    } finally {
      setDetailLoading(false);
    }
  };

  if (selectedId) {
    return (
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setSelectedId(null)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <WifiOff className="w-5 h-5 text-amber-500" />
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">{detail?.name ?? '…'}</h1>
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">Local SQLite</span>
        </div>
        {error && <div className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 text-sm">{error}</div>}
        {detailLoading && <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin inline text-gray-400" /></div>}
        {!detailLoading && detail && (
          <>
            <div>
              <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2"><BookOpen className="w-4 h-4" /> Subjects & teachers</p>
              <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-gray-500 border-b border-gray-200 dark:border-slate-700 text-xs uppercase">
                    <tr><th className="px-3 py-2 text-left">Subject</th><th className="px-3 py-2 text-left">Teacher</th><th className="px-3 py-2 text-left">Role</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                    {detail.subjects.length === 0 && <tr><td colSpan={3} className="px-3 py-8 text-center text-gray-400">No subject allocations on this install.</td></tr>}
                    {detail.subjects.map((s) => (
                      <tr key={s.subjectId}>
                        <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{s.subjectName || `Subject #${s.subjectId}`}</td>
                        <td className="px-3 py-2 text-gray-500">{s.teacherName || '—'}</td>
                        <td className="px-3 py-2 text-gray-500">{s.allocationRole.replace('_', ' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2"><Users className="w-4 h-4" /> Roster ({detail.roster.length})</p>
              <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-gray-500 border-b border-gray-200 dark:border-slate-700 text-xs uppercase">
                    <tr><th className="px-3 py-2 text-left">Student</th><th className="px-3 py-2 text-left">Admission No</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                    {detail.roster.length === 0 && <tr><td colSpan={2} className="px-3 py-8 text-center text-gray-400">No students currently enrolled in this class, on this install.</td></tr>}
                    {detail.roster.map((s) => (
                      <tr key={s.studentId}>
                        <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{s.name}</td>
                        <td className="px-3 py-2 font-mono text-gray-500">{s.admissionNo || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <WifiOff className="w-5 h-5 text-amber-500" />
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Academics (Offline)</h1>
        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">Local SQLite</span>
        <button onClick={load} className="ml-auto p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500" title="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Classes, their subject/teacher allocations, and current roster — read-only. Marks entry isn't
        part of this offline screen yet.
      </p>
      {error && <div className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 text-sm">{error}</div>}
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-gray-500 border-b border-gray-200 dark:border-slate-700 text-xs uppercase">
            <tr><th className="px-3 py-2 text-left">Class</th><th className="px-3 py-2 text-left">Code</th><th className="px-3 py-2 text-right"></th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
            {loading && <tr><td colSpan={3} className="px-3 py-10 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>}
            {!loading && classes.length === 0 && <tr><td colSpan={3} className="px-3 py-12 text-center text-gray-400">No classes on this install yet.</td></tr>}
            {!loading && classes.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{c.name}</td>
                <td className="px-3 py-2 text-gray-500">{c.code || '—'}</td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => open(c.id)}
                    className="px-2 py-1 rounded bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 text-xs hover:bg-gray-200">
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
