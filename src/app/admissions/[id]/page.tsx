'use client';
import React, { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, User, Phone, Mail, Calendar, GraduationCap, FileText,
  Clock, CheckCircle2, XCircle, ArchiveRestore, ArrowRightCircle,
  Loader2, AlertTriangle, ShieldAlert,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const fetcher = async (u: string) => {
  const r = await fetch(u, { credentials: 'same-origin' });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(b?.error || `HTTP ${r.status}`); (e as any).status = r.status; throw e; }
  return b;
};

const TONE: Record<string, string> = {
  applicant: 'bg-slate-100 dark:bg-slate-800       text-slate-600',
  review:    'bg-amber-100 dark:bg-amber-900/40    text-amber-700 dark:text-amber-300',
  approved:  'bg-indigo-100 dark:bg-indigo-900/40  text-indigo-700 dark:text-indigo-300',
  enrolled:  'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
  rejected:  'bg-rose-100 dark:bg-rose-900/40       text-rose-700 dark:text-rose-300',
  archived:  'bg-slate-200 dark:bg-slate-700        text-slate-500',
};

export default function AdmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR<any>(
    id && /^\d+$/.test(id) ? `/api/admissions/${id}` : null,
    fetcher,
  );

  const [busy, setBusy] = useState<string | null>(null);

  async function transition(target: string, reason?: string) {
    setBusy(target);
    try {
      const r = await fetch(`/api/admissions/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: target, reason }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || 'Failed');
      toast.success(`Moved to ${target}`);
      mutate();
    } catch (e: any) { toast.error(e?.message); }
    finally { setBusy(null); }
  }

  async function convert() {
    if (!confirm('Convert this applicant to an enrolled student? This will create a student record + active enrollment.')) return;
    setBusy('convert');
    try {
      const r = await fetch(`/api/admissions/${id}/convert`, { method: 'POST' });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || 'Failed');
      toast.success(`Enrolled as student #${j.student_id} (${j.admission_no})`);
      mutate();
      // Jump to the new student record
      setTimeout(() => router.push(`/students/${j.student_id}`), 500);
    } catch (e: any) { toast.error(e?.message); }
    finally { setBusy(null); }
  }

  async function reject() {
    const reason = prompt('Rejection reason?');
    if (reason === null) return;
    await transition('rejected', reason || undefined);
  }

  if (!id || !/^\d+$/.test(id)) {
    return <div className="p-6 text-sm text-slate-500">Invalid application id.</div>;
  }

  if (error) {
    const isAuth = (error as any).status === 401 || (error as any).status === 403;
    return (
      <div className="p-6">
        <div className="rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-950/30 p-4 text-sm text-rose-700 flex items-start gap-3">
          {isAuth ? <ShieldAlert className="w-4 h-4 mt-0.5" /> : <AlertTriangle className="w-4 h-4 mt-0.5" />}
          <p>{error.message}</p>
        </div>
      </div>
    );
  }

  if (isLoading) return <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div>;
  if (!data?.success) return <div className="p-6 text-sm text-slate-500">Application not found.</div>;

  const a = data.data;
  const docs:  any[] = data.documents ?? [];
  const audit: any[] = data.audit ?? [];

  const fullName = [a.first_name, a.other_name, a.last_name].filter(Boolean).join(' ');
  const can = (target: string) => {
    const map: Record<string, string[]> = {
      applicant: ['review', 'archived'],
      review:    ['approved', 'rejected', 'applicant', 'archived'],
      approved:  ['enrolled', 'archived'],
      rejected:  ['review', 'archived'],
      enrolled:  ['archived'],
      archived:  ['applicant'],
    };
    return (map[a.status] ?? []).includes(target);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <Link href="/admissions"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to applications
        </Link>
        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${TONE[a.status] ?? 'bg-slate-100'}`}>
          {a.status}
        </span>
      </div>

      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
          {a.first_name?.[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">{fullName}</h1>
          <p className="text-xs text-slate-400 font-mono">{a.application_no ?? `#${a.id}`}</p>
        </div>
      </div>

      {/* Action bar */}
      <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex flex-wrap items-center gap-2">
        {can('review') && (
          <button onClick={() => transition('review')} disabled={!!busy}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">
            <Clock className="w-3 h-3" /> Move to Review
          </button>
        )}
        {can('approved') && (
          <button onClick={() => transition('approved')} disabled={!!busy}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            <CheckCircle2 className="w-3 h-3" /> Approve
          </button>
        )}
        {can('rejected') && (
          <button onClick={reject} disabled={!!busy}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-50">
            <XCircle className="w-3 h-3" /> Reject
          </button>
        )}
        {a.status === 'approved' && (
          <button onClick={convert} disabled={!!busy}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
            {busy === 'convert' ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRightCircle className="w-3 h-3" />}
            Convert to Enrolled
          </button>
        )}
        {can('archived') && (
          <button onClick={() => transition('archived')} disabled={!!busy}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">
            Archive
          </button>
        )}
        {can('applicant') && a.status !== 'applicant' && (
          <button onClick={() => transition('applicant')} disabled={!!busy}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">
            <ArchiveRestore className="w-3 h-3" /> Reopen
          </button>
        )}
        {a.enrolled_student_id && (
          <Link href={`/students/${a.enrolled_student_id}`}
            className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/30">
            <GraduationCap className="w-3 h-3" /> View student record
          </Link>
        )}
      </div>

      {a.rejection_reason && (
        <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-sm text-rose-700 dark:text-rose-300">
          <p className="font-semibold">Rejection reason</p>
          <p className="text-xs mt-1">{a.rejection_reason}</p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-5">
        <Section title="Applicant" icon={User}>
          <Field label="Gender"        value={a.gender} />
          <Field label="Date of Birth" value={a.date_of_birth} />
          <Field label="Phone"         value={a.applicant_phone} />
          <Field label="Email"         value={a.applicant_email} />
          <Field label="Previous School" value={a.previous_school} />
        </Section>

        <Section title="Guardian" icon={Phone}>
          <Field label="Name"     value={a.guardian_name} />
          <Field label="Phone"    value={a.guardian_phone} />
          <Field label="Email"    value={a.guardian_email} />
          <Field label="Relation" value={a.guardian_relation} />
        </Section>

        <Section title="Desired Placement" icon={GraduationCap}>
          <Field label="Class"  value={a.desired_class_name} />
          <Field label="Stream" value={a.desired_stream_name} />
          <Field label="Term"   value={a.desired_term_name} />
          <Field label="Year"   value={a.desired_year_name} />
        </Section>

        {a.notes && (
          <Section title="Notes" icon={FileText}>
            <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{a.notes}</p>
          </Section>
        )}

        <Section title="Documents" icon={FileText}>
          {docs.length === 0 ? (
            <p className="text-xs text-slate-400">No documents uploaded.</p>
          ) : (
            <ul className="space-y-2">
              {docs.map(d => (
                <li key={d.id} className="flex items-center justify-between text-xs">
                  <div>
                    <p className="font-semibold">{d.document_type}</p>
                    <p className="text-[10px] text-slate-400">{new Date(d.uploaded_at).toLocaleString()}</p>
                  </div>
                  <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">View</a>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Status History" icon={Clock}>
          {audit.length === 0 ? (
            <p className="text-xs text-slate-400">No history yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {audit.map(h => (
                <li key={h.id} className="text-xs">
                  <div className="flex items-center gap-2">
                    {h.from_status && <span className={`px-1.5 py-0.5 rounded ${TONE[h.from_status] ?? 'bg-slate-100'}`}>{h.from_status}</span>}
                    {h.from_status && <span className="text-slate-300">→</span>}
                    <span className={`px-1.5 py-0.5 rounded ${TONE[h.to_status] ?? 'bg-slate-100'}`}>{h.to_status}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {new Date(h.created_at).toLocaleString()}
                    {(h.actor_first || h.actor_last) && ` · ${[h.actor_first, h.actor_last].filter(Boolean).join(' ')}`}
                  </p>
                  {h.reason && <p className="text-[10px] text-slate-500 mt-0.5">{h.reason}</p>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-3">
      <div className="flex items-center gap-2 pb-1 border-b border-slate-100 dark:border-slate-800">
        <Icon className="w-4 h-4 text-indigo-500" />
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h2>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</p>
      <p className="text-sm text-slate-700 dark:text-slate-200 mt-0.5">{value || '—'}</p>
    </div>
  );
}
