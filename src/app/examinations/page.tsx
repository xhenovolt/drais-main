'use client';
import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { ClipboardList, Plus, Edit, Trash, Loader2, X, Filter, AlarmClock } from 'lucide-react';
import { toast } from 'react-hot-toast';

const fetcher = (u: string) => fetch(u).then(r => r.json());

interface Exam {
  id: number;
  name: string;
  body: string | null;
  class_id: number;
  class_name?: string;
  subject_id: number;
  subject_name?: string;
  term_id: number | null;
  term_name?: string;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string;
}

export default function ExaminationsPage() {
  const [termFilter,    setTermFilter]    = useState('');
  const [classFilter,   setClassFilter]   = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (termFilter)    p.set('term_id', termFilter);
    if (classFilter)   p.set('class_id', classFilter);
    if (subjectFilter) p.set('subject_id', subjectFilter);
    const s = p.toString();
    return s ? `?${s}` : '';
  }, [termFilter, classFilter, subjectFilter]);

  const { data, mutate, isLoading } = useSWR<{ data: Exam[] }>(`/api/exams${qs}`, fetcher);
  const { data: termsRes }    = useSWR('/api/terms',    fetcher);
  const { data: classesRes }  = useSWR('/api/classes',  fetcher);
  const { data: subjectsRes } = useSWR('/api/subjects', fetcher);

  const exams    = data?.data ?? [];
  const terms    = (termsRes    as any)?.data ?? termsRes    ?? [];
  const classes  = (classesRes  as any)?.data ?? classesRes  ?? [];
  const subjects = (subjectsRes as any)?.data ?? subjectsRes ?? [];

  const [modalOpen, setModalOpen] = useState(false);
  const [editing,   setEditing]   = useState<Exam | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [form, setForm] = useState({
    name: '', body: '', term_id: '', class_id: '', subject_id: '',
    date: '', start_time: '', end_time: '', status: 'scheduled',
  });

  function openCreate() {
    setEditing(null);
    setForm({ name: '', body: '', term_id: '', class_id: '', subject_id: '', date: '', start_time: '', end_time: '', status: 'scheduled' });
    setModalOpen(true);
  }
  function openEdit(e: Exam) {
    setEditing(e);
    setForm({
      name:       e.name,
      body:       e.body ?? '',
      term_id:    e.term_id    ? String(e.term_id)    : '',
      class_id:   e.class_id   ? String(e.class_id)   : '',
      subject_id: e.subject_id ? String(e.subject_id) : '',
      date:       e.date       ?? '',
      start_time: e.start_time ?? '',
      end_time:   e.end_time   ?? '',
      status:     e.status     ?? 'scheduled',
    });
    setModalOpen(true);
  }

  async function save() {
    if (!form.name || !form.class_id || !form.subject_id) {
      toast.error('Name, class, and subject are required'); return;
    }
    setSaving(true);
    try {
      const payload: any = {
        name:       form.name,
        body:       form.body || null,
        term_id:    form.term_id    ? Number(form.term_id)    : null,
        class_id:   Number(form.class_id),
        subject_id: Number(form.subject_id),
        date:       form.date       || null,
        start_time: form.start_time || null,
        end_time:   form.end_time   || null,
        status:     form.status,
      };
      if (editing) payload.id = editing.id;
      const res = await fetch('/api/exams', {
        method:  editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Save failed');
      toast.success(editing ? 'Exam updated' : 'Exam created');
      setModalOpen(false);
      mutate();
    } catch (e: any) { toast.error(e?.message || 'Save failed'); }
    finally { setSaving(false); }
  }

  async function remove(id: number) {
    if (!confirm('Archive this exam? It can be restored from trash.')) return;
    try {
      const res = await fetch(`/api/exams?id=${id}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Delete failed');
      toast.success('Exam archived');
      mutate();
    } catch (e: any) { toast.error(e?.message || 'Delete failed'); }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-6 h-6 text-indigo-500" />
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">Examinations</h1>
          <span className="text-xs text-slate-400">{exams.length} exam{exams.length === 1 ? '' : 's'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/examinations/deadlines"
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">
            <AlarmClock className="w-3.5 h-3.5" /> Deadlines
          </Link>
          <button onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
            <Plus className="w-4 h-4" /> New Exam
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
        <div className="flex items-center gap-2 text-slate-500">
          <Filter className="w-4 h-4" />
          <span className="text-xs font-semibold">Filter:</span>
        </div>
        <select value={termFilter} onChange={e => setTermFilter(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900">
          <option value="">All terms</option>
          {terms.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={classFilter} onChange={e => setClassFilter(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900">
          <option value="">All classes</option>
          {classes.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900">
          <option value="">All subjects</option>
          {subjects.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
        </div>
      ) : exams.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-400">
          <ClipboardList className="w-8 h-8" />
          <p className="text-sm">No exams match your filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Term</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {exams.map(e => (
                <tr key={e.id} className="bg-white dark:bg-slate-900">
                  <td className="px-4 py-3 font-semibold">{e.name}</td>
                  <td className="px-4 py-3">{e.class_name ?? `#${e.class_id}`}</td>
                  <td className="px-4 py-3">{e.subject_name ?? `#${e.subject_id}`}</td>
                  <td className="px-4 py-3 text-slate-500">{e.term_name ?? (e.term_id ? `#${e.term_id}` : '—')}</td>
                  <td className="px-4 py-3 font-mono text-xs">{e.date ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {e.start_time && e.end_time ? `${e.start_time}–${e.end_time}` : e.start_time ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      e.status === 'completed' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                      : e.status === 'cancelled' ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'
                      : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                    }`}>{e.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <button onClick={() => openEdit(e)} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => remove(e.id)} className="p-1.5 rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20">
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{editing ? 'Edit Exam' : 'New Exam'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-2 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Name *">
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Examining Body">
                <input value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="UNEB, internal…" className={inputCls} />
              </Field>
              <Field label="Class *">
                <select value={form.class_id} onChange={e => setForm({ ...form, class_id: e.target.value })} className={inputCls}>
                  <option value="">— Select —</option>
                  {classes.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Subject *">
                <select value={form.subject_id} onChange={e => setForm({ ...form, subject_id: e.target.value })} className={inputCls}>
                  <option value="">— Select —</option>
                  {subjects.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Term">
                <select value={form.term_id} onChange={e => setForm({ ...form, term_id: e.target.value })} className={inputCls}>
                  <option value="">— None —</option>
                  {terms.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={inputCls}>
                  <option value="scheduled">Scheduled</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </Field>
              <Field label="Date">
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Start Time">
                <input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} className={inputCls} />
              </Field>
              <Field label="End Time">
                <input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} className={inputCls} />
              </Field>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">
                Cancel
              </button>
              <button onClick={save} disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {editing ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls = "w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
