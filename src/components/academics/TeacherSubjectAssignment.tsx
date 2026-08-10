'use client';

/**
 * Assign subjects to ONE teacher, from that teacher's own profile.
 *
 * WHY THIS EXISTS
 * ---------------
 * Allocation could previously only be done from the class-matrix at
 * /academics/allocations, which renders `classes × subjects`. For ALBAYAN that
 * is 20 × 39 = 780 cells, of which only 167 are real class-subject pairs — so
 * 613 cells offer combinations that do not exist. Every cell holds a <Select>
 * listing every teacher with no search: 39 at ALBAYAN, 197 at Jinja. The
 * search box on that page filters the RESULTS TABLE, not the dropdown you
 * actually pick from.
 *
 * This inverts it. You are already looking at a teacher, so the question is
 * "what does this person teach?" — which is how the work is actually described
 * ("Mr Okello takes S.1 and S.2 Maths"), and it needs no teacher picker at all.
 *
 * ONLY REAL PAIRS
 * ---------------
 * Rows come from `class_subjects`, so every row shown is a subject a class
 * genuinely takes. An impossible combination cannot be offered, which is the
 * structural fix the matrix needs and the reason this list is short enough to
 * read.
 *
 * REASSIGNMENT IS EXPLICIT
 * ------------------------
 * Taking a subject from another teacher is a real act with consequences for
 * mark entry and report initials, so it is named and confirmed rather than
 * happening silently behind a dropdown change.
 *
 * The server remains the authority: POST /api/academics/allocations enforces
 * session, tenant, module and permission, and supersedes rows temporally
 * (valid_from / valid_to) rather than overwriting, so the history survives.
 */
import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  BookOpen, Search, Loader2, Check, X, AlertTriangle, UserMinus, UserPlus,
} from 'lucide-react';

const fetcher = (u: string) => fetch(u).then((r) => r.json());

interface Pair {
  id: number;
  class_id: number;
  class_name: string;
  subject_id: number;
  subject_name: string;
  teacher_id: number | null;
  teacher_name?: string | null;
}

export function TeacherSubjectAssignment({
  staffId,
  staffName,
}: {
  staffId: number;
  staffName?: string;
}) {
  const { data, isLoading, mutate } = useSWR<any>('/api/academics/allocations', fetcher, {
    revalidateOnFocus: false,
  });
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);

  // GET /api/academics/allocations returns { success, data, count }.
  const pairs: Pair[] = useMemo(
    () => (Array.isArray(data?.data) ? data.data : []),
    [data],
  );

  const mineCount = pairs.filter((p) => Number(p.teacher_id) === staffId).length;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return pairs.filter((p) => {
      if (onlyMine && Number(p.teacher_id) !== staffId) return false;
      if (!needle) return true;
      return (
        p.class_name?.toLowerCase().includes(needle) ||
        p.subject_name?.toLowerCase().includes(needle)
      );
    });
  }, [pairs, q, onlyMine, staffId]);

  const byClass = useMemo(() => {
    const m = new Map<string, Pair[]>();
    for (const p of shown) {
      const k = p.class_name || '—';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [shown]);

  async function setTeacher(p: Pair, teacherId: number | null) {
    // Naming the current holder matters: silently taking a subject from a
    // colleague changes who may enter marks and whose initials print.
    if (teacherId !== null && p.teacher_id && Number(p.teacher_id) !== staffId) {
      const ok = window.confirm(
        `${p.subject_name} for ${p.class_name} is currently taught by ${p.teacher_name || 'another teacher'}.\n\n` +
          `Reassign it to ${staffName || 'this teacher'}?\n\n` +
          `The previous allocation is kept in history, not deleted.`,
      );
      if (!ok) return;
    }

    setBusy(p.id);
    setMsg(null);
    try {
      const res = await fetch('/api/academics/allocations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          class_id: p.class_id,
          subject_id: p.subject_id,
          teacher_id: teacherId,
          custom_initials: null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.success === false) {
        setMsg({ kind: 'err', text: j?.message || j?.error || 'Could not save the allocation.' });
      } else {
        setMsg({
          kind: 'ok',
          text: teacherId === null
            ? `Removed ${p.subject_name} — ${p.class_name}`
            : `Assigned ${p.subject_name} — ${p.class_name}`,
        });
        await mutate();
      }
    } catch {
      setMsg({ kind: 'err', text: 'Could not reach the server.' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm space-y-4">
      <div className="flex items-center gap-2 pb-1 border-b border-slate-100 dark:border-slate-800">
        <BookOpen className="w-4 h-4 text-indigo-500" />
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Assign subjects
        </h2>
        <span className="ml-auto text-xs text-slate-400">
          {mineCount} assigned to {staffName || 'this teacher'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by class or subject…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button
          onClick={() => setOnlyMine((v) => !v)}
          className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${
            onlyMine
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          {onlyMine ? 'Showing assigned only' : 'Show assigned only'}
        </button>
      </div>

      {msg && (
        <div
          className={`px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${
            msg.kind === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300'
          }`}
        >
          {msg.kind === 'ok' ? <Check className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          {msg.text}
          <button onClick={() => setMsg(null)} className="ml-auto opacity-60 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-slate-400 flex items-center gap-2 py-4">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading subjects…
        </p>
      ) : pairs.length === 0 ? (
        // Says WHY it is empty and what to do — for CITY PARENTS and Jinja this
        // is the real state today: classes exist but no subjects are set up, so
        // there is nothing that could be allocated.
        <div className="py-6 text-center space-y-1">
          <p className="text-sm text-slate-600 dark:text-slate-300">No subjects are set up for any class yet.</p>
          <p className="text-xs text-slate-400">
            Add subjects to classes under Academics → Class subjects, then assign teachers here.
          </p>
        </div>
      ) : shown.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-400">
          Nothing matches “{q}”{onlyMine ? ' among assigned subjects' : ''}.
        </p>
      ) : (
        <div className="space-y-4 max-h-[28rem] overflow-y-auto pr-1">
          {byClass.map(([className, rows]) => (
            <div key={className}>
              <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1.5">
                {className}
              </p>
              <div className="space-y-1">
                {rows.map((p) => {
                  const mine = Number(p.teacher_id) === staffId;
                  const takenByOther = !!p.teacher_id && !mine;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                        mine
                          ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/60 dark:bg-indigo-900/20'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <span className="flex-1 min-w-0">
                        <span className="text-slate-800 dark:text-slate-100">{p.subject_name}</span>
                        {takenByOther && (
                          <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            currently {p.teacher_name}
                          </span>
                        )}
                        {!p.teacher_id && (
                          <span className="block text-[11px] text-amber-600 dark:text-amber-400">unassigned</span>
                        )}
                      </span>

                      {busy === p.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                      ) : mine ? (
                        <button
                          onClick={() => setTeacher(p, null)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <UserMinus className="w-3 h-3" /> Remove
                        </button>
                      ) : (
                        <button
                          onClick={() => setTeacher(p, staffId)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
                        >
                          <UserPlus className="w-3 h-3" /> {takenByOther ? 'Reassign' : 'Assign'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-slate-400">
        Only subjects a class actually takes are listed. Changes are recorded with history — a previous
        allocation is superseded, never deleted.
      </p>
    </div>
  );
}
