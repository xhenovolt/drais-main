'use client';
/**
 * /academics/classes/[id]
 *
 * Phase G — read-only class detail. Surfaces:
 *   - Class metadata (name, level, capacity, active enrolment)
 *   - Subjects allocated to the class, each with teacher + initials
 *   - Class-teacher history (current + past assignments)
 *
 * Pure consumer of /api/academics/classes/[id]/detail. No mutations —
 * editing happens in the existing allocation admin surface; this page
 * is the "where am I?" landing zone for any operator or teacher
 * who clicks into a class from elsewhere in the app.
 */
import React, { use } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { ArrowLeft, Loader2, AlertTriangle, GraduationCap, Users, BookOpen, UserCheck, Hash } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface PageProps { params: Promise<{ id: string }>; }

interface Detail {
  class: {
    id: number; name: string; level: string | null; capacity: number | null;
    programName: string | null; activeEnrollments: number;
    deletedAt: string | null;
  };
  subjects: Array<{
    allocationId: number; subjectId: number; subjectName: string;
    subjectCode: string | null; subjectType: string | null;
    academicType: string | null;
    teacherId: number | null; teacherName: string | null;
    initials: string | null;
  }>;
  classTeachers: Array<{
    id: number; staffId: number; staffName: string; termId: number;
    streamId: number | null; assignedAt: string; validUntil: string | null;
    notes: string | null;
  }>;
}

export default function ClassDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const { data, error, isLoading } = useSWR<Detail & { error?: string }>(
    id ? `/api/academics/classes/${id}/detail` : null, fetcher,
    { revalidateOnFocus: false },
  );

  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (error || !data || data.error) {
    return (
      <div className="p-6 max-w-2xl">
        <div className="rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/40 p-4 flex items-start gap-2 text-sm text-rose-700">
          <AlertTriangle className="w-4 h-4 mt-0.5" />
          <div>
            <div className="font-semibold">Could not load class</div>
            <div>{data?.error || (error as Error)?.message || 'Unknown error'}</div>
          </div>
        </div>
      </div>
    );
  }

  const { class: cls, subjects, classTeachers } = data;
  const currentTeacher = classTeachers.find(ct => ct.validUntil === null) || null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <Link
        href="/academics/classes"
        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> All classes
      </Link>

      {/* Header */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 flex items-center justify-center flex-shrink-0">
          <GraduationCap className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{cls.name}</h1>
          <p className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {cls.level && <span>Level <strong>{cls.level}</strong></span>}
            {cls.programName && <span>Program <strong className="capitalize">{cls.programName}</strong></span>}
            {cls.capacity != null && <span>Capacity <strong>{cls.capacity}</strong></span>}
            <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" /> {cls.activeEnrollments} learners enrolled</span>
            {currentTeacher && (
              <span className="inline-flex items-center gap-1"><UserCheck className="w-3 h-3" /> Class teacher: <strong>{currentTeacher.staffName}</strong></span>
            )}
          </p>
        </div>
      </div>

      {/* Subjects + teachers */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5" /> Subjects taught ({subjects.length})
        </h2>
        {subjects.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">No subjects allocated to this class yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-500">
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="text-left font-semibold py-2 px-2">Subject</th>
                  <th className="text-left font-semibold py-2 px-2">Code</th>
                  <th className="text-left font-semibold py-2 px-2">Type</th>
                  <th className="text-left font-semibold py-2 px-2">Teacher</th>
                  <th className="text-left font-semibold py-2 px-2">Initials</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {subjects.map(s => (
                  <tr key={s.allocationId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-2">
                      <Link href={`/academics/subjects/${s.subjectId}`} className="text-indigo-600 hover:underline">
                        {s.subjectName}
                      </Link>
                    </td>
                    <td className="py-2 px-2 font-mono text-[11px] text-slate-500">{s.subjectCode || '—'}</td>
                    <td className="py-2 px-2 capitalize text-slate-500">{s.subjectType || '—'}</td>
                    <td className="py-2 px-2">
                      {s.teacherName
                        ? <Link href={`/staff/${s.teacherId}`} className="text-indigo-600 hover:underline">{s.teacherName}</Link>
                        : <span className="text-slate-400 italic">unassigned</span>}
                    </td>
                    <td className="py-2 px-2 font-mono text-[11px]">{s.initials || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Class-teacher history */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
          <Hash className="w-3.5 h-3.5" /> Class teacher history ({classTeachers.length})
        </h2>
        {classTeachers.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">No class teacher has been assigned.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {classTeachers.map(ct => (
              <li key={ct.id} className="py-2 px-1 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Link href={`/staff/${ct.staffId}`} className="font-semibold text-slate-700 dark:text-slate-200 hover:text-indigo-600 hover:underline">{ct.staffName}</Link>
                  {ct.validUntil === null && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 font-bold">CURRENT</span>
                  )}
                </div>
                <span className="text-slate-400">
                  from {new Date(ct.assignedAt).toLocaleDateString()}
                  {ct.validUntil && <> · until {new Date(ct.validUntil).toLocaleDateString()}</>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
