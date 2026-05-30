"use client";
/**
 * Quick-edit drawer — edit a learner's common operational fields without
 * leaving the list. Posts to the existing PUT /api/students/edit (dynamic
 * update: only changed fields are sent). On success, calls onSaved so the
 * list can refresh the single row.
 *
 * Deliberately additive: the list page just renders this and passes a learner.
 */
import React, { useState, useEffect } from 'react';
import { X, Loader, Save } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';

export interface QuickEditLearner {
  id: number;
  first_name?: string;
  last_name?: string;
  other_name?: string;
  gender?: string;
  phone?: string;
  email?: string;
  status?: string;
  class_id?: number;
  class_name?: string;
}

interface Option { value: number | string; label: string }

export default function QuickEditDrawer({
  learner, classes, open, onClose, onSaved,
}: {
  learner: QuickEditLearner | null;
  classes: Option[];
  open: boolean;
  onClose: () => void;
  onSaved: (updated: Partial<QuickEditLearner>) => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<QuickEditLearner | null>(learner);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { setForm(learner); setErr(''); }, [learner]);

  if (!open || !form) return null;

  const set = (k: keyof QuickEditLearner, v: any) => setForm(f => (f ? { ...f, [k]: v } : f));

  async function save() {
    if (!form) return;
    setBusy(true); setErr('');
    try {
      // Send only the editable fields; the endpoint diffs against current.
      const payload: any = {
        id: form.id,
        first_name: form.first_name,
        last_name: form.last_name,
        other_name: form.other_name,
        gender: form.gender,
        phone: form.phone,
        email: form.email,
        status: form.status,
      };
      if (form.class_id) payload.class_id = form.class_id;

      const res = await fetch('/api/students/edit', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setErr(data.message || data.error?.code || 'Update failed'); return; }
      onSaved({
        first_name: form.first_name, last_name: form.last_name, other_name: form.other_name,
        gender: form.gender, phone: form.phone, email: form.email,
        status: form.status, class_id: form.class_id,
        class_name: classes.find(c => Number(c.value) === Number(form.class_id))?.label ?? form.class_name,
      });
      onClose();
    } catch { setErr('Network error'); }
    finally { setBusy(false); }
  }

  const Label = ({ children }: { children: React.ReactNode }) => (
    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{children}</span>
  );
  const input = "w-full mt-1 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div className="fixed inset-0 z-[90] flex justify-end" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-sm h-full bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-700 flex flex-col"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <p className="text-sm font-bold text-slate-800 dark:text-white">{t('operations.quickEdit')}</p>
            <p className="text-[11px] text-slate-400">{form.first_name} {form.last_name}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {err && <div className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-900/20 rounded-lg px-3 py-2">{err}</div>}
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><Label>{t('fields.firstName')}</Label>
              <input className={input} value={form.first_name ?? ''} onChange={e => set('first_name', e.target.value)} /></label>
            <label className="block"><Label>{t('fields.lastName')}</Label>
              <input className={input} value={form.last_name ?? ''} onChange={e => set('last_name', e.target.value)} /></label>
          </div>
          <label className="block"><Label>{t('fields.middleName')}</Label>
            <input className={input} value={form.other_name ?? ''} onChange={e => set('other_name', e.target.value)} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><Label>{t('fields.gender')}</Label>
              <select className={input} value={form.gender ?? ''} onChange={e => set('gender', e.target.value)}>
                <option value="">—</option><option value="male">{t('fields.male')}</option><option value="female">{t('fields.female')}</option>
              </select></label>
            <label className="block"><Label>{t('common.status')}</Label>
              <select className={input} value={form.status ?? ''} onChange={e => set('status', e.target.value)}>
                <option value="active">{t('studentStatuses.active')}</option><option value="inactive">{t('studentStatuses.inactive')}</option>
                <option value="suspended">{t('studentStatuses.suspended')}</option><option value="graduated">{t('studentStatuses.graduated')}</option>
                <option value="transferred">{t('studentStatuses.transferred')}</option>
              </select></label>
          </div>
          <label className="block"><Label>{t('fields.phone')}</Label>
            <input className={input} value={form.phone ?? ''} onChange={e => set('phone', e.target.value)} /></label>
          <label className="block"><Label>{t('fields.email')}</Label>
            <input className={input} value={form.email ?? ''} onChange={e => set('email', e.target.value)} /></label>
          <label className="block"><Label>{t('orgUnits.class')}</Label>
            <select className={input} value={form.class_id ?? ''} onChange={e => set('class_id', Number(e.target.value))}>
              <option value="">— keep current ({form.class_name ?? 'none'}) —</option>
              {classes.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select></label>
          <p className="text-[10px] text-slate-400">Changing class re-enrolls the learner in the selected class.</p>
        </div>

        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800">{t('common.cancel')}</button>
          <button onClick={save} disabled={busy} className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
            {busy ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {t('actions.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
