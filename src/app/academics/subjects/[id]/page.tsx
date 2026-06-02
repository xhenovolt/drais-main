'use client';
/**
 * /academics/subjects/[id]
 *
 * Phase G — read-only subject detail. Surfaces:
 *   - Subject metadata (name, code, subject + academic type)
 *   - Every class the subject is taught in, with teacher + initials
 *
 * Mirror of the class detail page. Reads
 * /api/academics/subjects/[id]/detail.
 */
import React, { use } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { ArrowLeft, Loader2, AlertTriangle, BookOpen, GraduationCap } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface PageProps { params: Promise<{ id: string }>; }

interface Detail {
  subject: {
    id: number; name: string; code: string | null;
    subjectType: string | null; academicType: string | null;
    deletedAt: string | null;
  };
  classes: Array<{
    allocationId: number; classId: number; className: string;
    classLevel: string | null; programName: string | null;
    teacherId: number | null; teacherName: string | null;
    initials: string | null;
  }>;
}

export default function SubjectDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const { data, error, isLoading } = useSWR<Detail & { error?: string }>(
    id ? `/api/academics/subjects/${id}/detail` : null, fetcher,
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
            <div className="font-semibold">Could not load subject</div>
            <div>{data?.error || (error as Error)?.message || 'Unknown error'}</div>
          </div>
        </div>
      </div>
    );
  }

  const { subject, classes } = data;
  const taughtBy = new Set(classes.map(c => c.teacherId).filter(Boolean));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <Link
        href="/academics/subjects"
        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> All subjects
      </Link>

      {/* Header */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center flex-shrink-0">
          <BookOpen className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{subject.name}</h1>
          <p className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {subject.code && <span>Code <strong className="font-mono">{subject.code}</strong></span>}
            {subject.subjectType  && <span>Type <strong className="capitalize">{subject.subjectType}</strong></span>}
            {subject.academicType && <span>Program <strong className="capitalize">{subject.academicType}</strong></span>}
            <span>{classes.length} class{classes.length === 1 ? '' : 'es'} · {taughtBy.size} teacher{taughtBy.size === 1 ? '' : 's'}</span>
          </p>
        </div>
      </div>

      {/* Classes + teachers */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
          <GraduationCap className="w-3.5 h-3.5" /> Taught in
        </h2>
        {classes.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">
            This subject is not currently allocated to any class.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-500">
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="text-left font-semibold py-2 px-2">Class</th>
                  <th className="text-left font-semibold py-2 px-2">Level</th>
                  <th className="text-left font-semibold py-2 px-2">Program</th>
                  <th className="text-left font-semibold py-2 px-2">Teacher</th>
                  <th className="text-left font-semibold py-2 px-2">Initials</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {classes.map(c => (
                  <tr key={c.allocationId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-2">
                      <Link href={`/academics/classes/${c.classId}`} className="text-indigo-600 hover:underline">
                        {c.className}
                      </Link>
                    </td>
                    <td className="py-2 px-2 text-slate-500">{c.classLevel || '—'}</td>
                    <td className="py-2 px-2 capitalize text-slate-500">{c.programName || '—'}</td>
                    <td className="py-2 px-2">
                      {c.teacherName
                        ? <Link href={`/staff/${c.teacherId}`} className="text-indigo-600 hover:underline">{c.teacherName}</Link>
                        : <span className="text-slate-400 italic">unassigned</span>}
                    </td>
                    <td className="py-2 px-2 font-mono text-[11px]">{c.initials || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
