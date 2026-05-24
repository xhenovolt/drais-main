"use client";
import React, { useState } from 'react';
import useSWR from 'swr';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  User, Phone, Mail, Calendar, MapPin, Briefcase,
  AlertCircle, Loader, ArrowLeft, CheckCircle2, Edit, Trash2,
  BookOpen, School, Star, Award, Plus, X, Camera,
} from 'lucide-react';
import StaffPhotoModal from '@/components/staff/StaffPhotoModal';
import { toast } from 'react-hot-toast';

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

export default function StaffDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  console.log('[StaffProfile] Fetching staff:', id);

  const { data, error, isLoading, mutate } = useSWR(
    id && /^\d+$/.test(id) ? `/api/staff/${id}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  const [photoModalOpen, setPhotoModalOpen] = useState(false);

  if (!id || !/^\d+$/.test(id)) {
    return (
      <div className="p-8 flex flex-col items-center gap-3 text-center">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-sm text-slate-500">Invalid staff ID in URL.</p>
        <Link href="/staff/list" className="text-indigo-600 text-sm hover:underline flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to staff
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center gap-3">
        <Loader className="w-5 h-5 text-indigo-500 animate-spin" />
        <p className="text-sm text-slate-500">Loading staff profile…</p>
      </div>
    );
  }

  if (error || !data?.success || !data?.data) {
    return (
      <div className="p-8 flex flex-col items-center gap-3 text-center">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Staff member not found or access restricted</p>
        <p className="text-xs text-slate-400">The staff record may not belong to your school, or was removed.</p>
        <Link href="/staff/list" className="text-indigo-600 text-sm hover:underline flex items-center gap-1 mt-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to staff
        </Link>
      </div>
    );
  }

  const staff = data.data;
  const fullName = [staff.first_name, staff.other_name, staff.last_name].filter(Boolean).join(' ');

  const handleEdit = () => {
    router.push(`/staff/${id}/edit`);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete ${fullName}? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/staff/${id}`, { method: 'DELETE' });
      if (response.ok) {
        toast.success('Staff member deleted');
        router.push('/staff/list');
      } else {
        toast.error('Failed to delete staff member');
      }
    } catch (err) {
      toast.error('Error deleting staff member');
      console.error(err);
    }
  };

  return (
    <div className="py-6 px-4 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4 justify-between">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          {/* Photo / avatar — clicking opens the photo editor (upload + remove). */}
          <button
            onClick={() => setPhotoModalOpen(true)}
            title={staff.photo_url ? 'Change or remove photo' : 'Add photo'}
            className="relative group w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-xl font-bold flex-shrink-0 shadow overflow-hidden hover:ring-2 hover:ring-indigo-400 transition"
          >
            {staff.photo_url ? (
              <img src={staff.photo_url} alt={fullName} className="w-full h-full object-cover" />
            ) : (
              <span>{staff.first_name?.[0]?.toUpperCase() ?? '?'}</span>
            )}
            <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
              <Camera className="w-5 h-5 text-white" />
            </span>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-800 dark:text-white truncate">{fullName}</h1>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              <span className="text-xs text-slate-400">#{staff.staff_no ?? '—'}</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                staff.status === 'active'
                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                  : staff.status === 'inactive'
                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
              }`}>
                {staff.status || 'active'}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={handleEdit}
            className="p-2.5 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
            title="Edit staff member"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={handleDelete}
            className="p-2.5 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
            title="Delete staff member"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Back Link */}
      <Link href="/staff/list" className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 dark:hover:text-indigo-400">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to staff list
      </Link>

      {/* Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Personal Info */}
        <Section title="Personal Information" icon={User}>
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name" value={staff.first_name} />
            <Field label="Last Name" value={staff.last_name} />
            {staff.other_name && <Field label="Other Names" value={staff.other_name} />}
            {staff.date_of_birth && <Field label="Date of Birth" value={new Date(staff.date_of_birth).toLocaleDateString()} />}
            {staff.gender && <Field label="Gender" value={staff.gender} />}
            {staff.national_id && <Field label="National ID" value={staff.national_id} />}
          </div>
        </Section>

        {/* Professional Info */}
        <Section title="Professional Information" icon={Briefcase}>
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Position"
              value={staff.position_name || staff.position}
            />
            {staff.position_category && (
              <Field
                label="Position category"
                value={
                  String(staff.position_category).charAt(0).toUpperCase() +
                  String(staff.position_category).slice(1) +
                  (staff.position_is_teaching ? ' · teaching' : '')
                }
              />
            )}
            {staff.department_name && <Field label="Department" value={staff.department_name} />}
            {staff.manager_id && staff.manager_name && (
              <Field
                label="Reports To"
                value={
                  staff.manager_position_name
                    ? `${staff.manager_name} (${staff.manager_position_name})`
                    : staff.manager_name
                }
              />
            )}
            {staff.employment_type && <Field label="Employment Type" value={staff.employment_type} />}
            {staff.hire_date && <Field label="Hire Date" value={new Date(staff.hire_date).toLocaleDateString()} />}
            {staff.grade && <Field label="Grade" value={staff.grade} />}
          </div>
        </Section>

        {/* Contact Information */}
        <Section title="Contact Information" icon={Mail}>
          <div className="grid grid-cols-2 gap-4">
            {staff.email && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-0.5">Email</p>
                <a href={`mailto:${staff.email}`} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline break-all">
                  {staff.email}
                </a>
              </div>
            )}
            {staff.phone && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-0.5">Phone</p>
                <a href={`tel:${staff.phone}`} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                  {staff.phone}
                </a>
              </div>
            )}
            {staff.address && <Field label="Address" value={staff.address} />}
            {staff.city && <Field label="City" value={staff.city} />}
          </div>
        </Section>

        {/* Organization Info */}
        {(staff.bank_account || staff.salary_grade) && (
          <Section title="Organization Information" icon={Briefcase}>
            <div className="grid grid-cols-2 gap-4">
              {staff.bank_account && <Field label="Bank Account" value={staff.bank_account} />}
              {staff.salary_grade && <Field label="Salary Grade" value={staff.salary_grade} />}
              {staff.staff_level && <Field label="Staff Level" value={staff.staff_level} />}
              {staff.years_of_experience !== undefined && <Field label="Experience" value={`${staff.years_of_experience} years`} />}
            </div>
          </Section>
        )}

        {/* Phase G — Teaching workload */}
        <WorkloadPanel staffId={id!} />

        {/* Phase H — Qualifications + specialisations */}
        <QualificationsPanel staffId={id!} />
        <SpecializationsPanel staffId={id!} />
      </div>

      {/* Staff photo editor — upload, replace, or remove */}
      <StaffPhotoModal
        open={photoModalOpen}
        onClose={() => setPhotoModalOpen(false)}
        staff={{
          id:         Number(staff.id),
          first_name: staff.first_name,
          last_name:  staff.last_name,
          photo_url:  staff.photo_url,
        }}
        onUpdated={() => { mutate(); }}
      />
    </div>
  );
}

function WorkloadPanel({ staffId }: { staffId: string }) {
  const fetcher = (url: string) => fetch(url).then(r => r.json());
  const { data, isLoading } = useSWR(
    `/api/admin/staff/${staffId}/workload`,
    fetcher,
    { revalidateOnFocus: false },
  );

  if (isLoading) return null;
  if (!data?.success) return null;

  const { summary, allocations, classTeacherOf } = data;
  if (!summary.allocationCount && !summary.classTeacherCount) return null;

  return (
    <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm space-y-5">
      <div className="flex items-center gap-2 pb-1 border-b border-slate-100 dark:border-slate-800">
        <BookOpen className="w-4 h-4 text-indigo-500" />
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Teaching Assignments</h2>
        <span className="ml-auto text-xs text-slate-400">
          {summary.subjectCount} subject{summary.subjectCount !== 1 ? 's' : ''} · {summary.classCount} class{summary.classCount !== 1 ? 'es' : ''}
        </span>
      </div>

      {classTeacherOf.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold flex items-center gap-1">
            <Star className="w-3 h-3 text-amber-500" /> Class Teacher Of
          </p>
          <div className="flex flex-wrap gap-2">
            {classTeacherOf.map((ct: { assignment_id: number; class_name: string; stream_name: string | null; term_name: string }) => (
              <span key={ct.assignment_id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-xs font-medium border border-amber-200 dark:border-amber-800">
                <School className="w-3 h-3" />
                {ct.class_name}{ct.stream_name ? ` (${ct.stream_name})` : ''} · {ct.term_name}
              </span>
            ))}
          </div>
        </div>
      )}

      {allocations.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Subject Allocations</p>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2 text-left">Class</th>
                  <th className="px-3 py-2 text-left">Subject</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Initials</th>
                </tr>
              </thead>
              <tbody>
                {allocations.map((a: { allocation_id: number; class_name: string; subject_name: string; subject_type: string; custom_initials: string | null }) => (
                  <tr key={a.allocation_id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-3 py-1.5 font-medium text-slate-700 dark:text-slate-200">{a.class_name}</td>
                    <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">{a.subject_name}</td>
                    <td className="px-3 py-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        a.subject_type === 'core'
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        {a.subject_type || 'core'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-slate-500">{a.custom_initials || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Phase H ─────────────────────────────────────────────────────────────────

function QualificationsPanel({ staffId }: { staffId: string }) {
  const fetcher = (url: string) => fetch(url).then(r => r.json());
  const { data, isLoading, mutate } = useSWR(
    `/api/admin/staff/${staffId}/qualifications`,
    fetcher,
    { revalidateOnFocus: false },
  );
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ degree_type: '', institution: '', field_of_study: '', year_obtained: '', notes: '' });

  async function add() {
    const res = await fetch(`/api/admin/staff/${staffId}/qualifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, year_obtained: form.year_obtained ? Number(form.year_obtained) : null }),
    });
    if (res.ok) { setAdding(false); setForm({ degree_type: '', institution: '', field_of_study: '', year_obtained: '', notes: '' }); mutate(); }
  }

  async function remove(qualId: number) {
    await fetch(`/api/admin/staff/${staffId}/qualifications?qual_id=${qualId}`, { method: 'DELETE' });
    mutate();
  }

  const quals: Array<{ id: number; degree_type: string; institution: string; field_of_study: string | null; year_obtained: number | null; notes: string | null }> = data?.qualifications ?? [];

  return (
    <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4 text-indigo-500" />
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Qualifications</h2>
        </div>
        <button onClick={() => setAdding(v => !v)} className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline">
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>

      {adding && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Degree / Certificate *" value={form.degree_type} onChange={e => setForm(f => ({ ...f, degree_type: e.target.value }))}
              className="px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800" />
            <input placeholder="Institution *" value={form.institution} onChange={e => setForm(f => ({ ...f, institution: e.target.value }))}
              className="px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800" />
            <input placeholder="Field of study" value={form.field_of_study} onChange={e => setForm(f => ({ ...f, field_of_study: e.target.value }))}
              className="px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800" />
            <input placeholder="Year obtained" type="number" value={form.year_obtained} onChange={e => setForm(f => ({ ...f, year_obtained: e.target.value }))}
              className="px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800" />
          </div>
          <textarea placeholder="Notes (optional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
            className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800" />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAdding(false)} className="px-2 py-1 rounded border text-xs">Cancel</button>
            <button onClick={add} disabled={!form.degree_type.trim() || !form.institution.trim()} className="px-2 py-1 rounded bg-indigo-600 text-white text-xs disabled:opacity-50">Save</button>
          </div>
        </div>
      )}

      {isLoading && <p className="text-xs text-slate-500">Loading…</p>}
      {!isLoading && quals.length === 0 && !adding && <p className="text-xs text-slate-400">No qualifications recorded.</p>}
      {quals.map(q => (
        <div key={q.id} className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{q.degree_type}</div>
            <div className="text-xs text-slate-500">{q.institution}{q.field_of_study ? ` · ${q.field_of_study}` : ''}{q.year_obtained ? ` (${q.year_obtained})` : ''}</div>
            {q.notes && <div className="text-[11px] text-slate-400 mt-0.5">{q.notes}</div>}
          </div>
          <button onClick={() => remove(q.id)} className="text-rose-500 hover:text-rose-700 shrink-0"><X className="w-3.5 h-3.5" /></button>
        </div>
      ))}
    </div>
  );
}

function SpecializationsPanel({ staffId }: { staffId: string }) {
  const fetcher = (url: string) => fetch(url).then(r => r.json());
  const { data: specData, isLoading: specLoading, mutate: specMutate } = useSWR(
    `/api/admin/staff/${staffId}/specializations`, fetcher, { revalidateOnFocus: false },
  );
  const { data: subjectsData } = useSWR('/api/subjects', fetcher, { revalidateOnFocus: false });
  const [adding, setAdding] = useState(false);
  const [subjectId, setSubjectId] = useState('');
  const [certified, setCertified] = useState(false);

  const specs: Array<{ id: number; subject_id: number; subject_name: string; certified: number }> = specData?.specializations ?? [];
  const allSubjects: Array<{ id: number; name: string }> = subjectsData?.data ?? [];
  const existingIds = new Set(specs.map(s => s.subject_id));
  const availableSubjects = allSubjects.filter(s => !existingIds.has(s.id));

  async function add() {
    await fetch(`/api/admin/staff/${staffId}/specializations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject_id: Number(subjectId), certified }),
    });
    setAdding(false); setSubjectId(''); setCertified(false); specMutate();
  }

  async function remove(sid: number) {
    await fetch(`/api/admin/staff/${staffId}/specializations?subject_id=${sid}`, { method: 'DELETE' });
    specMutate();
  }

  return (
    <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-emerald-500" />
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Subject Specialisations</h2>
        </div>
        <button onClick={() => setAdding(v => !v)} className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline">
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>

      {adding && (
        <div className="flex items-center gap-2 text-xs">
          <select value={subjectId} onChange={e => setSubjectId(e.target.value)}
            className="flex-1 px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800">
            <option value="">Select subject…</option>
            {availableSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={certified} onChange={e => setCertified(e.target.checked)} />
            Certified
          </label>
          <button onClick={() => setAdding(false)} className="px-2 py-1 rounded border">Cancel</button>
          <button onClick={add} disabled={!subjectId} className="px-2 py-1 rounded bg-emerald-600 text-white disabled:opacity-50">Save</button>
        </div>
      )}

      {specLoading && <p className="text-xs text-slate-500">Loading…</p>}
      {!specLoading && specs.length === 0 && !adding && <p className="text-xs text-slate-400">No specialisations recorded.</p>}
      <div className="flex flex-wrap gap-2">
        {specs.map(s => (
          <span key={s.id} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${s.certified ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700'}`}>
            {s.subject_name}{s.certified ? ' ✓' : ''}
            <button onClick={() => remove(s.subject_id)} className="ml-1 opacity-60 hover:opacity-100"><X className="w-3 h-3" /></button>
          </span>
        ))}
      </div>
    </div>
  );
}
