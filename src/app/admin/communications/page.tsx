'use client';
import React, { useState, useMemo } from 'react';
import useSWR from 'swr';
import {
  MessageSquare, Settings as SettingsIcon, FileText, Workflow, Activity,
  Loader2, Send, RotateCcw, AlertCircle, CheckCircle2, Clock, Ban, ShieldAlert,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const fetcher = async (u: string) => {
  const r = await fetch(u, { credentials: 'same-origin' });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(b?.error || `HTTP ${r.status}`);
    (e as any).status = r.status;
    throw e;
  }
  return b;
};

type Tab = 'settings' | 'templates' | 'rules' | 'log';

export default function CommunicationsAdminPage() {
  const [tab, setTab] = useState<Tab>('settings');

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <MessageSquare className="w-6 h-6 text-indigo-500" />
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">Communications</h1>
          <p className="text-xs text-slate-400">Event-driven SMS, templates, and automation rules.</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        <TabBtn active={tab==='settings'}  onClick={() => setTab('settings')}  icon={SettingsIcon}>Settings</TabBtn>
        <TabBtn active={tab==='templates'} onClick={() => setTab('templates')} icon={FileText}>Templates</TabBtn>
        <TabBtn active={tab==='rules'}     onClick={() => setTab('rules')}     icon={Workflow}>Rules</TabBtn>
        <TabBtn active={tab==='log'}       onClick={() => setTab('log')}       icon={Activity}>Dispatch Log</TabBtn>
      </div>

      {tab === 'settings'  && <SettingsPanel />}
      {tab === 'templates' && <TemplatesPanel />}
      {tab === 'rules'     && <RulesPanel />}
      {tab === 'log'       && <DispatchLogPanel />}
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: any; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 ${
        active
          ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
          : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
      }`}>
      <Icon className="w-4 h-4" /> {children}
    </button>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function SettingsPanel() {
  const { data, mutate, isLoading, error } = useSWR<any>('/api/admin/comm/settings', fetcher);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    senderName: '', prefix: '', autoMode: false, defaultProvider: 'africas_talking',
    quietHoursStart: '', quietHoursEnd: '', retryAttempts: 1, retryDelaySecs: 60,
  });

  React.useEffect(() => {
    if (data?.settings) {
      const s = data.settings;
      setForm({
        senderName:      s.senderName ?? 'DRAIS',
        prefix:          s.prefix ?? '',
        autoMode:        !!s.autoMode,
        defaultProvider: s.defaultProvider ?? 'africas_talking',
        quietHoursStart: s.quietHoursStart ?? '',
        quietHoursEnd:   s.quietHoursEnd ?? '',
        retryAttempts:   s.retryAttempts ?? 1,
        retryDelaySecs:  s.retryDelaySecs ?? 60,
      });
    }
  }, [data]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/comm/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          prefix:          form.prefix          || null,
          quietHoursStart: form.quietHoursStart || null,
          quietHoursEnd:   form.quietHoursEnd   || null,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Failed');
      toast.success('Settings saved');
      mutate();
    } catch (e: any) { toast.error(e?.message); }
    finally { setSaving(false); }
  }

  if (isLoading) return <Skeleton lines={8} />;
  if (error) return <ErrorPanel error={error} retry={mutate} />;

  return (
    <div className="grid md:grid-cols-2 gap-5">
      <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">School Identity</h2>
        <F label="Sender Name (max 11 chars)">
          <input value={form.senderName} maxLength={11}
            onChange={e => setForm({ ...form, senderName: e.target.value })}
            className={inputCls} placeholder="DRAIS" />
        </F>
        <F label="Prefix (e.g. [ALBAYAN])">
          <input value={form.prefix}
            onChange={e => setForm({ ...form, prefix: e.target.value })}
            className={inputCls} placeholder="[ALBAYAN]" />
          <p className="text-[10px] text-slate-400 mt-1">Prepended to every outgoing SMS. Leave blank to disable.</p>
        </F>
        <F label="Default Provider">
          <select value={form.defaultProvider}
            onChange={e => setForm({ ...form, defaultProvider: e.target.value })} className={inputCls}>
            {(data?.providers ?? []).map((p: any) =>
              <option key={p.name} value={p.name}>{p.name}</option>
            )}
          </select>
        </F>
      </div>

      <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Automation</h2>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={form.autoMode}
            onChange={e => setForm({ ...form, autoMode: e.target.checked })} />
          <span className="text-sm">
            <span className="font-semibold">Auto mode</span>
            <span className="block text-[11px] text-slate-400">When on, events with auto_send rules fire immediately. When off, every message is staged for manual approval.</span>
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <F label="Quiet hours start">
            <input type="time" value={form.quietHoursStart}
              onChange={e => setForm({ ...form, quietHoursStart: e.target.value })} className={inputCls} />
          </F>
          <F label="Quiet hours end">
            <input type="time" value={form.quietHoursEnd}
              onChange={e => setForm({ ...form, quietHoursEnd: e.target.value })} className={inputCls} />
          </F>
        </div>
        <p className="text-[10px] text-slate-400">During quiet hours, auto messages are queued instead of sent.</p>
        <div className="grid grid-cols-2 gap-3">
          <F label="Retry attempts">
            <input type="number" value={form.retryAttempts} min={0} max={5}
              onChange={e => setForm({ ...form, retryAttempts: Number(e.target.value) })} className={inputCls} />
          </F>
          <F label="Retry delay (sec)">
            <input type="number" value={form.retryDelaySecs} min={10}
              onChange={e => setForm({ ...form, retryDelaySecs: Number(e.target.value) })} className={inputCls} />
          </F>
        </div>
      </div>

      <div className="md:col-span-2 flex justify-end">
        <button onClick={save} disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          Save Settings
        </button>
      </div>
    </div>
  );
}

// ─── Templates ────────────────────────────────────────────────────────────────
function TemplatesPanel() {
  const { data, mutate, isLoading, error } = useSWR<any>('/api/admin/comm/templates', fetcher);
  const [editing, setEditing] = useState<any | null>(null);
  const [draft, setDraft] = useState({ body: '', description: '' });

  function startEdit(t: any) {
    setEditing(t);
    setDraft({ body: t.body, description: t.description ?? '' });
  }
  function cancel() { setEditing(null); setDraft({ body: '', description: '' }); }

  async function saveOverride() {
    if (!editing) return;
    try {
      const res = await fetch('/api/admin/comm/templates', {
        method: editing.school_id === null ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          editing.school_id === null
            ? { event_type: editing.event_type, channel: editing.channel, language: editing.language, body: draft.body, description: draft.description }
            : { id: editing.id, body: draft.body, description: draft.description },
        ),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Failed');
      toast.success(editing.school_id === null ? 'Override created' : 'Template updated');
      cancel(); mutate();
    } catch (e: any) { toast.error(e?.message); }
  }

  if (isLoading) return <Skeleton lines={10} />;
  if (error) return <ErrorPanel error={error} retry={mutate} />;

  // Group: prefer school override; otherwise global.
  const templates: any[] = data?.templates ?? [];
  const grouped = new Map<string, { global?: any; override?: any }>();
  for (const t of templates) {
    const key = `${t.event_type}::${t.channel}::${t.language}`;
    const cur = grouped.get(key) ?? {};
    if (t.school_id === null) cur.global = t; else cur.override = t;
    grouped.set(key, cur);
  }

  return (
    <div className="space-y-3">
      {Array.from(grouped.entries()).map(([key, { global, override }]) => {
        const active = override ?? global;
        if (!active) return null;
        return (
          <div key={key} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-xs font-mono font-bold text-indigo-700 dark:text-indigo-300">{active.event_type}</code>
                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">{active.channel}</span>
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">{active.language}</span>
                  {override && (
                    <span className="text-[10px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                      School override
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-200 mt-2 whitespace-pre-wrap">{active.body}</p>
                {active.description && <p className="text-[11px] text-slate-400 mt-1">{active.description}</p>}
              </div>
              <button onClick={() => startEdit(active)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">
                {override ? 'Edit' : 'Override'}
              </button>
            </div>
          </div>
        );
      })}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={cancel} />
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-xl w-full p-6 space-y-3">
            <h3 className="text-lg font-semibold">
              {editing.school_id === null ? 'Create school override' : 'Edit template'}
            </h3>
            <p className="text-xs text-slate-500">
              <code className="font-mono">{editing.event_type}</code> · {editing.channel} · {editing.language}
            </p>
            <F label="Body">
              <textarea value={draft.body} rows={5}
                onChange={e => setDraft({ ...draft, body: e.target.value })}
                className={inputCls + ' font-mono text-xs'} />
              <p className="text-[10px] text-slate-400 mt-1">
                Placeholders: {`{{studentName}}, {{time}}, {{date}}, {{amount}}, etc. — see docs.`}
              </p>
            </F>
            <F label="Description (optional)">
              <input value={draft.description}
                onChange={e => setDraft({ ...draft, description: e.target.value })} className={inputCls} />
            </F>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={cancel} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
              <button onClick={saveOverride} className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Rules ────────────────────────────────────────────────────────────────────
function RulesPanel() {
  const { data, mutate, isLoading, error } = useSWR<any>('/api/admin/comm/rules', fetcher);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    event_type: '', channel: 'sms', audience: 'parents', auto_send: true, notes: '',
  });

  async function create() {
    if (!form.event_type) { toast.error('Pick an event'); return; }
    try {
      const res = await fetch('/api/admin/comm/rules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Failed');
      toast.success('Rule created');
      setCreating(false);
      setForm({ event_type: '', channel: 'sms', audience: 'parents', auto_send: true, notes: '' });
      mutate();
    } catch (e: any) { toast.error(e?.message); }
  }

  async function toggle(rule: any, field: 'auto_send' | 'is_active') {
    try {
      const res = await fetch('/api/admin/comm/rules', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rule.id, [field]: !rule[field] }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Failed');
      mutate();
    } catch (e: any) { toast.error(e?.message); }
  }

  async function remove(id: number) {
    if (!confirm('Delete this rule?')) return;
    try {
      const res = await fetch(`/api/admin/comm/rules?id=${id}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Failed');
      toast.success('Deleted'); mutate();
    } catch (e: any) { toast.error(e?.message); }
  }

  if (isLoading) return <Skeleton lines={6} />;
  if (error) return <ErrorPanel error={error} retry={mutate} />;

  const rules = data?.rules ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setCreating(c => !c)}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
          {creating ? 'Cancel' : '+ New Rule'}
        </button>
      </div>

      {creating && (
        <div className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/30 dark:bg-indigo-900/10 grid sm:grid-cols-5 gap-3">
          <F label="Event">
            <select value={form.event_type} onChange={e => setForm({ ...form, event_type: e.target.value })} className={inputCls}>
              <option value="">— Select —</option>
              {(data?.eventTypes ?? []).map((et: string) => <option key={et} value={et}>{et}</option>)}
            </select>
          </F>
          <F label="Channel">
            <select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })} className={inputCls}>
              <option value="sms">SMS</option>
            </select>
          </F>
          <F label="Audience">
            <select value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value })} className={inputCls}>
              <option value="parents">Parents</option>
              <option value="guardians">Guardians</option>
              <option value="class_teacher">Class teacher</option>
              <option value="headteacher">Headteacher</option>
              <option value="directors">Directors</option>
              <option value="self">Self (the subject)</option>
            </select>
          </F>
          <label className="flex items-center gap-2 mt-5">
            <input type="checkbox" checked={form.auto_send}
              onChange={e => setForm({ ...form, auto_send: e.target.checked })} />
            <span className="text-sm">Auto-send</span>
          </label>
          <button onClick={create} className="mt-5 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
            Create
          </button>
        </div>
      )}

      {rules.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10">No rules configured. Events fire but nothing is sent.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-[11px] uppercase tracking-wide text-slate-500">
              <tr className="text-left">
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">Channel</th>
                <th className="px-3 py-2">Audience</th>
                <th className="px-3 py-2">Auto-send</th>
                <th className="px-3 py-2">Active</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rules.map((r: any) => (
                <tr key={r.id} className="bg-white dark:bg-slate-900">
                  <td className="px-3 py-2"><code className="text-xs font-mono">{r.event_type}</code></td>
                  <td className="px-3 py-2 text-slate-500">{r.channel}</td>
                  <td className="px-3 py-2">{r.audience}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => toggle(r, 'auto_send')}
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                        r.auto_send ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                      }`}>
                      {r.auto_send ? 'Auto' : 'Manual'}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => toggle(r, 'is_active')}
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                        r.is_active ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                      }`}>
                      {r.is_active ? 'On' : 'Off'}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => remove(r.id)} className="text-rose-500 hover:text-rose-700 text-xs">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Dispatch Log ─────────────────────────────────────────────────────────────
function DispatchLogPanel() {
  const [filter, setFilter] = useState<string>('');
  const url = useMemo(() => {
    const sp = new URLSearchParams({ page: '1', per_page: '50' });
    if (filter) sp.set('status', filter);
    return `/api/admin/comm/dispatch-log?${sp.toString()}`;
  }, [filter]);

  const { data, mutate, isLoading, error } = useSWR<any>(url, fetcher);

  async function sendNow(id: number) {
    try {
      const res = await fetch('/api/admin/comm/dispatch-log', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId: id }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Failed');
      toast.success('Sent'); mutate();
    } catch (e: any) { toast.error(e?.message); }
  }

  if (isLoading) return <Skeleton lines={10} />;
  if (error) return <ErrorPanel error={error} retry={mutate} />;

  const counts: any[] = data?.counts ?? [];
  const countOf = (s: string) => Number(counts.find(c => c.status === s)?.n ?? 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {[
          { code: '',        label: 'All' },
          { code: 'sent',    label: 'Sent',    n: countOf('sent') },
          { code: 'queued',  label: 'Queued',  n: countOf('queued') },
          { code: 'failed',  label: 'Failed',  n: countOf('failed') },
          { code: 'skipped', label: 'Skipped', n: countOf('skipped') },
        ].map(f => (
          <button key={f.code} onClick={() => setFilter(f.code)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
              filter === f.code ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
            }`}>
            {f.label}{f.n !== undefined ? ` (${f.n})` : ''}
          </button>
        ))}
      </div>

      {(data?.data ?? []).length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10">No dispatch entries match.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-[11px] uppercase tracking-wide text-slate-500">
              <tr className="text-left">
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">Recipient</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Message</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.data.map((r: any) => (
                <tr key={r.id} className="bg-white dark:bg-slate-900 align-top">
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2"><code className="text-xs">{r.event_type}</code></td>
                  <td className="px-3 py-2">
                    <p className="font-medium">{r.recipient_name ?? r.recipient_phone ?? '—'}</p>
                    {r.recipient_phone && <p className="text-[10px] text-slate-400 font-mono">{r.recipient_phone}</p>}
                  </td>
                  <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2 text-xs text-slate-700 dark:text-slate-300 max-w-[300px]">
                    <p className="whitespace-pre-wrap break-words">{r.message_body || '—'}</p>
                    {r.error_message && <p className="text-rose-500 mt-1 text-[10px]">{r.error_message}</p>}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-slate-500">{r.source}</td>
                  <td className="px-3 py-2 text-right">
                    {r.status === 'queued' && (
                      <button onClick={() => sendNow(r.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded border border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30">
                        <Send className="w-3 h-3" /> Send now
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: string; Icon: any }> = {
    sent:    { tone: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300', Icon: CheckCircle2 },
    queued:  { tone: 'bg-amber-100   dark:bg-amber-900/40   text-amber-700   dark:text-amber-300',   Icon: Clock },
    failed:  { tone: 'bg-rose-100    dark:bg-rose-900/40    text-rose-700    dark:text-rose-300',    Icon: AlertCircle },
    skipped: { tone: 'bg-slate-100   dark:bg-slate-800       text-slate-500',                         Icon: Ban },
  };
  const m = map[status] ?? map.skipped;
  const Icon = m.Icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded ${m.tone}`}>
      <Icon className="w-3 h-3" /> {status}
    </span>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const inputCls = "w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800";

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Skeleton({ lines = 5 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
      ))}
    </div>
  );
}

function ErrorPanel({ error, retry }: { error: any; retry: () => void }) {
  const status = error?.status as number | undefined;
  const isAuth = status === 401 || status === 403;
  return (
    <div className="rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-950/30 p-4 text-sm text-rose-700 flex items-start gap-3">
      {isAuth ? <ShieldAlert className="w-4 h-4 mt-0.5" /> : <AlertCircle className="w-4 h-4 mt-0.5" />}
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
