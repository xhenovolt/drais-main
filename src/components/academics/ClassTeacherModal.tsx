'use client';
import React, { useState } from 'react';
import useSWR from 'swr';
import { X, User, Calendar, Loader2, Save, Clock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useI18n } from '@/components/i18n/I18nProvider';
import { uiIsArabic, isEnglishText } from '@/lib/toast';

const fetcher = (u: string) => fetch(u).then(r => r.json());

interface Assignment {
  id:         number;
  classId:    number;
  streamId:   number | null;
  termId:     number;
  staffId:    number;
  staffName:  string;
  assignedAt: string;
  validUntil: string | null;
  notes:      string | null;
}

interface Props {
  open:      boolean;
  onClose:   () => void;
  classId:   number;
  className: string;
}

export default function ClassTeacherModal({ open, onClose, classId, className }: Props) {
  const { t, lang } = useI18n();
  const day = (v: string) => (lang === 'ar' ? new Date(v).toLocaleDateString('ar-EG') : new Date(v).toLocaleDateString());
  const { data: histRes, mutate, isLoading } = useSWR<{ assignments: Assignment[] }>(
    open && classId ? `/api/admin/classes/${classId}/teacher` : null,
    fetcher
  );
  const { data: teachersRes } = useSWR(open ? '/api/teachers' : null, fetcher);
  const { data: termsRes }    = useSWR(open ? '/api/terms'    : null, fetcher);
  const { data: streamsRes }  = useSWR(open ? `/api/streams?class_id=${classId}` : null, fetcher);

  // Arrays only — an error body must never reach .map/.filter.
  const arr = (x: any): any[] => (Array.isArray(x?.data) ? x.data : Array.isArray(x) ? x : []);
  const teachers: any[] = arr(teachersRes);
  const terms:    any[] = arr(termsRes);
  const streams:  any[] = arr(streamsRes);
  const history = Array.isArray(histRes?.assignments) ? histRes!.assignments : [];
  const active = history.filter(a => a.validUntil === null);

  const [form, setForm] = useState({ staffId: '', termId: '', streamId: '', notes: '' });
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  async function assign() {
    if (!form.staffId || !form.termId) {
      toast.error(t('academicsPages.classes.ct.required', "Teacher and term required")); return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/classes/${classId}/teacher`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          staff_id:  Number(form.staffId),
          term_id:   Number(form.termId),
          stream_id: form.streamId ? Number(form.streamId) : null,
          notes:     form.notes || null,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Assign failed');
      toast.success(t('academicsPages.classes.ct.assigned', "Class teacher assigned"));
      setForm({ staffId: '', termId: '', streamId: '', notes: '' });
      mutate();
    } catch (e: any) { toast.error(e?.message && !(uiIsArabic() && isEnglishText(e.message)) ? e.message : t('academicsPages.classes.ct.failed', "Assign failed")); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h3 className="text-lg font-semibold">{t('academicsPages.classes.ct.title', { cls: className })}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{t('academicsPages.classes.ct.subtitle', "Time-bounded per term, optionally per stream")}</p>
          </div>
          <button onClick={onClose} aria-label={t('academicsPages.classes.close', "Close")} className="p-2 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Active assignments */}
          <section>
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">{t('academicsPages.classes.ct.active', "Currently Active")}</h4>
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            ) : active.length === 0 ? (
              <p className="text-sm text-slate-400">{t('academicsPages.classes.ct.noActive', "No active class teacher assignment.")}</p>
            ) : (
              <div className="space-y-2">
                {active.map(a => {
                  const term = terms.find(tm => Number(tm.id) === a.termId);
                  const stream = streams.find(s => Number(s.id) === a.streamId);
                  return (
                    <div key={a.id} className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                          <User className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{a.staffName}</p>
                          <p className="text-[11px] text-slate-500">
                            {term?.name ?? t('academicsPages.classes.ct.termNo', { id: a.termId })}
                            {stream ? ` · ${stream.name}` : t('academicsPages.classes.ct.allStreamsSuffix', " · all streams")}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-200 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200">
                        {t('academicsPages.classes.ct.activeBadge', "active")}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* New assignment form */}
          <section className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('academicsPages.classes.ct.assignNew', "Assign New")}</h4>
            <div className="grid sm:grid-cols-2 gap-3">
              <F label={t('academicsPages.classes.ct.teacher', "Teacher *")}>
                <select value={form.staffId} onChange={e => setForm({ ...form, staffId: e.target.value })} className={inputCls}>
                  <option value="">{t('academicsPages.classes.ct.select', "— Select —")}</option>
                  {teachers.map((tch: any) => (
                    <option key={tch.id} value={tch.id}>{tch.first_name} {tch.last_name}</option>
                  ))}
                </select>
              </F>
              <F label={t('academicsPages.classes.ct.term', "Term *")}>
                <select value={form.termId} onChange={e => setForm({ ...form, termId: e.target.value })} className={inputCls}>
                  <option value="">{t('academicsPages.classes.ct.select', "— Select —")}</option>
                  {terms.map((tm: any) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
                </select>
              </F>
              <F label={t('academicsPages.classes.ct.stream', "Stream (optional)")}>
                <select value={form.streamId} onChange={e => setForm({ ...form, streamId: e.target.value })} className={inputCls}>
                  <option value="">{t('academicsPages.classes.ct.allStreams', "All streams")}</option>
                  {streams.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </F>
              <F label={t('academicsPages.classes.ct.notes', "Notes (optional)")}>
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={inputCls} />
              </F>
            </div>
            <div className="flex justify-end">
              <button onClick={assign} disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t('academicsPages.classes.ct.assign', "Assign")}
              </button>
            </div>
          </section>

          {/* Full history */}
          <section>
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" /> {t('academicsPages.classes.ct.history', "Full History")}
            </h4>
            {history.length === 0 ? (
              <p className="text-sm text-slate-400">{t('academicsPages.classes.ct.noHistory', "No history yet.")}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr className="text-start text-[10px] uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 text-start">{t('academicsPages.classes.ct.col.teacher', "Teacher")}</th>
                      <th className="px-3 py-2 text-start">{t('academicsPages.classes.ct.col.term', "Term")}</th>
                      <th className="px-3 py-2 text-start">{t('academicsPages.classes.ct.col.stream', "Stream")}</th>
                      <th className="px-3 py-2 text-start">{t('academicsPages.classes.ct.col.assigned', "Assigned")}</th>
                      <th className="px-3 py-2 text-start">{t('academicsPages.classes.ct.col.ended', "Ended")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {history.map(a => {
                      const term = terms.find(tm => Number(tm.id) === a.termId);
                      const stream = streams.find(s => Number(s.id) === a.streamId);
                      return (
                        <tr key={a.id} className="bg-white dark:bg-slate-900">
                          <td className="px-3 py-2 font-semibold">{a.staffName}</td>
                          <td className="px-3 py-2">{term?.name ?? t('academicsPages.classes.ct.termNo', { id: a.termId })}</td>
                          <td className="px-3 py-2 text-slate-500">{stream?.name ?? t('academicsPages.classes.ct.all', "all")}</td>
                          <td className="px-3 py-2 font-mono text-slate-500">
                            {day(a.assignedAt)}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-500">
                            {a.validUntil ? day(a.validUntil) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
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
