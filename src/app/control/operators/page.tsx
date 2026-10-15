'use client';

/**
 * Control Center → Operators & access.
 *
 * Who can use the Control Center and exactly what each person may open and do:
 * a per-area permission matrix (view / create / edit / delete / specific
 * actions), ready-made presets, a school scope, an access expiry, suspension,
 * password reset, ending sessions, and each operator's activity.
 *
 * The API enforces everything shown here (lib/control/operators + guard); this
 * screen only reflects it. Changes take effect on the operator's next click.
 */
import React, { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  UserPlus, Loader2, ShieldCheck, ShieldAlert, Search, X, Check, KeyRound, LogOut, Trash2, PauseCircle,
  PlayCircle, Clock, School, Eye, History, Crown, Lock, Sparkles, Copy, RefreshCw, ChevronDown,
} from 'lucide-react';
import { useControlAccess } from '@/components/control/ControlAccess';

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then((r) => r.json());

type Area = { key: string; label: string; group: string; description: string; pages: string[]; actions: Record<string, string> };
type Op = {
  id: number; name: string; email: string; role: string; status: string;
  permissions: string[] | null; effective_permissions: string[]; school_scope: number[] | null;
  access_expires_at: string | null; notes: string | null; created_at: string | null; created_by_name: string | null;
  last_login: string | null; last_activity: string | null; active_sessions: number; totp_enabled: boolean; expired: boolean;
};

const SUPER = 'XHENVOLT_SUPER_ADMIN';
const ACTION_LABEL: Record<string, string> = {
  view: 'View', create: 'Add', edit: 'Edit', delete: 'Delete', hard_delete: 'Permanent delete', export: 'Export',
  impersonate: 'Sign in as school', test: 'Test', send: 'Send', limits: 'Set limits', activate: 'Activate',
  manage: 'Manage', configure: 'Configure', download: 'Download',
};

const card = 'bg-slate-900 border border-slate-800 rounded-xl';
const input = 'px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-indigo-500';
const btn = 'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50';

function ago(iso: string | null): string {
  if (!iso) return 'never';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} days ago`;
  return new Date(iso).toLocaleDateString();
}
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
const genPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const a = new Uint32Array(16); crypto.getRandomValues(a);
  return Array.from(a, (x) => chars[x % chars.length]).join('');
};

export default function ControlOperators() {
  const { data, mutate, isLoading } = useSWR<any>('/api/control-center/users', fetcher);
  const [selected, setSelected] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');
  const rows: Op[] = data?.rows || [];
  const areas: Area[] = data?.catalog?.areas || [];
  const me = data?.me;
  const op = rows.find((r) => r.id === selected) || null;

  const filtered = rows.filter((r) => !q || `${r.name} ${r.email}`.toLowerCase().includes(q.toLowerCase()));
  const totalAreas = areas.length;

  if (isLoading) return <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>;
  if (data?.error) return <div className={`${card} p-6 text-sm text-rose-300`}>{data.error}</div>;

  return (
    // Desktop: exactly one screen tall (header 3.5rem + main padding 3rem); the operator list
    // and the editor scroll inside their own panels instead of the whole page growing.
    <div className="flex flex-col gap-4 lg:h-[calc(100dvh-6.5rem)]">
      <div className="flex flex-wrap items-end justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Operators & access</h1>
          <p className="text-sm text-slate-400 mt-1">Decide exactly what each person can see, add, change and remove in the Control Center.</p>
        </div>
        {me?.can?.create && (
          <button onClick={() => { setCreating(true); setSelected(null); }} className={`${btn} bg-indigo-600 hover:bg-indigo-500 text-white`}>
            <UserPlus className="w-4 h-4" /> Add operator
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
        <Stat label="Operators" value={rows.length} />
        <Stat label="Super admins" value={rows.filter((r) => r.role === SUPER).length} />
        <Stat label="Suspended or expired" value={rows.filter((r) => r.status !== 'active' || r.expired).length} tone={rows.some((r) => r.status !== 'active' || r.expired) ? 'amber' : undefined} />
        <Stat label="Without 2FA" value={rows.filter((r) => !r.totp_enabled).length} tone={rows.some((r) => !r.totp_enabled) ? 'amber' : undefined} />
      </div>

      {creating && <div className="shrink-0 lg:max-h-[55%] overflow-y-auto"><CreateOperator areas={areas} presets={data?.catalog?.presets} me={me} onClose={() => setCreating(false)} onCreated={async (id) => { await mutate(); setCreating(false); setSelected(id); }} /></div>}

      <div className="grid lg:grid-cols-[300px_minmax(0,1fr)] gap-4 lg:flex-1 lg:min-h-0">
        <div className={`${card} overflow-hidden flex flex-col lg:min-h-0`}>
          <div className="p-2 border-b border-slate-800 relative shrink-0">
            <Search className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an operator" className={`${input} w-full pl-8`} />
          </div>
          <ul className="divide-y divide-slate-800/70 max-h-[40vh] lg:max-h-none lg:flex-1 overflow-y-auto">
            {filtered.map((r) => {
              const areasOpen = areas.filter((a) => r.effective_permissions.includes(`${a.key}.view`)).length;
              return (
                <li key={r.id}>
                  <button onClick={() => { setSelected(r.id); setCreating(false); }}
                    className={`w-full text-left px-3 py-3 flex gap-3 items-start hover:bg-slate-800/50 ${selected === r.id ? 'bg-indigo-500/10' : ''}`}>
                    <span className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${r.role === SUPER ? 'bg-amber-500/20 text-amber-300' : 'bg-indigo-500/20 text-indigo-300'}`}>{initials(r.name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm text-slate-100 truncate">{r.name}{r.id === me?.id && <span className="text-[10px] text-slate-500">(you)</span>}</span>
                      <span className="block text-xs text-slate-500 truncate">{r.email}</span>
                      <span className="flex flex-wrap gap-1 mt-1.5">
                        {r.role === SUPER ? <Badge tone="amber"><Crown className="w-3 h-3" /> Full access</Badge> : <Badge>{areasOpen}/{totalAreas} areas</Badge>}
                        {r.status !== 'active' && <Badge tone="rose">Suspended</Badge>}
                        {r.expired && <Badge tone="rose">Expired</Badge>}
                        {!r.expired && r.access_expires_at && <Badge tone="amber"><Clock className="w-3 h-3" /> until {new Date(r.access_expires_at).toLocaleDateString()}</Badge>}
                        {r.school_scope && <Badge tone="sky"><School className="w-3 h-3" /> {r.school_scope.length} school{r.school_scope.length === 1 ? '' : 's'}</Badge>}
                        {r.active_sessions > 0 && <Badge tone="emerald">online</Badge>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="lg:min-h-0">
          {op ? (
            <OperatorEditor key={op.id} op={op} areas={areas} catalog={data.catalog} schools={data.schools || []} me={me} onChanged={() => mutate()} onRemoved={() => { setSelected(null); mutate(); }} />
          ) : (
            <div className={`${card} p-10 text-center`}>
              <ShieldCheck className="w-10 h-10 mx-auto text-indigo-400/60" />
              <p className="mt-3 text-sm text-slate-300">Choose an operator to see and change what they can do.</p>
              <p className="mt-1 text-xs text-slate-500">Every change is recorded in the audit log and applies on their next click.</p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'amber' }) {
  return (
    <div className={`${card} px-3 py-2.5`}>
      <div className={`text-lg font-bold ${tone === 'amber' ? 'text-amber-300' : 'text-slate-100'}`}>{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: 'amber' | 'rose' | 'sky' | 'emerald' }) {
  const c = tone === 'amber' ? 'bg-amber-500/15 text-amber-300' : tone === 'rose' ? 'bg-rose-500/15 text-rose-300'
    : tone === 'sky' ? 'bg-sky-500/15 text-sky-300' : tone === 'emerald' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-400';
  return <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${c}`}>{children}</span>;
}

async function send(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Failed');
  return j;
}

/* ───────────────────────────── editor ───────────────────────────── */

function OperatorEditor({ op, areas, catalog, schools, me, onChanged, onRemoved }: {
  op: Op; areas: Area[]; catalog: any; schools: any[]; me: any; onChanged: () => void; onRemoved: () => void;
}) {
  const [tab, setTab] = useState<'access' | 'schools' | 'account' | 'activity'>('access');
  const self = op.id === me?.id;
  const iAmSuper = me?.role === SUPER;
  const locked = self || !me?.can?.edit || (op.role === SUPER && !iAmSuper);
  const lockReason = self ? 'This is you — another super admin must change your access.'
    : !me?.can?.edit ? 'You can view operators but not change them.'
      : op.role === SUPER && !iAmSuper ? 'Only a super admin can change a super admin.' : null;

  return (
    <div className={`${card} overflow-hidden flex flex-col lg:h-full`}>
      <div className="p-4 border-b border-slate-800 flex flex-wrap items-start justify-between gap-3 shrink-0">
        <div className="flex gap-3 items-center min-w-0">
          <span className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${op.role === SUPER ? 'bg-amber-500/20 text-amber-300' : 'bg-indigo-500/20 text-indigo-300'}`}>{initials(op.name)}</span>
          <div className="min-w-0">
            <div className="text-base font-semibold text-slate-100 truncate">{op.name}</div>
            <div className="text-xs text-slate-500 truncate">{op.email}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Last active {ago(op.last_activity || op.last_login)} · {op.active_sessions} open session{op.active_sessions === 1 ? '' : 's'} · 2FA {op.totp_enabled ? 'on' : 'off'}
              {op.created_by_name && <> · added by {op.created_by_name}</>}
            </div>
          </div>
        </div>
        <div className="flex gap-1 bg-slate-950 rounded-lg p-1 text-xs">
          {([['access', 'Access', ShieldCheck], ['schools', 'Schools', School], ['account', 'Account', KeyRound], ['activity', 'Activity', History]] as const).map(([k, l, I]) => (
            <button key={k} onClick={() => setTab(k)} className={`px-2.5 py-1.5 rounded-md flex items-center gap-1 ${tab === k ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}><I className="w-3.5 h-3.5" />{l}</button>
          ))}
        </div>
      </div>
      {lockReason && <div className="shrink-0 px-4 py-2 text-xs bg-slate-800/50 text-slate-400 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> {lockReason}</div>}
      <div className="p-4 lg:flex-1 lg:min-h-0 overflow-y-auto">
        {tab === 'access' && <AccessTab op={op} areas={areas} catalog={catalog} me={me} locked={locked} onSaved={onChanged} />}
        {tab === 'schools' && <SchoolsTab op={op} schools={schools} me={me} locked={locked} platformWide={catalog?.platformWideAreas || []} areas={areas} onSaved={onChanged} />}
        {tab === 'account' && <AccountTab op={op} me={me} locked={locked} self={self} onSaved={onChanged} onRemoved={onRemoved} />}
        {tab === 'activity' && <ActivityTab op={op} />}
      </div>
    </div>
  );
}

/* ─────────── access matrix ─────────── */

function AccessTab({ op, areas, catalog, me, locked, onSaved }: { op: Op; areas: Area[]; catalog: any; me: any; locked: boolean; onSaved: () => void }) {
  const iAmSuper = me?.role === SUPER;
  const mine = new Set<string>(me?.permissions || []);
  const superOnly: string[] = catalog?.superAdminOnly || [];
  const platformWide: string[] = catalog?.platformWideAreas || [];
  const presets: Record<string, { label: string; description: string; permissions: string[] }> = catalog?.presets || {};
  // Stored list plus what it implies; for a school-limited operator this keeps platform-wide
  // permissions that are dormant (not effective) so saving does not silently drop them.
  const savedList = useMemo(() => [...new Set([...(op.permissions ?? []), ...op.effective_permissions])], [op.permissions, op.effective_permissions]);
  const saved = useMemo(() => new Set(savedList), [savedList]);
  const [perms, setPerms] = useState<Set<string>>(new Set(savedList));
  const [fullAccess, setFullAccess] = useState(op.role === SUPER);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setPerms(new Set(savedList)); setFullAccess(op.role === SUPER); }, [op, savedList]);

  const grantable = (p: string) => !locked && !superOnly.includes(p) && (iAmSuper || mine.has(p));
  const toggle = (p: string) => {
    if (!grantable(p) && !perms.has(p)) return;
    if (locked) return;
    const next = new Set(perms);
    const [area, action] = p.split('.');
    if (next.has(p)) {
      next.delete(p);
      // Removing "view" removes everything in the area: nothing else works without seeing it.
      if (action === 'view') for (const x of [...next]) if (x.startsWith(`${area}.`)) next.delete(x);
    } else {
      next.add(p);
      next.add(`${area}.view`); // any action implies seeing the area
    }
    setPerms(next);
  };
  const setArea = (a: Area, on: boolean) => {
    setPerms((cur) => {
      const next = new Set(cur);
      for (const act of Object.keys(a.actions)) {
        const p = `${a.key}.${act}`;
        if (on ? grantable(p) : true) on ? next.add(p) : next.delete(p);
      }
      return next;
    });
  };
  const applyPreset = (k: string) => setPerms(new Set(presets[k].permissions.filter((p) => grantable(p) || saved.has(p))));

  const added = [...perms].filter((p) => !saved.has(p));
  const removed = [...saved].filter((p) => !perms.has(p));
  const roleChanged = fullAccess !== (op.role === SUPER);
  const dirty = roleChanged || (!fullAccess && (added.length > 0 || removed.length > 0));

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const body: any = fullAccess ? { role: SUPER } : { role: op.role === SUPER ? 'XHENVOLT_OPERATOR' : op.role, permissions: [...perms] };
      await send(`/api/control-center/users/${op.id}`, 'PATCH', body);
      setMsg({ ok: true, text: 'Saved — applies on their next click.' }); onSaved();
    } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };

  const groups = [...new Set(areas.map((a) => a.group))];
  // Groups start collapsed (one line each, with a count) so the page stays short; a filter opens them.
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (g: string) => setOpenGroups((o) => { const n = new Set(o); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const allOpen = groups.every((g) => openGroups.has(g));
  const visibleAreas = areas.filter((a) => !filter || `${a.label} ${a.description} ${Object.values(a.actions).join(' ')}`.toLowerCase().includes(filter.toLowerCase()));
  const menuPreview = areas.filter((a) => fullAccess || perms.has(`${a.key}.view`));

  return (
    <div className="space-y-4">
      {iAmSuper && (
        <div className="grid sm:grid-cols-2 gap-2">
          <button disabled={locked} onClick={() => setFullAccess(false)} className={`text-left rounded-xl border p-3 ${!fullAccess ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-800 hover:border-slate-700'}`}>
            <div className="text-sm font-semibold text-slate-100 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-indigo-400" /> Chosen access</div>
            <div className="text-xs text-slate-400 mt-0.5">Only the areas and actions ticked below.</div>
          </button>
          <button disabled={locked} onClick={() => setFullAccess(true)} className={`text-left rounded-xl border p-3 ${fullAccess ? 'border-amber-500 bg-amber-500/10' : 'border-slate-800 hover:border-slate-700'}`}>
            <div className="text-sm font-semibold text-slate-100 flex items-center gap-1.5"><Crown className="w-4 h-4 text-amber-400" /> Super admin</div>
            <div className="text-xs text-slate-400 mt-0.5">Everything, including permanent deletes and managing other admins. Cannot be restricted.</div>
          </button>
        </div>
      )}

      {fullAccess ? (
        <div className="rounded-xl border border-amber-700/50 bg-amber-500/10 p-4 text-sm text-amber-200 flex gap-2">
          <ShieldAlert className="w-5 h-5 shrink-0" /> {op.name} {op.role === SUPER ? 'has' : 'will have'} full access to every area of the Control Center.
        </div>
      ) : (
        <>
          <div>
            <div className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Start from a preset</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(presets).map(([k, p]) => (
                <button key={k} disabled={locked} onClick={() => applyPreset(k)} title={p.description} className={`${btn} bg-slate-800 hover:bg-slate-700 text-slate-200`}>{p.label}</button>
              ))}
              <button disabled={locked} onClick={() => setPerms(new Set())} className={`${btn} bg-slate-800 hover:bg-rose-600/30 text-rose-300`}>Remove everything</button>
              <button disabled={locked || !dirty} onClick={() => setPerms(new Set(saved))} className={`${btn} text-slate-400 hover:text-slate-200`}><RefreshCw className="w-3.5 h-3.5" /> Undo changes</button>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter areas (e.g. sms, delete, billing)" className={`${input} w-full pl-8`} />
            </div>
            <button onClick={() => setOpenGroups(allOpen ? new Set() : new Set(groups))} className={`${btn} bg-slate-800 hover:bg-slate-700 text-slate-300 shrink-0`}>
              {allOpen ? 'Collapse all' : 'Expand all'}
            </button>
          </div>

          {op.school_scope && (
            <div className="text-xs rounded-lg bg-sky-500/10 text-sky-300 px-3 py-2">
              Limited to {op.school_scope.length} school{op.school_scope.length === 1 ? '' : 's'}: platform-wide areas (marked “all schools”) stay closed whatever is ticked, because their figures cover every school.
            </div>
          )}

          <div className="space-y-4">
            {groups.map((g) => {
              const list = visibleAreas.filter((a) => a.group === g);
              if (!list.length) return null;
              const expanded = !!filter || openGroups.has(g);
              const groupPerms = list.flatMap((a) => Object.keys(a.actions).map((x) => `${a.key}.${x}`));
              const onCount = groupPerms.filter((p) => perms.has(p)).length;
              const changed = groupPerms.some((p) => perms.has(p) !== saved.has(p));
              return (
                <div key={g} className="rounded-xl border border-slate-800 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-950/40">
                    <button onClick={() => toggleGroup(g)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                      <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${expanded ? '' : '-rotate-90'}`} />
                      <span className="text-sm font-semibold text-slate-200">{g}</span>
                      <span className="text-[11px] text-slate-500 truncate">{list.map((a) => a.label).join(' · ')}</span>
                    </button>
                    {changed && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Unsaved changes in this group" />}
                    <span className={`text-[11px] px-1.5 py-0.5 rounded shrink-0 ${onCount ? 'bg-indigo-500/15 text-indigo-300' : 'bg-slate-800 text-slate-500'}`}>{onCount}/{groupPerms.length}</span>
                    {!locked && (
                      <>
                        <button onClick={() => list.forEach((a) => setArea(a, true))} className="text-[10px] px-1.5 py-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 shrink-0">All</button>
                        <button onClick={() => list.forEach((a) => setArea(a, false))} disabled={!onCount} className="text-[10px] px-1.5 py-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-30 shrink-0">None</button>
                      </>
                    )}
                  </div>
                  {expanded && <div className="divide-y divide-slate-800/70 border-t border-slate-800">
                    {list.map((a) => {
                      const acts = Object.keys(a.actions);
                      const on = acts.filter((x) => perms.has(`${a.key}.${x}`)).length;
                      const scopedOut = !!op.school_scope && platformWide.includes(a.key);
                      return (
                        <div key={a.key} className={`px-3 py-2.5 flex flex-col md:flex-row md:items-center gap-2 ${scopedOut ? 'opacity-50' : ''}`}>
                          <div className="md:w-56 shrink-0 min-w-0">
                            <div className="text-sm text-slate-100 flex items-center gap-1.5">
                              {a.label}
                              {platformWide.includes(a.key) && <span className="text-[9px] px-1 rounded bg-slate-800 text-slate-500">all schools</span>}
                            </div>
                            <div className="text-[11px] text-slate-500 leading-snug">{a.description}</div>
                          </div>
                          <div className="flex flex-wrap gap-1.5 flex-1">
                            {acts.map((act) => {
                              const p = `${a.key}.${act}`;
                              const has = perms.has(p);
                              const was = saved.has(p);
                              const isSuperOnly = superOnly.includes(p);
                              const cannot = !has && !grantable(p);
                              return (
                                <button key={act} onClick={() => toggle(p)} disabled={locked || cannot}
                                  title={isSuperOnly ? 'Super admins only' : cannot ? 'You cannot grant a permission you do not hold' : a.actions[act]}
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border transition ${has
                                    ? 'bg-indigo-500/20 border-indigo-500/60 text-indigo-200'
                                    : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600'} ${has !== was ? 'ring-1 ring-offset-0 ' + (has ? 'ring-emerald-400' : 'ring-rose-400') : ''} disabled:cursor-not-allowed`}>
                                  {isSuperOnly ? <Crown className="w-3 h-3 text-amber-400" /> : has ? <Check className="w-3 h-3" /> : act === 'view' ? <Eye className="w-3 h-3" /> : null}
                                  {ACTION_LABEL[act] || act}
                                </button>
                              );
                            })}
                          </div>
                          {!locked && (
                            <div className="flex gap-1 shrink-0">
                              <button onClick={() => setArea(a, true)} className="text-[10px] px-1.5 py-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800">All</button>
                              <button onClick={() => setArea(a, false)} disabled={!on} className="text-[10px] px-1.5 py-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-30">None</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>}
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
        <div className="text-xs font-semibold text-slate-400 flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> Their menu will show</div>
        <div className="flex flex-wrap gap-1 mt-2">
          {menuPreview.length ? menuPreview.map((a) => (
            <span key={a.key} className={`text-[11px] px-2 py-0.5 rounded ${op.school_scope && !fullAccess && platformWide.includes(a.key) ? 'bg-slate-800 text-slate-600 line-through' : 'bg-slate-800 text-slate-300'}`}>{a.label}</span>
          )) : <span className="text-xs text-slate-500">Nothing: they can sign in but only manage their own sessions and 2FA.</span>}
        </div>
      </div>

      {!locked && (
        <div className="sticky bottom-16 lg:bottom-2 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-900/95 backdrop-blur px-3 py-2.5">
          <div className="text-xs text-slate-400">
            {!dirty ? 'No unsaved changes'
              : roleChanged ? (fullAccess ? 'Will become a super admin' : 'Will lose super admin and keep only the ticked access')
                : <><span className="text-emerald-300">+{added.length} granted</span> · <span className="text-rose-300">−{removed.length} removed</span></>}
            {msg && <span className={`ml-2 ${msg.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{msg.text}</span>}
          </div>
          <button onClick={save} disabled={!dirty || busy} className={`${btn} bg-indigo-600 hover:bg-indigo-500 text-white`}>
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save access
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────── school scope ─────────── */

function SchoolsTab({ op, schools, me, locked, platformWide, areas, onSaved }: { op: Op; schools: any[]; me: any; locked: boolean; platformWide: string[]; areas: Area[]; onSaved: () => void }) {
  const [limited, setLimited] = useState(!!op.school_scope);
  const [ids, setIds] = useState<Set<number>>(new Set(op.school_scope || []));
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const myScope: number[] | null = me?.school_scope ?? null;
  const pickable = schools.filter((s) => !myScope || myScope.includes(Number(s.id)));
  const shown = pickable.filter((s) => !q || `${s.name} ${s.short_code || ''}`.toLowerCase().includes(q.toLowerCase()));

  if (op.role === SUPER) return <p className="text-sm text-slate-400">Super admins always see every school.</p>;

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      await send(`/api/control-center/users/${op.id}`, 'PATCH', { school_scope: limited ? [...ids] : null });
      setMsg({ ok: true, text: 'Saved.' }); onSaved();
    } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };
  const lost = areas.filter((a) => platformWide.includes(a.key) && op.effective_permissions.includes(`${a.key}.view`));

  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-2">
        <button disabled={locked || !!myScope} onClick={() => setLimited(false)} className={`text-left rounded-xl border p-3 ${!limited ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-800'}`}>
          <div className="text-sm font-semibold text-slate-100">Every school</div>
          <div className="text-xs text-slate-400">Sees all schools (subject to their permissions).</div>
        </button>
        <button disabled={locked} onClick={() => setLimited(true)} className={`text-left rounded-xl border p-3 ${limited ? 'border-sky-500 bg-sky-500/10' : 'border-slate-800'}`}>
          <div className="text-sm font-semibold text-slate-100">Only chosen schools</div>
          <div className="text-xs text-slate-400">Other schools do not exist for them — not in lists, not by link.</div>
        </button>
      </div>
      {limited && (
        <>
          {!op.school_scope && lost.length > 0 && (
            <div className="text-xs rounded-lg bg-amber-500/10 text-amber-200 px-3 py-2">
              Limiting to chosen schools also closes these platform-wide areas for them: {lost.map((a) => a.label).join(', ')}.
            </div>
          )}
          <div className="flex gap-2 items-center">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a school" className={`${input} flex-1`} />
            <span className="text-xs text-slate-400 shrink-0">{ids.size} chosen</span>
          </div>
          <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-800 divide-y divide-slate-800/70">
            {shown.map((s) => {
              const id = Number(s.id); const on = ids.has(id);
              return (
                <label key={id} className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-slate-800/40">
                  <input type="checkbox" disabled={locked} checked={on} onChange={() => { const n = new Set(ids); on ? n.delete(id) : n.add(id); setIds(n); }} className="accent-indigo-500" />
                  <span className="text-slate-200 flex-1 truncate">{s.name}</span>
                  {s.short_code && <span className="text-[11px] text-slate-500">{s.short_code}</span>}
                </label>
              );
            })}
          </div>
        </>
      )}
      {!locked && (
        <div className="flex items-center gap-2">
          <button onClick={save} disabled={busy || (limited && !ids.size)} className={`${btn} bg-indigo-600 hover:bg-indigo-500 text-white`}>{busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save schools</button>
          {limited && !ids.size && <span className="text-xs text-slate-500">Choose at least one school.</span>}
          {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{msg.text}</span>}
        </div>
      )}
    </div>
  );
}

/* ─────────── account ─────────── */

function AccountTab({ op, me, locked, self, onSaved, onRemoved }: { op: Op; me: any; locked: boolean; self: boolean; onSaved: () => void; onRemoved: () => void }) {
  const [name, setName] = useState(op.name);
  const [notes, setNotes] = useState(op.notes || '');
  const [expiry, setExpiry] = useState(op.access_expires_at ? op.access_expires_at.slice(0, 16) : '');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const canEditOthers = !locked;
  const canEditDetails = me?.can?.edit && !(op.role === SUPER && me?.role !== SUPER);

  const run = async (key: string, body: any, ok: string) => {
    setBusy(key); setMsg(null);
    try { await send(`/api/control-center/users/${op.id}`, 'PATCH', body); setMsg({ ok: true, text: ok }); onSaved(); }
    catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(null); }
  };
  const remove = async () => {
    if (prompt(`Type ${op.email} to remove this operator permanently.`) !== op.email) return;
    setBusy('remove');
    try { await send(`/api/control-center/users/${op.id}`, 'DELETE'); onRemoved(); }
    catch (e: any) { setMsg({ ok: false, text: e.message }); setBusy(null); }
  };

  return (
    <div className="space-y-5">
      {msg && <div className={`text-xs rounded-lg px-3 py-2 ${msg.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>{msg.text}</div>}

      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-400">Details</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEditDetails} className={input} placeholder="Name" />
          <input value={op.email} disabled className={`${input} opacity-60`} />
        </div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEditDetails} rows={2} className={`${input} w-full`} placeholder="Notes (why they have access, who approved it…)" />
        {canEditDetails && <button onClick={() => run('details', { name, notes }, 'Details saved.')} disabled={busy != null} className={`${btn} bg-slate-800 hover:bg-slate-700 text-slate-200`}>{busy === 'details' && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save details</button>}
      </section>

      {op.role !== SUPER && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-slate-400 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Temporary access</h3>
          <p className="text-xs text-slate-500">Access ends automatically at this time — useful for contractors or a helper covering a few days.</p>
          <div className="flex flex-wrap gap-2 items-center">
            <input type="datetime-local" value={expiry} onChange={(e) => setExpiry(e.target.value)} disabled={!canEditOthers} className={input} />
            {[1, 7, 30].map((d) => (
              <button key={d} disabled={!canEditOthers} onClick={() => { const t = new Date(Date.now() + d * 86400e3); setExpiry(new Date(t.getTime() - t.getTimezoneOffset() * 60e3).toISOString().slice(0, 16)); }} className={`${btn} bg-slate-800 text-slate-300`}>{d} day{d > 1 ? 's' : ''}</button>
            ))}
            {canEditOthers && <>
              <button onClick={() => run('expiry', { access_expires_at: expiry ? new Date(expiry).toISOString() : null }, expiry ? 'Expiry set.' : 'Access no longer expires.')} disabled={busy != null} className={`${btn} bg-indigo-600 hover:bg-indigo-500 text-white`}>Save</button>
              {op.access_expires_at && <button onClick={() => { setExpiry(''); run('expiry', { access_expires_at: null }, 'Access no longer expires.'); }} className={`${btn} text-slate-400`}>Never expire</button>}
            </>}
          </div>
        </section>
      )}

      {canEditOthers && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-slate-400 flex items-center gap-1.5"><KeyRound className="w-3.5 h-3.5" /> Password</h3>
          <div className="flex flex-wrap gap-2">
            <input value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password (min 10)" className={`${input} flex-1 min-w-[200px] font-mono`} />
            <button onClick={() => setPw(genPassword())} className={`${btn} bg-slate-800 text-slate-300`}><Sparkles className="w-3.5 h-3.5" /> Generate</button>
            {pw && <button onClick={() => navigator.clipboard?.writeText(pw)} className={`${btn} bg-slate-800 text-slate-300`}><Copy className="w-3.5 h-3.5" /> Copy</button>}
            <button onClick={() => run('pw', { password: pw }, 'Password changed and their sessions ended — give them the new password.')} disabled={pw.length < 10 || busy != null} className={`${btn} bg-indigo-600 hover:bg-indigo-500 text-white`}>Set password</button>
          </div>
        </section>
      )}

      {canEditOthers && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-slate-400">Status</h3>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => run('sessions', { revoke_sessions: true }, 'Signed out everywhere.')} disabled={busy != null || !op.active_sessions} className={`${btn} bg-slate-800 hover:bg-slate-700 text-slate-200`}><LogOut className="w-3.5 h-3.5" /> Sign out everywhere ({op.active_sessions})</button>
            {op.status === 'active'
              ? <button onClick={() => confirm(`Suspend ${op.name}? They are signed out immediately and cannot sign in until reactivated.`) && run('status', { status: 'suspended' }, 'Suspended and signed out.')} disabled={busy != null} className={`${btn} bg-amber-600/20 hover:bg-amber-600/30 text-amber-300`}><PauseCircle className="w-3.5 h-3.5" /> Suspend</button>
              : <button onClick={() => run('status', { status: 'active' }, 'Reactivated.')} disabled={busy != null} className={`${btn} bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300`}><PlayCircle className="w-3.5 h-3.5" /> Reactivate</button>}
            {me?.can?.delete && <button onClick={remove} disabled={busy != null} className={`${btn} bg-rose-600/20 hover:bg-rose-600/30 text-rose-300`}><Trash2 className="w-3.5 h-3.5" /> Remove operator</button>}
          </div>
        </section>
      )}
      {self && <p className="text-xs text-slate-500">Manage your own sessions and 2FA from <a className="text-indigo-300 hover:underline" href="/control/sessions">Sessions</a>.</p>}
    </div>
  );
}

/* ─────────── activity ─────────── */

function ActivityTab({ op }: { op: Op }) {
  const { data, isLoading } = useSWR<any>(`/api/control-center/users/${op.id}`, fetcher);
  if (isLoading) return <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />;
  const parse = (m: any) => { try { return typeof m === 'string' ? JSON.parse(m) : m; } catch { return null; } };
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div>
        <h3 className="text-xs font-semibold text-slate-400 mb-2">What they did (latest 50)</h3>
        <ul className="space-y-1 max-h-96 overflow-y-auto">
          {(data?.activity || []).map((a: any) => (
            <li key={a.id} className="text-xs flex justify-between gap-2 rounded-lg bg-slate-950/50 px-2.5 py-1.5">
              <span className="text-slate-300 truncate">{String(a.action).replace(/_/g, ' ')} {a.resource && <span className="text-slate-500">· {a.resource}</span>}</span>
              <span className="text-slate-500 shrink-0">{ago(a.created_at)}</span>
            </li>
          ))}
          {!data?.activity?.length && <li className="text-xs text-slate-500">No activity recorded.</li>}
        </ul>
      </div>
      <div>
        <h3 className="text-xs font-semibold text-slate-400 mb-2">Changes to their access</h3>
        <ul className="space-y-1.5 max-h-96 overflow-y-auto">
          {(data?.changes || []).map((c: any) => {
            const m = parse(c.metadata) || {};
            const perm = m.permissions;
            return (
              <li key={c.id} className="text-xs rounded-lg bg-slate-950/50 px-2.5 py-1.5">
                <div className="flex justify-between gap-2"><span className="text-slate-300">{String(c.action).replace(/_/g, ' ')} by {c.by_name || 'system'}</span><span className="text-slate-500">{ago(c.created_at)}</span></div>
                {perm && (perm.added?.length || perm.removed?.length) ? (
                  <div className="mt-1 text-[11px]">
                    {perm.added?.length > 0 && <div className="text-emerald-300">+ {perm.added.join(', ')}</div>}
                    {perm.removed?.length > 0 && <div className="text-rose-300">− {perm.removed.join(', ')}</div>}
                  </div>
                ) : (
                  <div className="mt-0.5 text-[11px] text-slate-500 truncate">{Object.keys(m).filter((k) => k !== 'permissions').join(', ')}</div>
                )}
              </li>
            );
          })}
          {!data?.changes?.length && <li className="text-xs text-slate-500">No access changes recorded yet.</li>}
        </ul>
      </div>
    </div>
  );
}

/* ─────────── create ─────────── */

function CreateOperator({ areas, presets, me, onClose, onCreated }: { areas: Area[]; presets: any; me: any; onClose: () => void; onCreated: (id: number) => void }) {
  const iAmSuper = me?.role === SUPER;
  const mine = new Set<string>(me?.permissions || []);
  const [form, setForm] = useState({ name: '', email: '', password: genPassword(), preset: 'viewer', full: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const create = async () => {
    setBusy(true); setErr(null);
    try {
      const perms = (presets?.[form.preset]?.permissions || []).filter((p: string) => iAmSuper || mine.has(p));
      const j = await send('/api/control-center/users', 'POST', {
        name: form.name, email: form.email, password: form.password,
        role: form.full ? SUPER : 'XHENVOLT_OPERATOR', permissions: form.full ? undefined : perms,
      });
      onCreated(j.id);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  void areas;
  return (
    <div className={`${card} p-4 space-y-3`}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5"><UserPlus className="w-4 h-4 text-indigo-400" /> Add operator</h2>
        <button onClick={onClose} className="p-1 rounded hover:bg-slate-800"><X className="w-4 h-4 text-slate-400" /></button>
      </div>
      <div className="grid sm:grid-cols-3 gap-2">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" className={input} />
        <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className={input} />
        <div className="flex gap-1">
          <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={`${input} flex-1 font-mono text-xs`} />
          <button onClick={() => navigator.clipboard?.writeText(form.password)} title="Copy password" className={`${btn} bg-slate-800 text-slate-300`}><Copy className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      <div>
        <div className="text-xs text-slate-400 mb-1.5">Starting access — fine-tune it right after creating:</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {Object.entries(presets || {}).map(([k, p]: any) => (
            <button key={k} onClick={() => setForm({ ...form, preset: k, full: false })} className={`text-left rounded-xl border p-2.5 ${!form.full && form.preset === k ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-800 hover:border-slate-700'}`}>
              <div className="text-xs font-semibold text-slate-100">{p.label}</div>
              <div className="text-[11px] text-slate-500 leading-snug">{p.description}</div>
            </button>
          ))}
          {iAmSuper && (
            <button onClick={() => setForm({ ...form, full: true })} className={`text-left rounded-xl border p-2.5 ${form.full ? 'border-amber-500 bg-amber-500/10' : 'border-slate-800 hover:border-slate-700'}`}>
              <div className="text-xs font-semibold text-slate-100 flex items-center gap-1"><Crown className="w-3.5 h-3.5 text-amber-400" /> Super admin</div>
              <div className="text-[11px] text-slate-500 leading-snug">Full, unrestricted access.</div>
            </button>
          )}
        </div>
      </div>
      {err && <p className="text-xs text-rose-300">{err}</p>}
      <div className="flex gap-2">
        <button onClick={create} disabled={busy || !form.name || !form.email || form.password.length < 10} className={`${btn} bg-indigo-600 hover:bg-indigo-500 text-white`}>{busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Create operator</button>
        <span className="text-[11px] text-slate-500 self-center">Copy the password before creating — give it to them privately.</span>
      </div>
    </div>
  );
}
