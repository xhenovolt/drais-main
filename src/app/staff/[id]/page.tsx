"use client";
import React from 'react';
import useSWR from 'swr';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  User, Phone, Mail, Calendar, MapPin, Briefcase,
  AlertCircle, Loader, ArrowLeft, CheckCircle2, Edit, Trash2,
} from 'lucide-react';
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
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-xl font-bold flex-shrink-0 shadow">
            {staff.first_name?.[0]?.toUpperCase() ?? '?'}
          </div>
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
            <Field label="Position" value={staff.position} />
            {staff.department_name && <Field label="Department" value={staff.department_name} />}
            {staff.employment_type && <Field label="Employment Type" value={staff.employment_type} />}
            {staff.hire_date && <Field label="Hire Date" value={new Date(staff.hire_date).toLocaleDateString()} />}
            {staff.grade && <Field label="Grade" value={staff.grade} />}
            {staff.performance_rating && <Field label="Performance Rating" value={`${staff.performance_rating}/5`} />}
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
      </div>
    </div>
  );
}
