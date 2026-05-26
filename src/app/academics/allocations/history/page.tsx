'use client';
import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { History, Calendar, ChevronRight, Loader2, ArrowLeft, Clock } from 'lucide-react';

const fetcher = (u: string) => fetch(u).then(r => r.json());

interface Allocation {
  id: number;
  class_id: number;
  subject_id: number;
  teacher_id: number | null;
  teacher_name: string;
  class_name: string;
  subject_name: string;
  display_initials: string;
  custom_initials: string | null;
  valid_from: string;
  valid_to: string | null;
  term_id: number | null;
}

interface Term { id: number; name: string; start_date: string; end_date: string; is_active: number; }

/**
 * Phase D allocation history viewer — pick a (class, subject) to see
 * every teacher that has ever held the row, with valid_from/valid_to
 * windows. Or pick a term to see the entire roster as it stood then.
 */
export default function AllocationHistoryPage() {
  const [mode, setMode] = useState<'pair' | 'term'>('pair');
  const [classId,   setClassId]   = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [termId,    setTermId]    = useState('');

  const { data: classesRes  } = useSWR('/api/classes',  fetcher);
  const { data: subjectsRes } = useSWR('/api/subjects', fetcher);
  const { data: termsRes    } = useSWR('/api/terms',    fetcher);

  const classes:  any[]  = (classesRes  as any)?.data ?? classesRes  ?? [];
  const subjects: any[]  = (subjectsRes as any)?.data ?? subjectsRes ?? [];
  const terms:    Term[] = (termsRes    as any)?.data ?? termsRes    ?? [];

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (mode === 'pair') {
      if (!classId || !subjectId) return null;
      p.set('class_id',   classId);
      p.set('subject_id', subjectId);
      p.set('history',    '1');
    } else {
      if (!termId) return null;
      p.set('as_of_term', termId);
    }
    return p.toString();
  }, [mode, classId, subjectId, termId]);

  const { data: allocRes, isLoading } = useSWR<{ data: Allocation[] }>(
    qs ? `/api/academics/allocations?${qs}` : null,
    fetcher
  );
  const allocations = allocRes?.data ?? [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <History className="w-6 h-6 text-indigo-500" />
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">Allocation History</h1>
        </div>
        <Link href="/academics/allocations"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to current allocations
        </Link>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        <button onClick={() => setMode('pair')}
          className={`px-4 py-2 text-sm font-semibold ${
            mode === 'pair'
              ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}>
          By Class × Subject
        </button>
        <button onClick={() => setMode('term')}
          className={`px-4 py-2 text-sm font-semibold ${
            mode === 'term'
              ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}>
          Snapshot at Term
        </button>
      </div>

      {/* Pickers */}
      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50">
        {mode === 'pair' ? (
          <div className="grid sm:grid-cols-2 gap-3">
            <Picker label="Class" value={classId} onChange={setClassId} options={classes} placeholder="Select class…" />
            <Picker label="Subject" value={subjectId} onChange={setSubjectId} options={subjects} placeholder="Select subject…" />
          </div>
        ) : (
          <Picker label="Term" value={termId} onChange={setTermId}
            options={terms.map(t => ({ id: t.id, name: `${t.name}  ·  ${t.start_date} → ${t.end_date}` }))}
            placeholder="Select term…" />
        )}
      </div>

      {/* Results */}
      {!qs ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
          <Clock className="w-10 h-10" />
          <p className="text-sm">
            {mode === 'pair'
              ? 'Pick a class and subject to see its full timeline.'
              : 'Pick a term to see who taught what on that term\'s start date.'}
          </p>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div>
      ) : allocations.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10">No allocations match.</p>
      ) : mode === 'pair' ? (
        <Timeline allocations={allocations} />
      ) : (
        <SnapshotTable allocations={allocations} />
      )}
    </div>
  );
}

function Timeline({ allocations }: { allocations: Allocation[] }) {
  // Sort newest first; mark the active (valid_to IS NULL) one.
  const sorted = [...allocations].sort((a, b) => {
    if (!a.valid_to && b.valid_to) return -1;
    if (a.valid_to && !b.valid_to) return 1;
    return new Date(b.valid_from).getTime() - new Date(a.valid_from).getTime();
  });

  return (
    <div className="relative pl-6 space-y-4 border-l-2 border-slate-200 dark:border-slate-700">
      {sorted.map((a, idx) => {
        const isActive = !a.valid_to;
        return (
          <div key={a.id} className="relative">
            <span className={`absolute -left-[31px] top-2 w-4 h-4 rounded-full border-4 ${
              isActive
                ? 'bg-emerald-500 border-emerald-100 dark:border-emerald-900'
                : 'bg-slate-300 dark:bg-slate-600 border-slate-100 dark:border-slate-800'
            }`} />
            <div className={`p-4 rounded-xl border ${
              isActive
                ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
            }`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">{a.teacher_name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {a.class_name} · {a.subject_name}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {a.display_initials && (
                    <span className="font-mono text-xs px-2 py-1 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
                      {a.display_initials}
                    </span>
                  )}
                  {isActive && (
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-200 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200">
                      current
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 text-xs text-slate-500">
                <Calendar className="w-3 h-3" />
                <span className="font-mono">{a.valid_from}</span>
                <ChevronRight className="w-3 h-3" />
                <span className="font-mono">{a.valid_to ?? 'present'}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SnapshotTable({ allocations }: { allocations: Allocation[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800">
          <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3">Class</th>
            <th className="px-4 py-3">Subject</th>
            <th className="px-4 py-3">Teacher</th>
            <th className="px-4 py-3">Initials</th>
            <th className="px-4 py-3">Valid From</th>
            <th className="px-4 py-3">Valid To</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {allocations.map(a => (
            <tr key={a.id} className="bg-white dark:bg-slate-900">
              <td className="px-4 py-3">{a.class_name}</td>
              <td className="px-4 py-3">{a.subject_name}</td>
              <td className="px-4 py-3 font-semibold">{a.teacher_name}</td>
              <td className="px-4 py-3 font-mono text-xs">{a.display_initials || '—'}</td>
              <td className="px-4 py-3 font-mono text-xs text-slate-500">{a.valid_from}</td>
              <td className="px-4 py-3 font-mono text-xs text-slate-500">{a.valid_to ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Picker({
  label, value, onChange, options, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: number; name: string }[];
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
      >
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}
