'use client';

/**
 * Offline Report Snapshots — the fourth offline module
 * (docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md Phase 7 sub-effort 20).
 *
 * Deliberately NOT the real DRCE render pipeline — this is a raw-data
 * view of an already-generated snapshot (per-class, per-student scores),
 * not the printed report card layout. Generating a snapshot is still
 * online-only; this only ever views one that was already carried into
 * the local file.
 *
 * Only reachable today by direct navigation — same reason as every other
 * offline page: the mode-switch UI doesn't expose local-sqlite yet.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, WifiOff, FileText, ArrowLeft } from 'lucide-react';

interface SnapshotSummary {
  snapshotId: string;
  type: string;
  status: string;
  termName: string | null;
  yearName: string | null;
  classCount: number;
  studentCount: number;
  generatedAt: string;
}

interface SnapshotStudentRow {
  id: string;
  name: string;
  admissionNumber: string;
  total: number;
  average: number;
  position: number;
  scores: Record<string, { displayScore: string; grade: string }>;
}

interface SnapshotClassView {
  classId: number;
  className: string;
  stream: string;
  subjectNames: string[];
  students: SnapshotStudentRow[];
}

interface SnapshotDetail {
  snapshotId: string;
  schoolName: string | null;
  termName: string | null;
  yearName: string | null;
  generatedAt: string;
  classes: SnapshotClassView[];
}

async function api<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) throw new Error(body?.error?.message || `Request failed (${res.status})`);
  return body;
}

export default function OfflineReportsPage() {
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SnapshotDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [classIndex, setClassIndex] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ snapshots: SnapshotSummary[] }>('/api/reports/offline');
      setSnapshots(res.snapshots);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report snapshots');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const open = async (snapshotId: string) => {
    setSelectedId(snapshotId);
    setDetail(null);
    setClassIndex(0);
    setDetailLoading(true);
    try {
      const res = await api<{ snapshot: SnapshotDetail }>(`/api/reports/offline/${snapshotId}`);
      setDetail(res.snapshot);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load snapshot');
    } finally {
      setDetailLoading(false);
    }
  };

  const activeClass = detail?.classes[classIndex] ?? null;

  if (selectedId) {
    return (
      <div className="max-w-5xl mx-auto p-4 space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setSelectedId(null)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <WifiOff className="w-5 h-5 text-amber-500" />
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {detail?.termName || 'Report'} {detail?.yearName ? `— ${detail.yearName}` : ''}
          </h1>
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">Local SQLite</span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Raw scores from an already-generated report card — not the printed layout. Generating a new
          report still requires being online.
        </p>
        {error && <div className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 text-sm">{error}</div>}
        {detailLoading && <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin inline text-gray-400" /></div>}
        {!detailLoading && detail && (
          <>
            {detail.classes.length > 1 && (
              <div className="flex gap-2 flex-wrap">
                {detail.classes.map((c, i) => (
                  <button key={c.classId} onClick={() => setClassIndex(i)}
                    className={`px-3 py-1.5 rounded-lg text-sm ${i === classIndex ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300'}`}>
                    {c.className}{c.stream ? ` ${c.stream}` : ''}
                  </button>
                ))}
              </div>
            )}
            {activeClass && (
              <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-gray-500 border-b border-gray-200 dark:border-slate-700 text-xs uppercase">
                    <tr>
                      <th className="px-3 py-2 text-left">Student</th>
                      <th className="px-3 py-2 text-left">Admission No</th>
                      {activeClass.subjectNames.map((s) => <th key={s} className="px-3 py-2 text-right">{s}</th>)}
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-right">Average</th>
                      <th className="px-3 py-2 text-right">Position</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                    {activeClass.students.length === 0 && (
                      <tr><td colSpan={activeClass.subjectNames.length + 5} className="px-3 py-10 text-center text-gray-400">No students in this class.</td></tr>
                    )}
                    {activeClass.students.map((st) => (
                      <tr key={st.id}>
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{st.name}</td>
                        <td className="px-3 py-2 font-mono text-gray-500">{st.admissionNumber}</td>
                        {activeClass.subjectNames.map((s) => (
                          <td key={s} className="px-3 py-2 text-right text-gray-500">{st.scores[s]?.displayScore ?? '—'}</td>
                        ))}
                        <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{st.total}</td>
                        <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{st.average}</td>
                        <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{st.position}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <WifiOff className="w-5 h-5 text-amber-500" />
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Report Snapshots (Offline)</h1>
        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">Local SQLite</span>
        <button onClick={load} className="ml-auto p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500" title="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Already-generated report cards carried into this local file. Raw scores only — not the printed
        layout, and generating a new report still requires being online.
      </p>
      {error && <div className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 text-sm">{error}</div>}
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-gray-500 border-b border-gray-200 dark:border-slate-700 text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Term</th>
              <th className="px-3 py-2 text-left">Year</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-right">Classes</th>
              <th className="px-3 py-2 text-right">Students</th>
              <th className="px-3 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
            {loading && <tr><td colSpan={6} className="px-3 py-10 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>}
            {!loading && snapshots.length === 0 && <tr><td colSpan={6} className="px-3 py-12 text-center text-gray-400">No report snapshots on this install yet.</td></tr>}
            {!loading && snapshots.map((s) => (
              <tr key={s.snapshotId}>
                <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{s.termName || `Term #${s.snapshotId.slice(0, 6)}`}</td>
                <td className="px-3 py-2 text-gray-500">{s.yearName || '—'}</td>
                <td className="px-3 py-2 text-gray-500 capitalize">{s.type}</td>
                <td className="px-3 py-2 text-right text-gray-500">{s.classCount}</td>
                <td className="px-3 py-2 text-right text-gray-500">{s.studentCount}</td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => open(s.snapshotId)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 text-xs hover:bg-gray-200">
                    <FileText className="w-3 h-3" /> View
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
