'use client';

/**
 * AttendanceSmsPolicies — full editor for attendance notification policies.
 * Binds to /api/admin/notification-policies (GET/POST) and
 * /api/admin/notification-policies/[id] (PATCH/DELETE).
 *
 * All policies here use event_type 'attendance.record.upserted'. The
 * attendance engine fans this out on every record change; each policy's
 * conditions.status_in decides which statuses trigger a message.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { MessageSquare, Plus, Trash2, Save, Loader2, X, CheckCircle, AlertTriangle, Power } from 'lucide-react';

const EVENT_TYPE = 'attendance.record.upserted';
const STATUSES = ['present', 'late', 'absent', 'half_day'] as const;
const TARGETS = [
  { v: 'guardian', label: 'Guardian' },
  { v: 'self', label: 'The person (self)' },
  { v: 'staff_room', label: 'Staff room' },
  { v: 'admin', label: 'Admin' },
] as const;
const CHANNELS = [{ v: 'sms', label: 'SMS' }, { v: 'email', label: 'Email' }, { v: 'push', label: 'Push' }] as const;

const TEMPLATE_VARS = '{status} {date} {first_in} {last_out} {late_minutes} {early_minutes}';

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
  target_role: string;
  channel: string;
  status_in: string[];
  template_body: string;
  daily_cap: number;
  is_active: boolean;
}

const emptyDraft: Draft = {
  name: '', target_role: 'guardian', channel: 'sms',
  status_in: ['late', 'absent'], template_body: '', daily_cap: 5000, is_active: true,
};

function parseConditions(c: any): string[] {
  try {
    const obj = typeof c === 'string' ? JSON.parse(c) : c;
    return Array.isArray(obj?.status_in) ? obj.status_in : [];
  } catch { return []; }
}

export default function AttendanceSmsPolicies() {
  const [policies, setPolicies] = useState<Policy[]>([]);
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
      setPolicies((j.policies || []).filter((p: Policy) => p.event_type === EVENT_TYPE));
    } catch { flash('error', 'Could not load SMS policies'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const startEdit = (p: Policy) => setDraft({
    id: p.id, name: p.name, target_role: p.target_role, channel: p.channel,
    status_in: parseConditions(p.conditions), template_body: p.template_body || '',
    daily_cap: p.daily_cap ?? 5000, is_active: p.is_active === 1,
  });

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) { flash('error', 'Name is required'); return; }
    if (draft.status_in.length === 0) { flash('error', 'Pick at least one status to trigger on'); return; }
    setBusy(true);
    const payload = {
      name: draft.name.trim(),
      event_type: EVENT_TYPE,
      target_role: draft.target_role,
      channel: draft.channel,
      conditions: { status_in: draft.status_in },
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
        Messages are queued to an outbox and sent in the background (never blocks a scan). Each rule fires when a learner/staff record changes to one of the chosen statuses.
      </p>

      {/* Editor */}
      {draft && (
        <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-900/10 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{draft.id ? 'Edit rule' : 'New rule'}</span>
            <button onClick={() => setDraft(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Rule name</label>
              <input className={fieldCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Late arrival → guardian" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Send to</label>
              <select className={fieldCls} value={draft.target_role} onChange={(e) => setDraft({ ...draft, target_role: e.target.value })}>
                {TARGETS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
              </select>
            </div>
          </div>

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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Channel</label>
              <select className={fieldCls} value={draft.channel} onChange={(e) => setDraft({ ...draft, channel: e.target.value })}>
                {CHANNELS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Daily cap (max messages/day)</label>
              <input type="number" min={1} className={fieldCls} value={draft.daily_cap} onChange={(e) => setDraft({ ...draft, daily_cap: parseInt(e.target.value) || 1 })} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Message template</label>
            <textarea className={`${fieldCls} resize-none`} rows={3} value={draft.template_body}
              onChange={(e) => setDraft({ ...draft, template_body: e.target.value })}
              placeholder="Leave blank to use the built-in default for each status" />
            <p className="text-[11px] text-gray-400 mt-1">Variables: <code>{TEMPLATE_VARS}</code></p>
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
            const statuses = parseConditions(p.conditions);
            return (
              <div key={p.id} className="flex items-center justify-between py-3 gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{p.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${p.is_active === 1 ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700'}`}>
                      {p.is_active === 1 ? 'Active' : 'Off'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {p.channel.toUpperCase()} → {TARGETS.find((t) => t.v === p.target_role)?.label || p.target_role}
                    {statuses.length > 0 && <> · on <span className="capitalize">{statuses.map((s) => s.replace('_', '-')).join(', ')}</span></>}
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
