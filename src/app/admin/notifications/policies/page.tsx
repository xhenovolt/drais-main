'use client';

/**
 * /admin/notifications/policies — Phase 5 operator surface.
 *
 * Lists notification_policies for the caller's school. Lets admins
 * create, toggle, and delete policies through a small form.  The
 * policy engine + outbox drainer (Phase 5) already work; this page
 * is the missing UI handle so a school can actually configure what
 * gets sent without raw curl.
 *
 * Out of scope for this commit:
 *   - In-page audit of recent outbox rows / deliveries (separate page
 *     would belong at /admin/notifications/outbox).
 *   - Test-fire button. Comes when the outbox drainer is observable
 *     via a UI tail.
 */
import React, { useState } from 'react';
import useSWR from 'swr';
import {
  Bell, Plus, Trash2, ToggleLeft, ToggleRight, Save,
  Loader2, MessageSquare,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useI18n } from '@/components/i18n/I18nProvider';
import { uiIsArabic, isEnglishText } from '@/lib/toast';

/** A server sentence for a toast: as sent in English, the page's own Arabic message in Arabic. */
const serverMsg = (m: string, fallback: string) => (m && !(uiIsArabic() && isEnglishText(m)) ? m : fallback);

const fetcher = (u: string) => fetch(u).then(r => r.json());

interface Policy {
  id: number;
  school_id: number;
  name: string;
  event_type: string;
  target_role: 'guardian' | 'self' | 'staff_room' | 'admin';
  channel: 'sms' | 'email' | 'push';
  conditions: string | null;
  template_body: string | null;
  is_active: 1 | 0 | boolean;
  daily_cap: number;
  created_at: string;
  updated_at: string;
}

interface FormState {
  name: string;
  event_type: string;
  target_role: 'guardian' | 'self' | 'staff_room' | 'admin';
  channel: 'sms' | 'email' | 'push';
  status_in: string;          // comma-separated, e.g. 'late,absent'
  template_body: string;
  daily_cap: number;
  is_active: boolean;
}

const DEFAULT_FORM: FormState = {
  name: 'Parent SMS on late / absent',
  event_type: 'attendance.record.upserted',
  target_role: 'guardian',
  channel: 'sms',
  status_in: 'late,absent',
  template_body: 'DRAIS: {first_name} marked {status} on {date}.',
  daily_cap: 2000,
  is_active: true,
};

const EVENT_TYPES = [
  { value: 'attendance.record.upserted', label: 'Attendance record upserted', key: 'evtUpserted' },
];
const TARGETS: FormState['target_role'][] = ['guardian', 'self', 'staff_room', 'admin'];
const CHANNELS: FormState['channel'][] = ['sms', 'email', 'push'];

export default function NotificationPoliciesPage() {
  const { t, rich, lang, digits } = useI18n();
  // The suggested name follows the interface language; the template body is the SMS itself and is left as is.
  const defaultForm = (): FormState => ({ ...DEFAULT_FORM, name: t('commPages.pol.defaultName', "Parent SMS on late / absent") });
  const { data, mutate, isLoading } = useSWR<{ policies: Policy[] }>(
    '/api/admin/notification-policies',
    fetcher,
  );
  const policies = data?.policies ?? [];

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [saving, setSaving] = useState(false);

  const setF = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const submitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const statuses = form.status_in
        .split(',').map(s => s.trim()).filter(Boolean);
      const r = await fetch('/api/admin/notification-policies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          event_type: form.event_type,
          target_role: form.target_role,
          channel: form.channel,
          template_body: form.template_body || null,
          conditions: statuses.length ? { status_in: statuses } : null,
          is_active: form.is_active,
          daily_cap: form.daily_cap,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed to create');
      toast.success(t('commPages.pol.created', "Policy created"));
      setForm(defaultForm());
      setCreating(false);
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? serverMsg(err.message, t('commPages.pol.failedCreate', "Failed to create")) : t('commPages.pol.failedCreate', "Failed to create"));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: Policy) => {
    try {
      const next = !(p.is_active === true || p.is_active === 1);
      const r = await fetch(`/api/admin/notification-policies/${p.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ is_active: next }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Toggle failed');
      toast.success(next ? t('commPages.pol.activated', "Policy activated") : t('commPages.pol.paused', "Policy paused"));
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? serverMsg(err.message, t('commPages.pol.toggleFailed', "Toggle failed")) : t('commPages.pol.toggleFailed', "Toggle failed"));
    }
  };

  const deletePolicy = async (p: Policy) => {
    if (!confirm(t('commPages.pol.confirmDelete', { name: p.name }))) return;
    try {
      const r = await fetch(`/api/admin/notification-policies/${p.id}`, {
        method: 'DELETE',
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Delete failed');
      toast.success(t('commPages.pol.deleted', "Policy deleted"));
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? serverMsg(err.message, t('commPages.pol.deleteFailed', "Delete failed")) : t('commPages.pol.deleteFailed', "Delete failed"));
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Bell className="w-6 h-6 text-indigo-600" />
            {t('commPages.pol.title', "Notification Policies")}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {t('commPages.pol.intro', "Choose what events trigger SMS to guardians, staff, or admins. Each policy runs against incoming events; matched ones land in the outbox and the drainer cron sends them.")}
          </p>
        </div>
        <button
          onClick={() => setCreating(c => !c)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          <Plus className="w-4 h-4" /> {creating ? t('commPages.pol.cancel', "Cancel") : t('commPages.pol.newPolicy', "New policy")}
        </button>
      </div>

      <BroadcastRecipients />

      {creating && (
        <form
          onSubmit={submitNew}
          className="mb-6 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 space-y-3"
        >
          <Row>
            <Field label={t('commPages.pol.name', "Name")}>
              <input
                value={form.name}
                onChange={e => setF('name', e.target.value)}
                className={inputCls}
                required
              />
            </Field>
            <Field label={t('commPages.pol.event', "Event")}>
              <select
                value={form.event_type}
                onChange={e => setF('event_type', e.target.value)}
                className={inputCls}
              >
                {EVENT_TYPES.map(et => (
                  <option key={et.value} value={et.value}>{t(`commPages.pol.${et.key}`, et.label)}</option>
                ))}
              </select>
            </Field>
          </Row>
          <Row>
            <Field label={t('commPages.pol.recipient', "Recipient")}>
              <select
                value={form.target_role}
                onChange={e => setF('target_role', e.target.value as FormState['target_role'])}
                className={inputCls}
              >
                {TARGETS.map(r => <option key={r} value={r}>{t(`commPages.pol.target.${r}`, r)}</option>)}
              </select>
            </Field>
            <Field label={t('commPages.pol.channelLabel', "Channel")}>
              <select
                value={form.channel}
                onChange={e => setF('channel', e.target.value as FormState['channel'])}
                className={inputCls}
              >
                {CHANNELS.map(c => <option key={c} value={c}>{t(`commPages.pol.channel.${c}`, c)}</option>)}
              </select>
            </Field>
            <Field label={t('commPages.pol.dailyCap', "Daily cap")}>
              <input
                type="number"
                min={1}
                value={form.daily_cap}
                onChange={e => setF('daily_cap', Number(e.target.value) || 0)}
                className={inputCls}
              />
            </Field>
          </Row>
          <Field label={t('commPages.pol.statusFilter', "Status filter (comma-separated)")}>
            <input
              value={form.status_in}
              onChange={e => setF('status_in', e.target.value)}
              placeholder="late,absent,half_day"
              className={inputCls}
            />
            <p className="text-xs text-gray-500 mt-1">
              {rich('commPages.pol.statusHelp', { ex: <code dir="ltr">late,absent</code> })}
            </p>
          </Field>
          <Field label={t('commPages.pol.templateBody', "Template body")}>
            <textarea
              rows={3}
              value={form.template_body}
              onChange={e => setF('template_body', e.target.value)}
              className={inputCls}
            />
            <p className="text-xs text-gray-500 mt-1">
              {rich('commPages.pol.placeholders', { list: <><code>{'{status}'}</code>, <code>{'{date}'}</code>, <code>{'{first_in}'}</code>, <code>{'{late_minutes}'}</code>, <code>{'{early_minutes}'}</code></> })}
            </p>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => setF('is_active', e.target.checked)}
            />
            {t('commPages.pol.activeNow', "Active immediately")}
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600"
            >
              {t('commPages.pol.cancel', "Cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {t('commPages.pol.savePolicy', "Save policy")}
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="w-4 h-4 animate-spin" /> {t('commPages.pol.loading', "Loading…")}
        </div>
      ) : policies.length === 0 ? (
        <div className="text-center py-16 rounded-xl border border-dashed border-gray-300 dark:border-gray-600">
          <MessageSquare className="w-10 h-10 mx-auto text-gray-400 mb-2" />
          <p className="text-sm text-gray-600">
            {rich('commPages.pol.none', { btn: <strong>{t('commPages.pol.newPolicy', 'New policy')}</strong> })}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
          {policies.map(p => {
            const active = p.is_active === true || p.is_active === 1;
            let conds: { status_in?: string[] } | null = null;
            try { conds = p.conditions ? JSON.parse(p.conditions) : null; } catch { /* ignore */ }
            return (
              <div key={p.id} className="p-4 flex items-start gap-4">
                <button
                  onClick={() => toggleActive(p)}
                  className="mt-0.5 text-gray-600 hover:text-indigo-600"
                  title={active ? t('commPages.pol.pause', "Pause") : t('commPages.pol.activate', "Activate")}
                >
                  {active
                    ? <ToggleRight className="w-7 h-7 text-emerald-500" />
                    : <ToggleLeft  className="w-7 h-7" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {p.name}
                    </span>
                    <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                      active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {active ? t('commPages.pol.stActive', "active") : t('commPages.pol.stPaused', "paused")}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                      {t(`commPages.pol.channel.${p.channel}`, p.channel)}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                      <span className="rtl:hidden">→</span><span className="ltr:hidden">←</span> {t(`commPages.pol.target.${p.target_role}`, p.target_role)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1 font-mono">
                    {p.event_type === 'attendance.record.upserted' ? t('commPages.pol.evtUpserted', p.event_type) : p.event_type}
                  </div>
                  {conds?.status_in?.length ? (
                    <div className="text-xs text-gray-600 mt-1">
                      {t('commPages.pol.statusFilterShown', { list: conds.status_in.join(', ') })}
                    </div>
                  ) : null}
                  {p.template_body && (
                    <div className="text-xs text-gray-600 mt-1 italic">
                      &ldquo;{p.template_body}&rdquo;
                    </div>
                  )}
                  <div className="text-[11px] text-gray-400 mt-1">
                    {t('commPages.pol.capLine', { cap: p.daily_cap, when: lang === 'ar' ? digits(new Date(p.updated_at).toLocaleString('ar')) : new Date(p.updated_at).toLocaleString() })}
                  </div>
                </div>
                <button
                  onClick={() => deletePolicy(p)}
                  className="text-gray-400 hover:text-red-600"
                  title={t('commPages.pol.deletePolicy', "Delete policy")}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const inputCls =
  'w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500';

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
      <div className="mt-0.5">{children}</div>
    </label>
  );
}

/**
 * A 'staff_room' or 'admin' target_role policy above has always been
 * creatable — it just silently produced zero recipients, with no error
 * and no way to configure who that even means. This is the missing
 * config surface for both.
 */
function BroadcastRecipients() {
  const { t, rich } = useI18n();
  const { data, mutate } = useSWR<{ staff_room_phones: string[]; admin_phones: string[] }>(
    '/api/admin/notification-policies/broadcast-recipients', fetcher,
  );
  const [staffRoom, setStaffRoom] = useState('');
  const [admin, setAdmin] = useState('');
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  React.useEffect(() => {
    if (data) { setStaffRoom(data.staff_room_phones.join(', ')); setAdmin(data.admin_phones.join(', ')); }
  }, [data]);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/admin/notification-policies/broadcast-recipients', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_room_phones: staffRoom, admin_phones: admin }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Save failed');
      toast.success(t('commPages.pol.bcSaved', "Broadcast recipients saved"));
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? serverMsg(err.message, t('commPages.pol.saveFailed', "Save failed")) : t('commPages.pol.saveFailed', "Save failed"));
    } finally { setSaving(false); }
  };

  return (
    <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 text-start">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
          <MessageSquare className="w-4 h-4 text-indigo-500" /> {t('commPages.pol.bcTitle', "Broadcast recipients (staff room / admin)")}
        </span>
        <span className="text-xs text-indigo-600 dark:text-indigo-400">{open ? t('commPages.pol.hide', "Hide") : t('commPages.pol.configure', "Configure")}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('commPages.pol.bcHelp', { staff: t('commPages.pol.target.staff_room', 'staff_room'), admin: t('commPages.pol.target.admin', 'admin') })}
          </p>
          <Row>
            <Field label={t('commPages.pol.staffPhones', "Staff room phone(s)")}>
              <input className={inputCls} value={staffRoom} onChange={e => setStaffRoom(e.target.value)} placeholder={t('commPages.pol.staffPh', "e.g. 0700111222, 0700333444")} />
            </Field>
            <Field label={t('commPages.pol.adminPhones', "Admin phone(s)")}>
              <input className={inputCls} value={admin} onChange={e => setAdmin(e.target.value)} placeholder={t('commPages.pol.adminPh', "e.g. 0700555666")} />
            </Field>
          </Row>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50">
            <Save className="w-3.5 h-3.5" /> {saving ? t('commPages.pol.saving', "Saving…") : t('commPages.pol.save', "Save")}
          </button>
        </div>
      )}
    </div>
  );
}
