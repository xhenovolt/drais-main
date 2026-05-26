'use client';
import React, { useState } from 'react';
import useSWR from 'swr';
import { AlarmClock, Plus, Edit, Trash, Loader2, X, AlertTriangle, CheckCircle2, Send } from 'lucide-react';
import { toast } from 'react-hot-toast';

const fetcher = (u: string) => fetch(u).then(r => r.json());

interface Deadline {
  id: number;
  result_type_id: number | null;
  term_id: number | null;
  class_id: number | null;
  deadline_date: string;
  description: string | null;
  status: string;
}

export default function ExaminationDeadlinesPage() {
  const { data, mutate, isLoading } = useSWR<{ data: Deadline[] }>('/api/deadlines', fetcher);
  const { data: termsRes }   = useSWR('/api/terms',   fetcher);
  const { data: classesRes } = useSWR('/api/classes', fetcher);
  const { data: typesRes }   = useSWR('/api/result-types', fetcher);

  const deadlines = data?.data ?? [];
  const terms   = (termsRes as any)?.data   ?? termsRes   ?? [];
  const classes = (classesRes as any)?.data ?? classesRes ?? [];
  const types   = (typesRes as any)?.data   ?? typesRes   ?? [];

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [editing, setEditing]     = useState<Deadline | null>(null);
  const [sending, setSending]     = useState(false);
  const [form, setForm] = useState({
    resultTypeId:  '',
    termId:        '',
    classId:       '',
    deadlineDate:  '',
    description:   '',
  });

  function openCreate() {
    setEditing(null);
    setForm({ resultTypeId: '', termId: '', classId: '', deadlineDate: '', description: '' });
    setModalOpen(true);
  }
  function openEdit(d: Deadline) {
    setEditing(d);
    setForm({
      resultTypeId: d.result_type_id ? String(d.result_type_id) : '',
      termId:       d.term_id        ? String(d.term_id)        : '',
      classId:      d.class_id       ? String(d.class_id)       : '',
      deadlineDate: d.deadline_date  ? new Date(d.deadline_date).toISOString().slice(0, 16) : '',
      description:  d.description    ?? '',
    });
    setModalOpen(true);
  }

  async function save() {
    if (!form.deadlineDate) { toast.error('Deadline date required'); return; }
    setSaving(true);
    try {
      const payload: any = {
        resultTypeId: form.resultTypeId ? Number(form.resultTypeId) : null,
        termId:       form.termId       ? Number(form.termId)       : null,
        classId:      form.classId      ? Number(form.classId)      : null,
        deadlineDate: form.deadlineDate,
        description:  form.description || null,
      };
      if (editing) payload.id = editing.id;
      const res = await fetch('/api/deadlines', {
        method:  editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Save failed');
      toast.success(editing ? 'Deadline updated' : 'Deadline created');
      setModalOpen(false);
      mutate();
    } catch (e: any) { toast.error(e?.message || 'Save failed'); }
    finally { setSaving(false); }
  }

  async function sendReminders() {
    if (!confirm('Send SMS reminders to teachers for deadlines due in the next 1–2 days?')) return;
    setSending(true);
    try {
      const res = await fetch('/api/result-deadlines', { method: 'POST' });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Send failed');
      toast.success(`Sent ${j.sent} · skipped ${j.skipped_duplicates} duplicates`);
    } catch (e: any) { toast.error(e?.message || 'Send failed'); }
    finally { setSending(false); }
  }

  async function remove(id: number) {
    if (!confirm('Delete this deadline?')) return;
    try {
      const res = await fetch('/api/deadlines', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Delete failed');
      toast.success('Deleted');
      mutate();
    } catch (e: any) { toast.error(e?.message || 'Delete failed'); }
  }

  function lookupName(arr: any[], id: number | null) {
    if (!id) return '—';
    const m = arr.find((x: any) => Number(x.id) === Number(id));
    return m?.name ?? `#${id}`;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <AlarmClock className="w-6 h-6 text-indigo-500" />
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">Examination Deadlines</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={sendReminders}
            disabled={sending || deadlines.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            title="Send SMS reminders to teachers for deadlines due in the next 1-2 days"
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Send Reminders
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" /> New Deadline
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
        </div>
      ) : deadlines.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-400">
          <AlarmClock className="w-8 h-8" />
          <p className="text-sm">No deadlines yet. Click &quot;New Deadline&quot; to add one.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Deadline</th>
                <th className="px-4 py-3">Result Type</th>
                <th className="px-4 py-3">Term</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {deadlines.map(d => {
                const overdue = new Date(d.deadline_date) < new Date();
                return (
                  <tr key={d.id} className="bg-white dark:bg-slate-900">
                    <td className="px-4 py-3 font-mono text-xs flex items-center gap-2">
                      {overdue
                        ? <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                        : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                      {new Date(d.deadline_date).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">{lookupName(types, d.result_type_id)}</td>
                    <td className="px-4 py-3">{lookupName(terms, d.term_id)}</td>
                    <td className="px-4 py-3">{lookupName(classes, d.class_id)}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{d.description || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        d.status === 'active'
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}>{d.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <button onClick={() => openEdit(d)} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => remove(d.id)} className="p-1.5 rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20">
                        <Trash className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{editing ? 'Edit Deadline' : 'New Deadline'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-2 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <Field label="Deadline Date *">
                <input type="datetime-local" value={form.deadlineDate} onChange={e => setForm({ ...form, deadlineDate: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              </Field>
              <Field label="Result Type">
                <select value={form.resultTypeId} onChange={e => setForm({ ...form, resultTypeId: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800">
                  <option value="">— Any —</option>
                  {types.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="Term">
                <select value={form.termId} onChange={e => setForm({ ...form, termId: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800">
                  <option value="">— Any —</option>
                  {terms.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="Class">
                <select value={form.classId} onChange={e => setForm({ ...form, classId: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800">
                  <option value="">— Any —</option>
                  {classes.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Description">
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
