"use client";
import React from 'react';
import useSWR from 'swr';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  User, Phone, Mail, Calendar, MapPin, BookOpen,
  GraduationCap, FileText, Users, AlertCircle, Loader,
  ArrowLeft, CheckCircle2,
} from 'lucide-react';
import EnrollmentTimeline from '@/components/students/EnrollmentTimeline';

const fetcher = (url: string) => fetch(url).then(r => r.json());

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</p>
      <p className="text-sm text-slate-700 dark:text-slate-200 mt-0.5">{value || '—'}</p>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm space-y-4">
      <div className="flex items-center gap-2 pb-1 border-b border-slate-100 dark:border-slate-800">
        <Icon className="w-4 h-4 text-indigo-500 flex-shrink-0" />
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();

  console.log('[StudentProfile] Fetching student:', id);

  const { data, error, isLoading } = useSWR(
    id && /^\d+$/.test(id) ? `/api/students/${id}/profile` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  if (!id || !/^\d+$/.test(id)) {
    return (
      <div className="p-8 flex flex-col items-center gap-3 text-center">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-sm text-slate-500">Invalid student ID in URL.</p>
        <Link href="/students/list" className="text-indigo-600 text-sm hover:underline flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to students
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center gap-3">
        <Loader className="w-5 h-5 text-indigo-500 animate-spin" />
        <p className="text-sm text-slate-500">Loading student profile…</p>
      </div>
    );
  }

  if (error || !data?.success || !data?.data) {
    return (
      <div className="p-8 flex flex-col items-center gap-3 text-center">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Student not found or access restricted</p>
        <p className="text-xs text-slate-400">The student may not belong to your school, or the record was removed.</p>
        <Link href="/students/list" className="text-indigo-600 text-sm hover:underline flex items-center gap-1 mt-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to students
        </Link>
      </div>
    );
  }

  const s = data.data;
  const fullName = [s.first_name, s.other_name, s.last_name].filter(Boolean).join(' ');
  const activeEnrollment = s.enrollments?.find((e: any) => e.status === 'active') ?? s.enrollments?.[0] ?? null;

  return (
    <div className="py-6 px-4 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-xl font-bold flex-shrink-0 shadow">
          {s.first_name?.[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-slate-800 dark:text-white truncate">{fullName}</h1>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-xs text-slate-400">#{s.admission_no ?? '—'}</span>
            {activeEnrollment && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                {activeEnrollment.class_name} {activeEnrollment.stream_name ? `· ${activeEnrollment.stream_name}` : ''}
              </span>
            )}
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              s.student_status === 'active'
                ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
            }`}>
              {s.student_status ?? 'unknown'}
            </span>
          </div>
        </div>
        <Link href="/students/list" className="flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-600 transition-colors flex-shrink-0">
          <ArrowLeft className="w-3.5 h-3.5" /> List
        </Link>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {/* Main column */}
        <div className="md:col-span-2 space-y-5">
          <Section title="Personal Info" icon={User}>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Gender" value={s.gender} />
              <Field label="Date of Birth" value={s.date_of_birth} />
              <Field label="Phone" value={s.phone} />
              <Field label="Email" value={s.email} />
              {s.additional?.previous_school && <Field label="Previous School" value={s.additional.previous_school} />}
              {s.additional?.notes && <Field label="Notes" value={s.additional.notes} />}
            </div>
          </Section>

          {s.parents?.length > 0 && (
            <Section title="Parents / Guardians" icon={Users}>
              <div className="space-y-3">
                {s.parents.map((p: any) => (
                  <div key={p.parent_id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 flex-shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{p.name}</p>
                      <p className="text-xs text-slate-400">{p.relationship}</p>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {p.phone && <span className="text-xs text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3" />{p.phone}</span>}
                        {p.email && <span className="text-xs text-slate-500 flex items-center gap-1"><Mail className="w-3 h-3" />{p.email}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {s.documents?.length > 0 && (
            <Section title="Documents" icon={FileText}>
              <div className="space-y-2">
                {s.documents.map((doc: any) => (
                  <div key={doc.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                    <div>
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{doc.document_type}</p>
                      <p className="text-[10px] text-slate-400">{doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : '—'}</p>
                    </div>
                    {doc.file_url && (
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline">View</a>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {activeEnrollment && (
            <Section title="Current Enrollment" icon={GraduationCap}>
              <div className="space-y-3">
                <Field label="Class" value={activeEnrollment.class_name} />
                {activeEnrollment.stream_name && <Field label="Stream" value={activeEnrollment.stream_name} />}
                <Field label="Academic Year" value={activeEnrollment.academic_year_name} />
                <Field label="Term" value={activeEnrollment.term_name} />
                {activeEnrollment.study_mode_name && <Field label="Study Mode" value={activeEnrollment.study_mode_name} />}
                {activeEnrollment.programs?.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Programs</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {activeEnrollment.programs.map((prog: any) => (
                        <span key={prog.id} className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium">{prog.name}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Section>
          )}

          <Section title="Actions" icon={CheckCircle2}>
            <div className="space-y-2">
              <Link href={`/students/enroll?student=${id}`} className="block text-xs text-indigo-600 hover:underline">
                Re-enroll / promote →
              </Link>
              <Link href={`/students/list`} className="block text-xs text-slate-400 hover:text-slate-600">
                ← Back to students list
              </Link>
            </div>
          </Section>
        </div>
      </div>

      {/* Enrollment History Timeline */}
      <EnrollmentTimeline studentId={id} />
    </div>
  );
}
