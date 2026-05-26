'use client';
import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import {
  Users, Plus, Loader2, ShieldAlert, AlertTriangle, Search, RotateCcw,
  Workflow, X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const fetcher = async (u: string) => {
  const r = await fetch(u, { credentials: 'same-origin' });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(b?.error || `HTTP ${r.status}`); (e as any).status = r.status; throw e; }
  return b;
};

const STATUS_TONE: Record<string, string> = {
  applicant: 'bg-slate-100 dark:bg-slate-800       text-slate-600',
  review:    'bg-amber-100 dark:bg-amber-900/40    text-amber-700 dark:text-amber-300',
  approved:  'bg-indigo-100 dark:bg-indigo-900/40  text-indigo-700 dark:text-indigo-300',
  enrolled:  'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
  rejected:  'bg-rose-100 dark:bg-rose-900/40       text-rose-700 dark:text-rose-300',
  archived:  'bg-slate-200 dark:bg-slate-700        text-slate-500',
};

export default function AdmissionsPage() {
  const [filter, setFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const { data: modeRes } = useSWR<{ mode: 'flexible' | 'structured' }>('/api/admin/admission-mode', fetcher);
  const mode = modeRes?.mode ?? 'flexible';

  const url = useMemo(() => {
    const sp = new URLSearchParams({ page: '1', per_page: '100' });
    if (filter) sp.set('status', filter);
    if (search) sp.set('search', search);
    return `/api/admissions?${sp.toString()}`;
  }, [filter, search]);

  const { data, mutate, isLoading, error } = useSWR<any>(url, fetcher);

  const counts: any[] = data?.counts ?? [];
  const countOf = (s: string) => Number(counts.find(c => c.status === s)?.n ?? 0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-indigo-500" />
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">Admissions</h1>
            <p className="text-xs text-slate-400">
              Structured admission pipeline. Mode: <span className="font-mono">{mode}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/admission-mode"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">
            <Workflow className="w-3 h-3" /> Mode
          </Link>
          <button onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
            <Plus className="w-4 h-4" /> New Application
          </button>
        </div>
      </div>

      {mode === 'flexible' && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm">
          <p className="font-semibold text-amber-700 dark:text-amber-300">This school is in Flexible mode.</p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            The Structured pipeline still works, but most schools use it only after switching mode.
            You can keep using <Link href="/students/admit" className="underline">/students/admit</Link> directly,
            or switch to Structured mode in <Link href="/admin/admission-mode" className="underline">Mode settings</Link>.
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { code: '',           label: 'All',        n: undefined },
          { code: 'applicant',  label: 'Applicants', n: countOf('applicant') },
          { code: 'review',     label: 'Review',     n: countOf('review') },
          { code: 'approved',   label: 'Approved',   n: countOf('approved') },
          { code: 'enrolled',   label: 'Enrolled',   n: countOf('enrolled') },
          { code: 'rejected',   label: 'Rejected',   n: countOf('rejected') },
          { code: 'archived',   label: 'Archived',   n: countOf('archived') },
        ].map(f => (
          <button key={f.code} onClick={() => setFilter(f.code)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
              filter === f.code
                ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}>
            {f.label}{f.n !== undefined ? ` (${f.n})` : ''}
          </button>
        ))}
        <div className="ml-auto relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name or app number…"
            className="pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900" />
        </div>
      </div>

      {error ? (
        <ErrorPanel error={error} retry={mutate} />
      ) : isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div>
      ) : (data?.data ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Users className="w-10 h-10 mb-2" />
          <p className="text-sm">{filter ? `No ${filter} applicants.` : 'No applications yet.'}</p>
          {!filter && (
            <button onClick={() => setModalOpen(true)}
              className="mt-3 text-xs text-indigo-600 hover:underline">
              Create the first application →
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-[11px] uppercase tracking-wide text-slate-500">
              <tr className="text-left">
                <th className="px-4 py-3">App #</th>
                <th className="px-4 py-3">Applicant</th>
                <th className="px-4 py-3">Desired Class</th>
                <th className="px-4 py-3">Guardian</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.data.map((r: any) => (
                <tr key={r.id} className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.application_no ?? `#${r.id}`}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admissions/${r.id}`} className="font-semibold text-indigo-600 hover:text-indigo-700">
                      {[r.first_name, r.other_name, r.last_name].filter(Boolean).join(' ')}
                    </Link>
                    {r.applicant_phone && <p className="text-[10px] text-slate-400 font-mono">{r.applicant_phone}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{r.desired_class_name ?? '—'}</td>
                  <td className="px-4 py-3">
                    {r.guardian_name ? (
                      <>
                        <p className="text-xs">{r.guardian_name}</p>
                        {r.guardian_phone && <p className="text-[10px] text-slate-400 font-mono">{r.guardian_phone}</p>}
                      </>
                    ) : <span className="text-slate-400 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${STATUS_TONE[r.status] ?? 'bg-slate-100'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && <NewApplicationModal onClose={() => setModalOpen(false)} onCreated={() => { mutate(); setModalOpen(false); }} />}
    </div>
  );
}

function NewApplicationModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { data: classesRes } = useSWR<any>('/api/classes', fetcher);
  const { data: termsRes }   = useSWR<any>('/api/terms', fetcher);
  const classes: any[] = (classesRes as any)?.data ?? classesRes ?? [];
  const terms:   any[] = (termsRes   as any)?.data ?? termsRes   ?? [];

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    first_name: '', last_name: '', other_name: '', gender: '',
    date_of_birth: '', applicant_phone: '',
    guardian_name: '', guardian_phone: '', guardian_email: '', guardian_relation: 'guardian',
    desired_class_id: '', desired_term_id: '',
    previous_school: '', notes: '',
  });

  async function submit() {
    if (!form.first_name || !form.last_name) { toast.error('Name required'); return; }
    setSaving(true);
    try {
      const payload: any = { ...form };
      // Convert empty strings to null/undefined where appropriate
      for (const k of Object.keys(payload)) {
        if (payload[k] === '') payload[k] = null;
      }
      if (payload.desired_class_id) payload.desired_class_id = Number(payload.desired_class_id);
      if (payload.desired_term_id)  payload.desired_term_id  = Number(payload.desired_term_id);
      const r = await fetch('/api/admissions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || 'Failed');
      toast.success(`Application created (${j.application_no})`);
      onCreated();
    } catch (e: any) { toast.error(e?.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold">New Application</h3>
          <button onClick={onClose} className="p-2 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <section>
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Applicant</h4>
            <div className="grid sm:grid-cols-2 gap-3">
              <F label="First Name *"><input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} className={inputCls} /></F>
              <F label="Last Name *"> <input value={form.last_name}  onChange={e => setForm({ ...form, last_name: e.target.value })}  className={inputCls} /></F>
              <F label="Other Name">  <input value={form.other_name} onChange={e => setForm({ ...form, other_name: e.target.value })} className={inputCls} /></F>
              <F label="Gender">
                <select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })} className={inputCls}>
                  <option value="">—</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
                </select>
              </F>
              <F label="Date of Birth"><input type="date" value={form.date_of_birth} onChange={e => setForm({ ...form, date_of_birth: e.target.value })} className={inputCls} /></F>
              <F label="Applicant Phone"><input value={form.applicant_phone} onChange={e => setForm({ ...form, applicant_phone: e.target.value })} className={inputCls} /></F>
            </div>
          </section>

          <section>
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Guardian</h4>
            <div className="grid sm:grid-cols-2 gap-3">
              <F label="Guardian Name">    <input value={form.guardian_name}     onChange={e => setForm({ ...form, guardian_name: e.target.value })}     className={inputCls} /></F>
              <F label="Guardian Phone">   <input value={form.guardian_phone}    onChange={e => setForm({ ...form, guardian_phone: e.target.value })}    className={inputCls} /></F>
              <F label="Guardian Email">   <input value={form.guardian_email}    onChange={e => setForm({ ...form, guardian_email: e.target.value })}    className={inputCls} /></F>
              <F label="Relation">         <input value={form.guardian_relation} onChange={e => setForm({ ...form, guardian_relation: e.target.value })} className={inputCls} placeholder="parent / guardian" /></F>
            </div>
          </section>

          <section>
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Desired Placement</h4>
            <div className="grid sm:grid-cols-2 gap-3">
              <F label="Class">
                <select value={form.desired_class_id} onChange={e => setForm({ ...form, desired_class_id: e.target.value })} className={inputCls}>
                  <option value="">—</option>
                  {classes.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </F>
              <F label="Term">
                <select value={form.desired_term_id} onChange={e => setForm({ ...form, desired_term_id: e.target.value })} className={inputCls}>
                  <option value="">—</option>
                  {terms.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </F>
              <F label="Previous School"><input value={form.previous_school} onChange={e => setForm({ ...form, previous_school: e.target.value })} className={inputCls} /></F>
              <F label="Notes"><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className={inputCls} /></F>
            </div>
          </section>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-slate-200 dark:border-slate-700">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800";
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function ErrorPanel({ error, retry }: { error: any; retry: () => void }) {
  const isAuth = error?.status === 401 || error?.status === 403;
  return (
    <div className="rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-950/30 p-4 text-sm text-rose-700 flex items-start gap-3">
      {isAuth ? <ShieldAlert className="w-4 h-4 mt-0.5" /> : <AlertTriangle className="w-4 h-4 mt-0.5" />}
      <div className="flex-1">
        <p className="font-semibold">{isAuth ? 'Access denied' : 'Failed to load'}</p>
        <p className="text-xs opacity-90">{error?.message}</p>
        <button onClick={retry}
          className="mt-2 inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40">
          <RotateCcw className="w-3 h-3" /> Retry
        </button>
      </div>
    </div>
  );
}
