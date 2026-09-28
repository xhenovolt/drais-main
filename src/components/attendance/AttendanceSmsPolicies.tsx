'use client';

/**
 * AttendanceSmsPolicies — full editor for attendance notification policies.
 * Binds to /api/admin/notification-policies (GET/POST) and
 * /api/admin/notification-policies/[id] (PATCH/DELETE).
 *
 * Two trigger kinds, both driven by is_active so every rule is independently
 * toggleable:
 *   - 'attendance.record.upserted' — fires when the day's attendance STATUS is
 *     set (present/late/absent/half_day/early_leave); conditions.status_in
 *     picks which statuses trigger this rule.
 *   - 'attendance.departure.recorded' — fires on a genuine final exit for the
 *     day, independent of that day's overall status. This is what makes a
 *     plain "your child has left school" message possible even when the
 *     departure isn't early (see src/lib/notifications/fanout.ts).
 *
 * Every rule also carries an "applies to" audience: role (everyone / students
 * / staff), and for students, boarding scope (everyone / boarding / day) and
 * a specific set of classes — read by src/lib/notifications/fanout.ts's
 * matchesTargeting(). A rule with target_role='admin' + applies_to='staff'
 * is how a school gets an SMS to admins whenever a staff member punches in.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { MessageSquare, Plus, Trash2, Save, Loader2, X, CheckCircle, AlertTriangle, Power } from 'lucide-react';

type EventType = 'attendance.record.upserted' | 'attendance.departure.recorded';
const TRIGGERS: { v: EventType; label: string; hint: string }[] = [
  { v: 'attendance.record.upserted', label: 'Attendance status', hint: 'On-time arrival, late, absent, half-day or an early departure.' },
  { v: 'attendance.departure.recorded', label: 'Departure / check-out', hint: 'Any time the person actually leaves school for the day — on time, early or late. Independent of the statuses above.' },
];
const STATUSES = ['present', 'late', 'absent', 'half_day', 'early_leave'] as const;
const TARGETS = [
  { v: 'guardian', label: 'Guardian' },
  { v: 'self', label: 'The person (self)' },
  { v: 'staff_room', label: 'Staff room' },
  { v: 'admin', label: 'Admin' },
] as const;
const CHANNELS = [{ v: 'sms', label: 'SMS' }, { v: 'email', label: 'Email' }, { v: 'push', label: 'Push' }] as const;
const APPLIES_TO = [
  { v: '', label: 'Everyone' },
  { v: 'student', label: 'Students' },
  { v: 'staff', label: 'Staff' },
] as const;
const BOARDING_SCOPES = [
  { v: 'all', label: 'Boarding + day' },
  { v: 'boarding', label: 'Boarding only' },
  { v: 'day', label: 'Day scholars only' },
] as const;

const TEMPLATE_VARS = '{name} {first_name} {school} {date} {time} {late_minutes} {early_minutes} {status}';

// Professional, parent-facing example templates the admin can insert.
const EXAMPLES: { label: string; body: string }[] = [
  { label: 'Late arrival', body: 'Dear Parent/Guardian, this is to notify you that {name} arrived late to {school} on {date} at {time} ({late_minutes} min late). Thank you.' },
  { label: 'Absent', body: 'Dear Parent/Guardian, our records show that {name} was absent from {school} on {date}. Please contact the school if this is unexpected. Thank you.' },
  { label: 'Arrived safely', body: 'Dear Parent/Guardian, {name} arrived safely at {school} on {date} at {time}. Thank you.' },
  { label: 'Early leave', body: 'Dear Parent/Guardian, {name} left {school} early on {date} ({early_minutes} min early). Thank you.' },
  { label: 'Departed', body: 'Dear Parent/Guardian, {name} has left {school} on {date} at {time}. Thank you.' },
  { label: 'Staff punched in (to admin)', body: '{name} punched in at {school} on {date} at {time}.' },
];

interface ClassOption { id: number; name: string }

interface Policy {
  id: number;
  name: string;
  event_type: string;
  target_role: string;
  channel: string;
  conditions: any;
  template_body: string | null;
  is_active: number;
  daily_cap: number;
}

interface Draft {
  id?: number;
  name: string;
  event_type: EventType;
  target_role: string;
  channel: string;
  status_in: string[];
  applies_to: '' | 'student' | 'staff';
  boarding_scope: 'all' | 'boarding' | 'day';
  class_ids: number[];
  template_body: string;
  daily_cap: number;
  is_active: boolean;
}

const emptyDraft: Draft = {
  name: '', event_type: 'attendance.record.upserted', target_role: 'guardian', channel: 'sms',
  status_in: ['late', 'absent'], applies_to: '', boarding_scope: 'all', class_ids: [],
  template_body: '', daily_cap: 5000, is_active: true,
};

interface ParsedConditions { statusIn: string[]; appliesTo: '' | 'student' | 'staff'; boardingScope: 'all' | 'boarding' | 'day'; classIds: number[] }

function parseConditions(c: any): ParsedConditions {
  let obj: any = {};
  try { obj = typeof c === 'string' ? JSON.parse(c) : (c || {}); } catch { obj = {}; }
  return {
    statusIn: Array.isArray(obj?.status_in) ? obj.status_in : [],
    appliesTo: obj?.role_type === 'student' || obj?.role_type === 'staff' ? obj.role_type : '',
    boardingScope: obj?.boarding_scope === 'boarding' || obj?.boarding_scope === 'day' ? obj.boarding_scope : 'all',
    classIds: Array.isArray(obj?.class_ids) ? obj.class_ids.map(Number).filter(Number.isFinite) : [],
  };
}

function describeAudience(p: ParsedConditions, classesById: Map<number, string>): string {
  const parts: string[] = [];
  parts.push(p.appliesTo === 'staff' ? 'Staff' : p.appliesTo === 'student' ? 'Students' : 'Everyone');
  if (p.appliesTo !== 'staff' && p.boardingScope !== 'all') parts.push(p.boardingScope === 'boarding' ? 'boarding only' : 'day scholars only');
  if (p.appliesTo !== 'staff' && p.classIds.length > 0) {
    const names = p.classIds.map((id) => classesById.get(id)).filter(Boolean) as string[];
    parts.push(names.length ? `class: ${names.join(', ')}` : `${p.classIds.length} class(es)`);
  }
  return parts.join(' · ');
}

export default function AttendanceSmsPolicies() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const flash = (type: 'success' | 'error', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3500); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/notification-policies');
      const j = await r.json();
      setPolicies((j.policies || []).filter((p: Policy) => p.event_type === 'attendance.record.upserted' || p.event_type === 'attendance.departure.recorded'));
    } catch { flash('error', 'Could not load SMS policies'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch('/api/classes').then((r) => r.json()).then((j) => setClasses((j.data || []).map((c: any) => ({ id: Number(c.id), name: c.display_name || c.name })))).catch(() => {});
  }, []);
  const classesById = new Map(classes.map((c) => [c.id, c.name]));

  const startEdit = (p: Policy) => {
    const c = parseConditions(p.conditions);
    setDraft({
      id: p.id, name: p.name, event_type: (p.event_type as EventType) || 'attendance.record.upserted',
      target_role: p.target_role, channel: p.channel,
      status_in: c.statusIn, applies_to: c.appliesTo, boarding_scope: c.boardingScope, class_ids: c.classIds,
      template_body: p.template_body || '', daily_cap: p.daily_cap ?? 5000, is_active: p.is_active === 1,
    });
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) { flash('error', 'Name is required'); return; }
    if (draft.event_type === 'attendance.record.upserted' && draft.status_in.length === 0) {
      flash('error', 'Pick at least one status to trigger on'); return;
    }
    setBusy(true);
    const conditions: Record<string, unknown> = {};
    if (draft.event_type === 'attendance.record.upserted') conditions.status_in = draft.status_in;
    if (draft.applies_to) conditions.role_type = draft.applies_to;
    if (draft.applies_to !== 'staff') {
      if (draft.boarding_scope !== 'all') conditions.boarding_scope = draft.boarding_scope;
      if (draft.class_ids.length > 0) conditions.class_ids = draft.class_ids;
    }
    const payload = {
      name: draft.name.trim(),
      event_type: draft.event_type,
      target_role: draft.target_role,
      channel: draft.channel,
      conditions,
      template_body: draft.template_body.trim() || null,
      is_active: draft.is_active,
      daily_cap: draft.daily_cap,
    };
    try {
      const res = draft.id
        ? await fetch(`/api/admin/notification-policies/${draft.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/admin/notification-policies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error();
      flash('success', draft.id ? 'Policy updated' : 'Policy created');
      setDraft(null); load();
    } catch { flash('error', 'Save failed'); }
    finally { setBusy(false); }
  };

  const toggleActive = async (p: Policy) => {
    try {
      await fetch(`/api/admin/notification-policies/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: p.is_active !== 1 }) });
      load();
    } catch { flash('error', 'Could not toggle'); }
  };

  const del = async (p: Policy) => {
    if (!confirm(`Delete SMS policy "${p.name}"?`)) return;
    try {
      const res = await fetch(`/api/admin/notification-policies/${p.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      flash('success', 'Policy deleted'); load();
    } catch { flash('error', 'Delete failed'); }
  };

  const fieldCls = 'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-indigo-500" /> Attendance SMS / Notifications
        </h2>
        {!draft && (
          <button onClick={() => setDraft({ ...emptyDraft })} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> New rule
          </button>
        )}
      </div>

      {toast && (
        <div className={`flex items-center gap-2 p-2.5 rounded-lg text-sm font-medium ${toast.type === 'success' ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}{toast.msg}
        </div>
      )}

      <p className="text-xs text-gray-500">
        Messages are queued to an outbox and sent in the background (never blocks a scan). Every rule is independently on/off — switch one off any time without losing its setup.
      </p>

      {/* Editor */}
      {draft && (
        <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-900/10 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{draft.id ? 'Edit rule' : 'New rule'}</span>
            <button onClick={() => setDraft(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Rule name</label>
            <input className={fieldCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Departure → guardian" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Trigger</label>
            <div className="flex flex-wrap gap-2">
              {TRIGGERS.map((t) => {
                const on = draft.event_type === t.v;
                return (
                  <button key={t.v} type="button" disabled={!!draft.id}
                    onClick={() => setDraft({ ...draft, event_type: t.v })}
                    title={draft.id ? 'The trigger cannot be changed after a rule is created — delete and re-create instead.' : t.hint}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border text-left ${on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600'} ${draft.id ? 'opacity-70 cursor-not-allowed' : ''}`}>
                    {t.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">{TRIGGERS.find((t) => t.v === draft.event_type)?.hint}</p>
          </div>

          {draft.event_type === 'attendance.record.upserted' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Trigger when status is</label>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((st) => {
                  const on = draft.status_in.includes(st);
                  return (
                    <button key={st} type="button"
                      onClick={() => setDraft({ ...draft, status_in: on ? draft.status_in.filter((x) => x !== st) : [...draft.status_in, st] })}
                      className={`px-3 py-1 rounded-full text-xs font-medium border capitalize ${on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600'}`}>
                      {st.replace('_', '-')}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="border-t border-indigo-100 dark:border-indigo-900 pt-3">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Applies to</label>
            <div className="flex flex-wrap gap-2">
              {APPLIES_TO.map((a) => {
                const on = draft.applies_to === a.v;
                return (
                  <button key={a.v || 'everyone'} type="button"
                    onClick={() => setDraft({ ...draft, applies_to: a.v })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600'}`}>
                    {a.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              {draft.target_role === 'admin' && draft.applies_to === 'staff'
                ? 'This is how admins get texted whenever a staff member punches in.'
                : 'Who this rule watches. "Send to" below is who receives the message.'}
            </p>
          </div>

          {draft.applies_to !== 'staff' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Boarding scope</label>
                <select className={fieldCls} value={draft.boarding_scope} onChange={(e) => setDraft({ ...draft, boarding_scope: e.target.value as Draft['boarding_scope'] })}>
                  {BOARDING_SCOPES.map((b) => <option key={b.v} value={b.v}>{b.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Class(es) — leave empty for all</label>
                <select multiple className={`${fieldCls} h-24`} value={draft.class_ids.map(String)}
                  onChange={(e) => setDraft({ ...draft, class_ids: Array.from(e.target.selectedOptions).map((o) => Number(o.value)) })}>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Send to</label>
              <select className={fieldCls} value={draft.target_role} onChange={(e) => setDraft({ ...draft, target_role: e.target.value })}>
                {TARGETS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Channel</label>
              <select className={fieldCls} value={draft.channel} onChange={(e) => setDraft({ ...draft, channel: e.target.value })}>
                {CHANNELS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Daily cap (max messages/day)</label>
            <input type="number" min={1} className={fieldCls} value={draft.daily_cap} onChange={(e) => setDraft({ ...draft, daily_cap: parseInt(e.target.value) || 1 })} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Message template</label>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              <span className="text-[11px] text-gray-400 self-center">Insert example:</span>
              {EXAMPLES.map((ex) => (
                <button key={ex.label} type="button" onClick={() => setDraft({ ...draft, template_body: ex.body })}
                  className="text-[11px] px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20">
                  {ex.label}
                </button>
              ))}
            </div>
            <textarea className={`${fieldCls} resize-none`} rows={3} value={draft.template_body}
              onChange={(e) => setDraft({ ...draft, template_body: e.target.value })}
              placeholder="Leave blank to use the professional built-in default, or insert an example above and edit it." />
            <p className="text-[11px] text-gray-400 mt-1">Variables: <code>{TEMPLATE_VARS}</code> — <code>{'{name}'}</code> is the learner/staff member, <code>{'{school}'}</code> your school, <code>{'{time}'}</code> the arrival (or departure) time.</p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} className="rounded" />
            <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
          </label>

          <div className="flex justify-end gap-2">
            <button onClick={() => setDraft(null)} className="px-4 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300">Cancel</button>
            <button onClick={save} disabled={busy} className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : policies.length === 0 ? (
        <div className="text-sm text-gray-500 py-6 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
          No attendance SMS rules yet. Click “New rule” to add one.
        </div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {policies.map((p) => {
            const c = parseConditions(p.conditions);
            const isDeparture = p.event_type === 'attendance.departure.recorded';
            return (
              <div key={p.id} className="flex items-center justify-between py-3 gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{p.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${p.is_active === 1 ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700'}`}>
                      {p.is_active === 1 ? 'Active' : 'Off'}
                    </span>
                    {isDeparture && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">Departure</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {p.channel.toUpperCase()} → {TARGETS.find((t) => t.v === p.target_role)?.label || p.target_role}
                    {!isDeparture && c.statusIn.length > 0 && <> · on <span className="capitalize">{c.statusIn.map((s) => s.replace('_', '-')).join(', ')}</span></>}
                    {' · '}{describeAudience(c, classesById)}
                    {' · cap '}{p.daily_cap}/day
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => toggleActive(p)} title={p.is_active === 1 ? 'Disable' : 'Enable'} className={`p-1.5 rounded-lg ${p.is_active === 1 ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                    <Power className="w-4 h-4" />
                  </button>
                  <button onClick={() => startEdit(p)} className="px-2.5 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-indigo-400">Edit</button>
                  <button onClick={() => del(p)} title="Delete" className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
