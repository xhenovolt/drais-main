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
  { value: 'attendance.record.upserted', label: 'Attendance record upserted' },
];
const TARGETS: FormState['target_role'][] = ['guardian', 'self', 'staff_room', 'admin'];
const CHANNELS: FormState['channel'][] = ['sms', 'email', 'push'];

export default function NotificationPoliciesPage() {
  const { data, mutate, isLoading } = useSWR<{ policies: Policy[] }>(
    '/api/admin/notification-policies',
    fetcher,
  );
  const policies = data?.policies ?? [];

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
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
      toast.success('Policy created');
      setForm(DEFAULT_FORM);
      setCreating(false);
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create');
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
      toast.success(next ? 'Policy activated' : 'Policy paused');
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Toggle failed');
    }
  };

  const deletePolicy = async (p: Policy) => {
    if (!confirm(`Delete policy "${p.name}"? This is irreversible.`)) return;
    try {
      const r = await fetch(`/api/admin/notification-policies/${p.id}`, {
        method: 'DELETE',
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Delete failed');
      toast.success('Policy deleted');
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Bell className="w-6 h-6 text-indigo-600" />
            Notification Policies
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Choose what events trigger SMS to guardians, staff, or admins.
            Each policy runs against incoming events; matched ones land in
            the outbox and the drainer cron sends them.
          </p>
        </div>
        <button
          onClick={() => setCreating(c => !c)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          <Plus className="w-4 h-4" /> {creating ? 'Cancel' : 'New policy'}
        </button>
      </div>

      <BroadcastRecipients />

      {creating && (
        <form
          onSubmit={submitNew}
          className="mb-6 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 space-y-3"
        >
          <Row>
            <Field label="Name">
              <input
                value={form.name}
                onChange={e => setF('name', e.target.value)}
                className={inputCls}
                required
              />
            </Field>
            <Field label="Event">
              <select
                value={form.event_type}
                onChange={e => setF('event_type', e.target.value)}
                className={inputCls}
              >
                {EVENT_TYPES.map(et => (
                  <option key={et.value} value={et.value}>{et.label}</option>
                ))}
              </select>
            </Field>
          </Row>
          <Row>
            <Field label="Recipient">
              <select
                value={form.target_role}
                onChange={e => setF('target_role', e.target.value as FormState['target_role'])}
                className={inputCls}
              >
                {TARGETS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Channel">
              <select
                value={form.channel}
                onChange={e => setF('channel', e.target.value as FormState['channel'])}
                className={inputCls}
              >
                {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Daily cap">
              <input
                type="number"
                min={1}
                value={form.daily_cap}
                onChange={e => setF('daily_cap', Number(e.target.value) || 0)}
                className={inputCls}
              />
            </Field>
          </Row>
          <Field label="Status filter (comma-separated)">
            <input
              value={form.status_in}
              onChange={e => setF('status_in', e.target.value)}
              placeholder="late,absent,half_day"
              className={inputCls}
            />
            <p className="text-xs text-gray-500 mt-1">
              Leave blank to match every status. Example: <code>late,absent</code>
            </p>
          </Field>
          <Field label="Template body">
            <textarea
              rows={3}
              value={form.template_body}
              onChange={e => setF('template_body', e.target.value)}
              className={inputCls}
            />
            <p className="text-xs text-gray-500 mt-1">
              Placeholders: <code>{'{status}'}</code>, <code>{'{date}'}</code>,
              <code>{'{first_in}'}</code>, <code>{'{late_minutes}'}</code>,
              <code>{'{early_minutes}'}</code>
            </p>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => setF('is_active', e.target.checked)}
            />
            Active immediately
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save policy
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : policies.length === 0 ? (
        <div className="text-center py-16 rounded-xl border border-dashed border-gray-300 dark:border-gray-600">
          <MessageSquare className="w-10 h-10 mx-auto text-gray-400 mb-2" />
          <p className="text-sm text-gray-600">
            No policies yet. Click <strong>New policy</strong> to start.
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
                  title={active ? 'Pause' : 'Activate'}
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
                      {active ? 'active' : 'paused'}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                      {p.channel}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                      → {p.target_role}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1 font-mono">
                    {p.event_type}
                  </div>
                  {conds?.status_in?.length ? (
                    <div className="text-xs text-gray-600 mt-1">
                      Status filter: {conds.status_in.join(', ')}
                    </div>
                  ) : null}
                  {p.template_body && (
                    <div className="text-xs text-gray-600 mt-1 italic">
                      &ldquo;{p.template_body}&rdquo;
                    </div>
                  )}
                  <div className="text-[11px] text-gray-400 mt-1">
                    cap {p.daily_cap}/day · updated {new Date(p.updated_at).toLocaleString()}
                  </div>
                </div>
                <button
                  onClick={() => deletePolicy(p)}
                  className="text-gray-400 hover:text-red-600"
                  title="Delete policy"
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
      toast.success('Broadcast recipients saved');
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
          <MessageSquare className="w-4 h-4 text-indigo-500" /> Broadcast recipients (staff room / admin)
        </span>
        <span className="text-xs text-indigo-600 dark:text-indigo-400">{open ? 'Hide' : 'Configure'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            A policy targeting "staff_room" or "admin" sends here — comma-separated phone numbers, no per-person setup needed.
          </p>
          <Row>
            <Field label="Staff room phone(s)">
              <input className={inputCls} value={staffRoom} onChange={e => setStaffRoom(e.target.value)} placeholder="e.g. 0700111222, 0700333444" />
            </Field>
            <Field label="Admin phone(s)">
              <input className={inputCls} value={admin} onChange={e => setAdmin(e.target.value)} placeholder="e.g. 0700555666" />
            </Field>
          </Row>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50">
            <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}
