'use client';

/**
 * Offline Academics — the fifth offline module
 * (docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md Phase 7 sub-effort 17,
 * full CRUD added sub-effort 19 on explicit user instruction).
 *
 * Classes and subjects: create/edit/delete. Teacher allocations: assign/
 * end. Marks: enter/correct/remove a score per student per subject — no
 * `resultTypeId` picker exists yet (no ResultTypeRepo in this layer), so
 * it defaults to 1 and is editable as a raw number; a documented gap, not
 * a silent guess.
 *
 * Only reachable today by direct navigation — same reason as every other
 * offline page: the mode-switch UI doesn't expose local-sqlite yet.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, WifiOff, ArrowLeft, Users, BookOpen, Plus, Trash2, UserPlus, ClipboardList, X } from 'lucide-react';

interface ClassSummary { id: number; name: string; code: string | null; classLevel: number | null }
interface SubjectSummary { id: number; name: string; code: string | null }
interface ClassSubjectRow { id: number; subjectId: number; subjectName: string | null; teacherId: number | null; teacherName: string | null; allocationRole: string }
interface ClassStudentRow { studentId: number; name: string; admissionNo: string | null }
interface ClassDetail { id: number; name: string; code: string | null; subjects: ClassSubjectRow[]; roster: ClassStudentRow[] }
interface MarkRow { id: number; studentId: number; score: number | null; grade: string | null; resultTypeId: number }

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) throw new Error(body?.error?.message || `Request failed (${res.status})`);
  return body;
}

export default function OfflineAcademicsPage() {
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [subjects, setSubjects] = useState<SubjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ClassDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [classFormOpen, setClassFormOpen] = useState(false);
  const [classForm, setClassForm] = useState({ name: '', code: '' });
  const [subjectsOpen, setSubjectsOpen] = useState(false);
  const [subjectForm, setSubjectForm] = useState({ name: '', code: '' });
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ subjectId: '', teacherQuery: '', teacherId: '' as string | number });
  const [teacherOptions, setTeacherOptions] = useState<Array<{ id: number; label: string }>>([]);
  const [marksSubject, setMarksSubject] = useState<ClassSubjectRow | null>(null);
  const [marks, setMarks] = useState<Record<number, MarkRow | undefined>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [classesRes, subjectsRes] = await Promise.all([
        api<{ classes: ClassSummary[] }>('/api/academics/offline'),
        api<{ subjects: SubjectSummary[] }>('/api/academics/offline/subjects'),
      ]);
      setClasses(classesRes.classes);
      setSubjects(subjectsRes.subjects);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load academics');
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

  const saveClass = async () => {
    if (!classForm.name.trim()) { setError('Class name is required.'); return; }
    try {
      await api('/api/academics/offline', { method: 'POST', body: JSON.stringify({ name: classForm.name, code: classForm.code || null }) });
      setClassFormOpen(false); setClassForm({ name: '', code: '' });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to save class'); }
  };

  const removeClass = async (id: number) => {
    if (!confirm('Delete this class?')) return;
    try { await api(`/api/academics/offline/${id}`, { method: 'DELETE' }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to delete class'); }
  };

  const saveSubject = async () => {
    if (!subjectForm.name.trim()) { setError('Subject name is required.'); return; }
    try {
      await api('/api/academics/offline/subjects', { method: 'POST', body: JSON.stringify({ name: subjectForm.name, code: subjectForm.code || null }) });
      setSubjectForm({ name: '', code: '' });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to save subject'); }
  };

  const removeSubject = async (id: number) => {
    if (!confirm('Delete this subject?')) return;
    try { await api(`/api/academics/offline/subjects/${id}`, { method: 'DELETE' }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to delete subject'); }
  };

  useEffect(() => {
    const q = assignForm.teacherQuery.trim();
    if (!q) { setTeacherOptions([]); return; }
    let cancelled = false;
    api<{ staff: Array<{ id: number; firstName: string; lastName: string }> }>(`/api/staff/offline?search=${encodeURIComponent(q)}`)
      .then((res) => { if (!cancelled) setTeacherOptions(res.staff.slice(0, 6).map((s) => ({ id: s.id, label: `${s.firstName} ${s.lastName}` }))); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [assignForm.teacherQuery]);

  const assignTeacher = async () => {
    if (!selectedId || !assignForm.subjectId) { setError('Pick a subject first.'); return; }
    try {
      await api('/api/academics/offline/allocations', {
        method: 'POST',
        body: JSON.stringify({ classId: selectedId, subjectId: Number(assignForm.subjectId), teacherId: assignForm.teacherId ? Number(assignForm.teacherId) : null }),
      });
      setAssignOpen(false); setAssignForm({ subjectId: '', teacherQuery: '', teacherId: '' });
      await open(selectedId);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to assign teacher'); }
  };

  const endAllocation = async (id: number) => {
    if (!selectedId) return;
    if (!confirm('End this teacher allocation?')) return;
    try { await api(`/api/academics/offline/allocations/${id}`, { method: 'DELETE' }); await open(selectedId); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to end allocation'); }
  };

  const openMarks = async (subjectRow: ClassSubjectRow) => {
    if (!selectedId) return;
    setMarksSubject(subjectRow);
    try {
      const res = await api<{ results: MarkRow[] }>(`/api/academics/offline/results?classId=${selectedId}&subjectId=${subjectRow.subjectId}`);
      const byStudent: Record<number, MarkRow> = {};
      for (const r of res.results) byStudent[(r as any).studentId] = r;
      setMarks(byStudent);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load marks'); }
  };

  const saveMark = async (studentId: number, score: string) => {
    if (!selectedId || !marksSubject) return;
    setSaving(true);
    try {
      const result = await api<{ result: MarkRow }>('/api/academics/offline/results', {
        method: 'PUT',
        body: JSON.stringify({
          studentId, classId: selectedId, subjectId: marksSubject.subjectId,
          resultTypeId: marks[studentId]?.resultTypeId ?? 1,
          score: score === '' ? null : Number(score),
        }),
      });
      setMarks((m) => ({ ...m, [studentId]: result.result as any }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to save mark'); }
    finally { setSaving(false); }
  };

  const deleteMark = async (studentId: number) => {
    const mark = marks[studentId];
    if (!mark) return;
    try {
      await api(`/api/academics/offline/results/${mark.id}`, { method: 'DELETE' });
      setMarks((m) => ({ ...m, [studentId]: undefined }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to delete mark'); }
  };

  if (marksSubject && selectedId && detail) {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setMarksSubject(null)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <ClipboardList className="w-5 h-5 text-amber-500" />
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">{marksSubject.subjectName || `Subject #${marksSubject.subjectId}`} marks — {detail.name}</h1>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          No result-type picker exists yet — every mark here uses result type #1. {saving && 'Saving…'}
        </p>
        {error && <div className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 text-sm">{error}</div>}
        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-500 border-b border-gray-200 dark:border-slate-700 text-xs uppercase">
              <tr><th className="px-3 py-2 text-left">Student</th><th className="px-3 py-2 text-right">Score</th><th className="px-3 py-2 text-right"></th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
              {detail.roster.length === 0 && <tr><td colSpan={3} className="px-3 py-8 text-center text-gray-400">No students enrolled in this class yet.</td></tr>}
              {detail.roster.map((s) => (
                <tr key={s.studentId}>
                  <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{s.name}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number" defaultValue={marks[s.studentId]?.score ?? ''} placeholder="—"
                      onBlur={(e) => saveMark(s.studentId, e.target.value)}
                      className="w-20 text-right px-2 py-1 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {marks[s.studentId] && (
                      <button onClick={() => deleteMark(s.studentId)} title="Remove this mark" className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

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
          <button onClick={() => setAssignOpen(true)} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium">
            <UserPlus className="w-4 h-4" /> Assign Teacher
          </button>
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
                    <tr><th className="px-3 py-2 text-left">Subject</th><th className="px-3 py-2 text-left">Teacher</th><th className="px-3 py-2 text-left">Role</th><th className="px-3 py-2 text-right">Actions</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                    {detail.subjects.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-400">No subject allocations on this install.</td></tr>}
                    {detail.subjects.map((s) => (
                      <tr key={s.id}>
                        <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{s.subjectName || `Subject #${s.subjectId}`}</td>
                        <td className="px-3 py-2 text-gray-500">{s.teacherName || '—'}</td>
                        <td className="px-3 py-2 text-gray-500">{s.allocationRole.replace('_', ' ')}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => openMarks(s)} className="flex items-center gap-1 px-2 py-1 rounded bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 text-xs hover:bg-gray-200">
                              <ClipboardList className="w-3 h-3" /> Marks
                            </button>
                            <button onClick={() => endAllocation(s.id)} title="End this allocation" className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-500">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
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

        {assignOpen && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setAssignOpen(false)}>
            <div className="bg-white dark:bg-slate-900 rounded-xl p-5 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">Assign Teacher</h2>
                <button onClick={() => setAssignOpen(false)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-400"><X className="w-4 h-4" /></button>
              </div>
              <select value={assignForm.subjectId} onChange={(e) => setAssignForm((f) => ({ ...f, subjectId: e.target.value }))}
                className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm">
                <option value="">Pick a subject…</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <div className="relative">
                <input placeholder="Search teacher by name (optional)…" value={assignForm.teacherQuery}
                  onChange={(e) => setAssignForm((f) => ({ ...f, teacherQuery: e.target.value, teacherId: '' }))}
                  className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm" />
                {teacherOptions.length > 0 && !assignForm.teacherId && (
                  <div className="absolute z-10 mt-1 w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden">
                    {teacherOptions.map((t) => (
                      <button key={t.id} onClick={() => setAssignForm((f) => ({ ...f, teacherQuery: t.label, teacherId: t.id }))}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-900 dark:text-gray-100">
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button onClick={() => setAssignOpen(false)} className="px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800">Cancel</button>
                <button onClick={assignTeacher} className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium">Assign</button>
              </div>
            </div>
          </div>
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
        <button onClick={load} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500" title="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button onClick={() => setSubjectsOpen(true)} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-200">
          <BookOpen className="w-4 h-4" /> Subjects
        </button>
        <button onClick={() => setClassFormOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium">
          <Plus className="w-4 h-4" /> Add Class
        </button>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Classes, subjects, teacher allocations, roster, and marks entry — all editable here. No marks
        entry has a result-type picker yet (defaults to #1); fees and report cards are still separate.
      </p>
      {error && <div className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 text-sm">{error}</div>}
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-gray-500 border-b border-gray-200 dark:border-slate-700 text-xs uppercase">
            <tr><th className="px-3 py-2 text-left">Class</th><th className="px-3 py-2 text-left">Code</th><th className="px-3 py-2 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
            {loading && <tr><td colSpan={3} className="px-3 py-10 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>}
            {!loading && classes.length === 0 && <tr><td colSpan={3} className="px-3 py-12 text-center text-gray-400">No classes on this install yet.</td></tr>}
            {!loading && classes.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{c.name}</td>
                <td className="px-3 py-2 text-gray-500">{c.code || '—'}</td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button onClick={() => open(c.id)} className="px-2 py-1 rounded bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 text-xs hover:bg-gray-200">View</button>
                    <button onClick={() => removeClass(c.id)} title="Delete class" className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {classFormOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setClassFormOpen(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-xl p-5 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Add Class</h2>
            <input placeholder="Class name *" value={classForm.name} onChange={(e) => setClassForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm" />
            <input placeholder="Code" value={classForm.code} onChange={(e) => setClassForm((f) => ({ ...f, code: e.target.value }))}
              className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm" />
            <div className="flex items-center justify-end gap-2 pt-1">
              <button onClick={() => setClassFormOpen(false)} className="px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800">Cancel</button>
              <button onClick={saveClass} className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium">Save</button>
            </div>
          </div>
        </div>
      )}

      {subjectsOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSubjectsOpen(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-xl p-5 w-full max-w-md max-h-[80vh] overflow-y-auto space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Subjects</h2>
              <button onClick={() => setSubjectsOpen(false)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex gap-2">
              <input placeholder="New subject name" value={subjectForm.name} onChange={(e) => setSubjectForm((f) => ({ ...f, name: e.target.value }))}
                className="flex-1 px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm" />
              <input placeholder="Code" value={subjectForm.code} onChange={(e) => setSubjectForm((f) => ({ ...f, code: e.target.value }))}
                className="w-20 px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm" />
              <button onClick={saveSubject} className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium">Add</button>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-slate-800">
              {subjects.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">No subjects yet.</p>}
              {subjects.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-gray-900 dark:text-gray-100">{s.name}{s.code ? ` (${s.code})` : ''}</span>
                  <button onClick={() => removeSubject(s.id)} className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
