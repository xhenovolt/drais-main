"use client";
import React, { useState } from 'react';
import useSWR from 'swr';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  User, Phone, Mail, Calendar, MapPin, BookOpen,
  GraduationCap, FileText, Users, AlertCircle, Loader,
  ArrowLeft, CheckCircle2, Camera,
} from 'lucide-react';
import EnrollmentTimeline from '@/components/students/EnrollmentTimeline';
import LearnerOverview from '@/components/students/LearnerOverview';
import PhotoEditorModal from '@/components/students/PhotoEditorModal';
import ExtendedProfileModal from '@/components/students/ExtendedProfileModal';
import { Pencil, Home, Heart, Plus, ExternalLink, Fingerprint } from 'lucide-react';

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

  const { data, error, isLoading, mutate } = useSWR(
    id && /^\d+$/.test(id) ? `/api/students/${id}/profile` : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [extModalOpen,   setExtModalOpen]   = useState(false);

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
        {/* Photo / avatar — clicking opens the editor (upload + remove). */}
        <button
          onClick={() => setPhotoModalOpen(true)}
          title={s.photo_url ? 'Change or remove photo' : 'Add photo'}
          className="relative group w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-xl font-bold flex-shrink-0 shadow overflow-hidden hover:ring-2 hover:ring-indigo-400 transition"
        >
          {s.photo_url ? (
            <img src={s.photo_url} alt={fullName} className="w-full h-full object-cover" />
          ) : (
            <span>{s.first_name?.[0]?.toUpperCase() ?? '?'}</span>
          )}
          <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
            <Camera className="w-5 h-5 text-white" />
          </span>
        </button>
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
            {s.fingerprints?.active > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                title={`${s.fingerprints.active} active fingerprint${s.fingerprints.active === 1 ? '' : 's'} enrolled`}>
                <Fingerprint className="w-3 h-3" /> {s.fingerprints.active}
              </span>
            )}
          </div>
        </div>
        <Link href="/students/list" className="flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-600 transition-colors flex-shrink-0">
          <ArrowLeft className="w-3.5 h-3.5" /> List
        </Link>
      </div>

      {/* Command Center snapshot — performance, attendance, fees, subjects, trend */}
      <LearnerOverview studentId={id} />

      <div className="grid gap-5 md:grid-cols-3">
        {/* Main column */}
        <div className="md:col-span-2 space-y-5">
          <Section title="Personal Info" icon={User}>
            <div className="flex items-start justify-between -mt-2 mb-2">
              <div />
              <button
                onClick={() => setExtModalOpen(true)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700"
              >
                <Pencil className="w-3 h-3" /> Edit Extended Profile
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Gender" value={s.gender} />
              <Field label="Date of Birth" value={s.date_of_birth} />
              <Field label="Phone" value={s.phone} />
              <Field label="Email" value={s.email} />
              <Field label="Place of Birth" value={s.extended?.place_of_birth} />
              <Field label="Place of Residence" value={s.extended?.place_of_residence} />
              <Field label="District" value={s.extended?.district_name} />
              <Field label="Nationality" value={s.extended?.nationality_name} />
              {s.additional?.previous_school && <Field label="Previous School" value={s.additional.previous_school} />}
              {s.additional?.orphan_status && <Field label="Orphan Status (text)" value={s.additional.orphan_status} />}
              {s.additional?.notes && <Field label="Notes" value={s.additional.notes} />}
            </div>
          </Section>

          {(s.family_status?.orphan_status_label || s.family_status?.primary_guardian_name || s.family_status?.father_name) && (
            <Section title="Family Status" icon={Heart}>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Orphan Status" value={s.family_status?.orphan_status_label} />
                <Field label="Primary Guardian" value={s.family_status?.primary_guardian_name} />
                <Field label="Guardian Contact" value={s.family_status?.primary_guardian_contact} />
                <Field label="Guardian Occupation" value={s.family_status?.primary_guardian_occupation} />
                <Field label="Father Name" value={s.family_status?.father_name} />
                <Field label="Father Living Status" value={s.family_status?.father_living_status_label} />
                <Field label="Father Occupation" value={s.family_status?.father_occupation} />
                <Field label="Father Contact" value={s.family_status?.father_contact} />
              </div>
            </Section>
          )}

          {s.next_of_kin?.length > 0 && (
            <Section title="Next of Kin" icon={Users}>
              <div className="space-y-3">
                {s.next_of_kin.map((k: any) => (
                  <div key={k.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 grid sm:grid-cols-2 gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{k.name}</p>
                      <p className="text-xs text-slate-400">{k.occupation || '—'}</p>
                    </div>
                    <div className="text-xs text-slate-500 space-y-0.5">
                      {k.contact && <div className="flex items-center gap-1"><Phone className="w-3 h-3" />{k.contact}</div>}
                      {k.address && <div className="flex items-center gap-1"><Home className="w-3 h-3" />{k.address}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {s.education_levels?.length > 0 && (
            <Section title="Education History" icon={BookOpen}>
              <div className="space-y-2">
                {s.education_levels.map((e: any) => (
                  <div key={e.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                    <div>
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{e.level_name}</p>
                      <p className="text-[10px] text-slate-400">
                        {e.education_type}{e.institution ? ` · ${e.institution}` : ''}
                      </p>
                    </div>
                    {e.year_completed && (
                      <span className="text-[10px] text-slate-500 font-mono">{e.year_completed}</span>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {(s.parents?.length > 0 || s.contacts?.length > 0) && (
            <Section title="Parents, Guardians & Contacts" icon={Users}>
              <div className="space-y-3">
                {s.parents?.map((p: any) => (
                  <div key={`p-${p.parent_id}`} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 flex-shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{p.name}</p>
                      <p className="text-xs text-slate-400">Parent · {p.relationship}</p>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {p.phone && <span className="text-xs text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3" />{p.phone}</span>}
                        {p.email && <span className="text-xs text-slate-500 flex items-center gap-1"><Mail className="w-3 h-3" />{p.email}</span>}
                      </div>
                    </div>
                  </div>
                ))}
                {s.contacts?.map((c: any) => {
                  const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || `Contact #${c.contact_id}`;
                  return (
                    <div key={`c-${c.contact_id}`} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600 flex-shrink-0">
                        <Phone className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          {name}
                          {c.is_primary === 1 && (
                            <span className="ml-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-200 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200">Primary</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-400">{c.relationship ?? c.contact_type}{c.occupation ? ` · ${c.occupation}` : ''}</p>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          {c.phone && <span className="text-xs text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                          {c.email && <span className="text-xs text-slate-500 flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Link href="/students/contacts"
                className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                <Plus className="w-3 h-3" /> Manage contacts <ExternalLink className="w-3 h-3" />
              </Link>
            </Section>
          )}

          <Section title="Documents" icon={FileText}>
            {s.documents?.length > 0 ? (
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
            ) : (
              <p className="text-xs text-slate-400">No documents uploaded.</p>
            )}
            <Link href="/students/documents"
              className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
              <Plus className="w-3 h-3" /> Upload / manage documents <ExternalLink className="w-3 h-3" />
            </Link>
          </Section>
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

      {/* Extended profile editor — personal, family, next-of-kin, education tabs */}
      <ExtendedProfileModal
        open={extModalOpen}
        onClose={() => setExtModalOpen(false)}
        studentId={Number(s.student_id ?? s.id)}
        initial={s}
        onSaved={() => { mutate(); }}
      />

      {/* Photo editor modal — upload, replace, or remove the learner's photo */}
      <PhotoEditorModal
        open={photoModalOpen}
        onClose={() => setPhotoModalOpen(false)}
        learner={{
          id:         Number(s.id),
          first_name: s.first_name,
          last_name:  s.last_name,
          photo_url:  s.photo_url,
        }}
        onUpdated={() => { mutate(); }}
      />
    </div>
  );
}
