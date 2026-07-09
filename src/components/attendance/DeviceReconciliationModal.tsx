"use client";

/**
 * Phase 3G — Device Reconciliation Center.
 *
 * The biometric operations center for a single device. Replaces vague
 * "data mismatch" with specific categories and concrete actions. Tabs:
 *   Overview · People on Device · Missing from Device · Mismatches ·
 *   Orphan Templates · Activity (commands + audit)
 *
 * All identity actions route through the Phase 3 device APIs, which in
 * turn write canonical biometric_enrollments via the enrollment service
 * (safety rules enforced server-side). Name-only mapping is never
 * automatic — the operator always confirms.
 */
import React, { useState, useMemo, useCallback } from 'react';
import useSWR from 'swr';
import {
  X, RefreshCw, Loader, Users, UserMinus, AlertTriangle, Fingerprint,
  ClipboardList, Search, UserPlus, Check, Ban, ShieldAlert, Send,
  Server, Wifi, WifiOff, ArrowRight, History as HistoryIcon, Repeat,
} from 'lucide-react';
import { showToast } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';

const fetcher = (url: string) => fetch(url).then(r => r.json());

// ── Mismatch presentation ───────────────────────────────────────────
const MISMATCH_LABEL: Record<string, string> = {
  MAPPED_OK: 'Mapped',
  DEVICE_ONLY_USER: 'On device, not in DRAIS',
  DEVICE_ONLY_TEMPLATE: 'Fingerprint on device, no DRAIS identity',
  DRAIS_ONLY_PERSON: 'In DRAIS, not on device',
  DRAIS_TEMPLATE_NOT_ON_DEVICE: 'Template in DRAIS, not confirmed on device',
  NAME_DRIFT: 'Name differs from DRAIS',
  PIN_CONFLICT: 'PIN conflict',
  ROLE_CONFLICT: 'Role conflict',
  STAFF_STUDENT_AMBIGUOUS: 'Matches learner AND staff',
  ORPHAN_TEMPLATE: 'Orphan fingerprint',
  STALE_MAPPING: 'Stale — not echoed recently',
  IGNORED_OR_QUARANTINED: 'Ignored / quarantined',
};
const MISMATCH_COLOR: Record<string, string> = {
  MAPPED_OK: 'bg-emerald-100 text-emerald-700',
  DEVICE_ONLY_USER: 'bg-amber-100 text-amber-800',
  DEVICE_ONLY_TEMPLATE: 'bg-orange-100 text-orange-800',
  DRAIS_ONLY_PERSON: 'bg-sky-100 text-sky-700',
  DRAIS_TEMPLATE_NOT_ON_DEVICE: 'bg-indigo-100 text-indigo-700',
  NAME_DRIFT: 'bg-yellow-100 text-yellow-800',
  PIN_CONFLICT: 'bg-red-100 text-red-700',
  ROLE_CONFLICT: 'bg-red-100 text-red-700',
  STAFF_STUDENT_AMBIGUOUS: 'bg-purple-100 text-purple-800',
  ORPHAN_TEMPLATE: 'bg-orange-100 text-orange-800',
  STALE_MAPPING: 'bg-slate-200 text-slate-600',
  IGNORED_OR_QUARANTINED: 'bg-gray-200 text-gray-500',
};

interface ReconItem {
  devicePin: string | null;
  deviceName: string | null;
  matchedPersonId: number | null;
  matchedRoleType: 'student' | 'staff' | null;
  matchedRoleRefId: number | null;
  canonicalEnrollmentId: number | null;
  mismatchType: string;
  confidence: number | null;
  candidates: Array<{ type: string; id: number; name: string; score: number }> | null;
  lastSeenOnDeviceAt: string | null;
  hasFingerprintEvidence: boolean;
  notes?: string;
}

type TabKey = 'overview' | 'people' | 'missing' | 'mismatches' | 'orphans' | 'activity';

const DEVICE_SIDE = new Set([
  'DEVICE_ONLY_USER', 'DEVICE_ONLY_TEMPLATE', 'NAME_DRIFT', 'STAFF_STUDENT_AMBIGUOUS',
  'PIN_CONFLICT', 'ROLE_CONFLICT', 'MAPPED_OK', 'IGNORED_OR_QUARANTINED',
]);
const MISSING_SIDE = new Set(['DRAIS_ONLY_PERSON', 'STALE_MAPPING', 'DRAIS_TEMPLATE_NOT_ON_DEVICE']);
const ORPHAN_SIDE = new Set(['ORPHAN_TEMPLATE', 'DEVICE_ONLY_TEMPLATE']);

function MismatchBadge({ type }: { type: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${MISMATCH_COLOR[type] ?? 'bg-gray-100 text-gray-600'}`}>
      {MISMATCH_LABEL[type] ?? type}
    </span>
  );
}

function fmt(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
}

export default function DeviceReconciliationModal({
  sn, deviceName, onClose,
}: {
  sn: string;
  deviceName?: string | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<TabKey>('overview');
  const [running, setRunning] = useState(false);
  const [actionPin, setActionPin] = useState<string | null>(null);

  const { data, isLoading, mutate } = useSWR<any>(
    `/api/attendance/devices/${encodeURIComponent(sn)}/reconciliation`, fetcher,
    { refreshInterval: 0 },
  );
  const { data: activity, mutate: mutateActivity } = useSWR<any>(
    tab === 'activity' ? `/api/attendance/devices/${encodeURIComponent(sn)}/activity` : null, fetcher,
  );

  const report = data?.report;
  const items: ReconItem[] = report?.items ?? [];
  const counts: Record<string, number> = report?.counts ?? {};

  const peopleRows = useMemo(() => items.filter(i => DEVICE_SIDE.has(i.mismatchType)), [items]);
  const missingRows = useMemo(() => items.filter(i => MISSING_SIDE.has(i.mismatchType)), [items]);
  const mismatchRows = useMemo(() => items.filter(i => i.mismatchType !== 'MAPPED_OK'), [items]);
  const orphanRows = useMemo(() => items.filter(i => ORPHAN_SIDE.has(i.mismatchType)), [items]);

  const runReconciliation = useCallback(async () => {
    setRunning(true);
    try {
      await apiFetch(`/api/attendance/devices/${encodeURIComponent(sn)}/reconciliation`, {
        method: 'POST', successMessage: 'Reconciliation run recorded',
      });
      await mutate();
    } catch { /* toast shown */ } finally { setRunning(false); }
  }, [sn, mutate]);

  const syncDirectory = useCallback(async () => {
    // Pull the device's CURRENT user list. Prefer a LAN TCP pull
    // (remembered IP); blank → over-the-air ADMS sync.
    const key = `drais.lanip.${sn}`;
    let lanIp = typeof window !== 'undefined' ? window.localStorage.getItem(key) || '' : '';
    if (!lanIp) {
      lanIp = window.prompt(
        `Enter the device LAN IP (e.g. 192.168.1.17) to pull its user list directly.\nLeave blank to queue an over-the-air sync (device responds on next heartbeat).`,
        '192.168.1.',
      ) ?? '';
      if (lanIp === null as any) return;
      if (lanIp) window.localStorage.setItem(key, lanIp);
    }
    try {
      const r = await apiFetch<any>(`/api/attendance/devices/${encodeURIComponent(sn)}/inventory`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lanIp ? { device_ip: lanIp } : { method: 'adms' }),
      });
      showToast(r?.method === 'adms' ? 'info' : 'success', r?.message ?? 'Inventory sync done');
      await mutate();
    } catch {
      if (lanIp && typeof window !== 'undefined') window.localStorage.removeItem(key);
    }
  }, [sn, mutate]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <Server className="w-6 h-6 text-indigo-600" />
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{deviceName || 'Device'} — Reconciliation Center</h2>
              <p className="text-xs font-mono text-gray-400">{sn}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={syncDirectory} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200">
              <RefreshCw className="w-3.5 h-3.5" /> Sync directory
            </button>
            <button onClick={runReconciliation} disabled={running} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
              {running ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <ClipboardList className="w-3.5 h-3.5" />} Run reconciliation
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Partial-directory honesty banner */}
        {report?.directoryIsPartial && (
          <div className="px-5 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-900/40 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Partial device directory — the K40 only echoes users it was told about. "Not on device" rows may simply not have been echoed yet. Sync the directory and re-run before bulk action.
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 px-4 pt-2 border-b border-gray-100 dark:border-slate-800 overflow-x-auto">
          {([
            ['overview', 'Overview', Server],
            ['people', `People on Device (${peopleRows.length})`, Users],
            ['missing', `Missing from Device (${missingRows.length})`, UserMinus],
            ['mismatches', `Mismatches (${mismatchRows.length})`, AlertTriangle],
            ['orphans', `Orphan Templates (${orphanRows.length})`, Fingerprint],
            ['activity', 'Activity', ClipboardList],
          ] as [TabKey, string, any][]).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap ${tab === key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-gray-400"><Loader className="w-5 h-5 animate-spin mr-2" /> Loading reconciliation…</div>
          ) : !report ? (
            <div className="text-sm text-gray-400">No reconciliation data. Click "Run reconciliation".</div>
          ) : (
            <>
              {tab === 'overview' && <OverviewTab report={report} counts={counts} />}
              {tab === 'people' && <PeopleTab sn={sn} rows={peopleRows} onChanged={mutate} setActionPin={setActionPin} actionPin={actionPin} />}
              {tab === 'missing' && <MissingTab sn={sn} rows={missingRows} onChanged={mutate} />}
              {tab === 'mismatches' && <MismatchesTab rows={mismatchRows} />}
              {tab === 'orphans' && <OrphansTab sn={sn} rows={orphanRows} onChanged={mutate} setActionPin={setActionPin} actionPin={actionPin} />}
              {tab === 'activity' && <ActivityTab activity={activity} onRefresh={mutateActivity} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────
function OverviewTab({ report, counts }: { report: any; counts: Record<string, number> }) {
  const stat = (label: string, value: number | string, color = 'text-slate-800') => (
    <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stat('Device users echoed', report.deviceUserCount)}
        {stat('DRAIS enrollments', report.draisExpectedCount)}
        {stat('Mapped OK', counts.MAPPED_OK ?? 0, 'text-emerald-600')}
        {stat('Need attention', report.items.filter((i: any) => i.mismatchType !== 'MAPPED_OK').length, 'text-amber-600')}
      </div>
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Mismatch breakdown</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {Object.entries(counts).filter(([, n]) => n > 0).map(([type, n]) => (
            <div key={type} className="flex items-center justify-between bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-lg px-3 py-2">
              <MismatchBadge type={type} />
              <span className="text-sm font-bold">{n}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── People on Device ─────────────────────────────────────────────────
function PeopleTab({ sn, rows, onChanged, setActionPin, actionPin }: {
  sn: string; rows: ReconItem[]; onChanged: () => void;
  setActionPin: (p: string | null) => void; actionPin: string | null;
}) {
  const [filter, setFilter] = useState<string>('all');
  // Local expansion for mapped-row edit/reassign/history (separate from
  // the unmapped Resolve panel driven by actionPin).
  const [editPin, setEditPin] = useState<{ pin: string; mode: 'reassign' | 'history' } | null>(null);
  const filtered = rows.filter(r => {
    if (filter === 'all') return true;
    if (filter === 'mapped') return r.mismatchType === 'MAPPED_OK' || r.mismatchType === 'NAME_DRIFT';
    if (filter === 'unknown') return r.mismatchType === 'DEVICE_ONLY_USER' || r.mismatchType === 'DEVICE_ONLY_TEMPLATE';
    if (filter === 'ambiguous') return r.mismatchType === 'STAFF_STUDENT_AMBIGUOUS';
    if (filter === 'ignored') return r.mismatchType === 'IGNORED_OR_QUARANTINED';
    return true;
  });
  if (rows.length === 0) return <Empty msg="No device users echoed yet. Sync the directory to pull the device's users." />;
  return (
    <div className="space-y-3">
      <div className="flex gap-1 flex-wrap">
        {['all', 'mapped', 'unknown', 'ambiguous', 'ignored'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-2.5 py-1 text-xs rounded-full ${filter === f ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600'}`}>{f}</button>
        ))}
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] uppercase text-gray-400 border-b border-gray-100">
          <tr><th className="py-2">PIN</th><th>Device name</th><th>DRAIS person</th><th>Status</th><th>Fingerprint</th><th>Actions</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
          {filtered.map(r => (
            <React.Fragment key={`${r.devicePin}:${r.mismatchType}`}>
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="py-2 font-mono text-xs">{r.devicePin}</td>
                <td className="text-gray-700 dark:text-gray-200">{r.deviceName || <span className="text-gray-300">—</span>}</td>
                <td className="text-gray-500">{r.matchedRoleType ? `${r.matchedRoleType} #${r.matchedRoleRefId}` : <span className="text-gray-300">unmapped</span>}</td>
                <td><MismatchBadge type={r.mismatchType} /></td>
                <td>{r.hasFingerprintEvidence ? <Fingerprint className="w-4 h-4 text-emerald-500" /> : <span className="text-gray-300 text-xs">none</span>}</td>
                <td>
                  {r.mismatchType === 'MAPPED_OK' || r.mismatchType === 'NAME_DRIFT' ? (
                    <div className="flex gap-1">
                      <ActionBtn label="Reassign" icon={Repeat} primary
                        onClick={() => { setActionPin(null); setEditPin(editPin?.pin === r.devicePin && editPin.mode === 'reassign' ? null : { pin: r.devicePin!, mode: 'reassign' }); }} />
                      <ActionBtn label="Unmap" icon={UserMinus}
                        onClick={() => {
                          if (window.confirm(`Unmap PIN ${r.devicePin}${r.deviceName ? ` (${r.deviceName})` : ''}?\n\nFuture scans on this PIN will no longer be recognised. Past attendance is kept. You can re-map it later.`)) {
                            act(sn, r.devicePin!, { action: 'unmap' }, onChanged);
                          }
                        }} />
                      <ActionBtn label="History" icon={HistoryIcon}
                        onClick={() => { setActionPin(null); setEditPin(editPin?.pin === r.devicePin && editPin.mode === 'history' ? null : { pin: r.devicePin!, mode: 'history' }); }} />
                    </div>
                  ) : r.mismatchType === 'IGNORED_OR_QUARANTINED' ? (
                    <ActionBtn label="Release" icon={Check} onClick={() => act(sn, r.devicePin!, { action: 'release' }, onChanged)} />
                  ) : (
                    <div className="flex gap-1">
                      <ActionBtn label="Resolve" icon={UserPlus} primary onClick={() => { setEditPin(null); setActionPin(actionPin === r.devicePin ? null : r.devicePin); }} />
                      <ActionBtn label="Ignore" icon={Ban} onClick={() => act(sn, r.devicePin!, { action: 'ignore' }, onChanged)} />
                      <ActionBtn label="Quarantine" icon={ShieldAlert} onClick={() => act(sn, r.devicePin!, { action: 'quarantine' }, onChanged)} />
                    </div>
                  )}
                </td>
              </tr>
              {actionPin === r.devicePin && (
                <tr><td colSpan={6} className="bg-slate-50 dark:bg-slate-800/60 p-3">
                  <ResolvePanel sn={sn} item={r} onDone={() => { setActionPin(null); onChanged(); }} />
                </td></tr>
              )}
              {editPin?.pin === r.devicePin && editPin.mode === 'reassign' && (
                <tr><td colSpan={6} className="bg-amber-50/60 dark:bg-amber-900/10 p-3">
                  <ReassignPanel sn={sn} item={r} onDone={() => { setEditPin(null); onChanged(); }} />
                </td></tr>
              )}
              {editPin?.pin === r.devicePin && editPin.mode === 'history' && (
                <tr><td colSpan={6} className="bg-slate-50 dark:bg-slate-800/60 p-3">
                  <HistoryPanel sn={sn} pin={r.devicePin!} />
                </td></tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Resolve panel: map to existing / create learner / create staff ──
function ResolvePanel({ sn, item, onDone }: { sn: string; item: ReconItem; onDone: () => void }) {
  const [mode, setMode] = useState<'map' | 'create-student' | 'create-staff'>('map');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>(() => {
    const parts = (item.deviceName || '').trim().split(/\s+/);
    return { first_name: parts[0] || '', last_name: parts.slice(1).join(' ') || '', class_id: '', stream_id: '', admission_no: '' };
  });

  const { data: studentSearch } = useSWR<any>(mode === 'map' && q.length > 1 ? `/api/students/search?q=${encodeURIComponent(q)}&limit=10` : null, fetcher);
  const { data: staffSearch } = useSWR<any>(mode === 'map' && q.length > 1 ? `/api/staff?search=${encodeURIComponent(q)}&limit=10` : null, fetcher);
  const { data: classes } = useSWR<any>(mode === 'create-student' ? '/api/classes' : null, fetcher);

  const submit = async (body: any) => {
    setBusy(true);
    try {
      await apiFetch(`/api/attendance/devices/${encodeURIComponent(sn)}/users/${encodeURIComponent(item.devicePin!)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), successMessage: 'Resolved',
      });
      onDone();
    } catch { /* toast */ } finally { setBusy(false); }
  };

  const students = studentSearch?.students ?? studentSearch?.data ?? [];
  const staff = staffSearch?.data ?? staffSearch?.staff ?? [];
  const classList = classes?.data ?? classes?.classes ?? [];

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {([['map', 'Map to existing'], ['create-student', 'Create learner'], ['create-staff', 'Create staff']] as const).map(([m, l]) => (
          <button key={m} onClick={() => setMode(m)} className={`px-2.5 py-1 text-xs rounded ${mode === m ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-700 border'}`}>{l}</button>
        ))}
      </div>

      {item.candidates && item.candidates.length > 0 && mode === 'map' && (
        <div className="text-xs text-purple-600 dark:text-purple-300">
          Suggested (confirm — never auto-applied): {item.candidates.map(c => `${c.name} [${c.type}]`).join(' · ')}
        </div>
      )}

      {mode === 'map' && (
        <div>
          <div className="flex items-center gap-2 border rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700">
            <Search className="w-4 h-4 text-gray-400" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search learner or staff name…" className="flex-1 text-sm bg-transparent outline-none" />
          </div>
          <div className="max-h-44 overflow-y-auto mt-2 space-y-1">
            {students.map((s: any) => (
              <button key={`st${s.id}`} disabled={busy} onClick={() => submit({ action: 'map', user_type: 'student', student_id: s.id || s.student_id })}
                className="w-full flex items-center justify-between px-3 py-1.5 text-sm rounded hover:bg-indigo-50 dark:hover:bg-slate-600">
                <span>{[s.first_name, s.last_name].filter(Boolean).join(' ')}</span>
                <span className="text-[11px] text-gray-400">learner {s.admission_no || s.id}</span>
              </button>
            ))}
            {staff.map((s: any) => (
              <button key={`sf${s.id}`} disabled={busy} onClick={() => submit({ action: 'map', user_type: 'staff', staff_id: s.id || s.staff_id })}
                className="w-full flex items-center justify-between px-3 py-1.5 text-sm rounded hover:bg-indigo-50 dark:hover:bg-slate-600">
                <span>{[s.first_name, s.last_name].filter(Boolean).join(' ')}</span>
                <span className="text-[11px] text-gray-400">staff {s.id}</span>
              </button>
            ))}
            {q.length > 1 && students.length === 0 && staff.length === 0 && <div className="text-xs text-gray-400 px-3">No matches</div>}
          </div>
        </div>
      )}

      {mode === 'create-student' && (
        <div className="grid grid-cols-2 gap-2">
          <input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} placeholder="First name *" className="border rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-700" />
          <input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} placeholder="Last name *" className="border rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-700" />
          <input value={form.admission_no} onChange={e => setForm({ ...form, admission_no: e.target.value })} placeholder="Admission no." className="border rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-700" />
          <select value={form.class_id} onChange={e => setForm({ ...form, class_id: e.target.value })} className="border rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-700">
            <option value="">Select class *</option>
            {classList.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button disabled={busy || !form.first_name || !form.last_name || !form.class_id}
            onClick={() => submit({ action: 'create-student', ...form })}
            className="col-span-2 px-3 py-1.5 bg-indigo-600 text-white rounded text-sm disabled:opacity-50">
            {busy ? 'Creating…' : 'Create learner + map PIN'}
          </button>
          <p className="col-span-2 text-[11px] text-gray-400">Class is required. This creates a person + student + canonical enrollment and attaches device PIN {item.devicePin}.</p>
        </div>
      )}

      {mode === 'create-staff' && (
        <div className="grid grid-cols-2 gap-2">
          <input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} placeholder="First name *" className="border rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-700" />
          <input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} placeholder="Last name *" className="border rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-700" />
          <input value={form.designation || ''} onChange={e => setForm({ ...form, designation: e.target.value })} placeholder="Designation" className="border rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-700" />
          <input value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className="border rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-700" />
          <button disabled={busy || !form.first_name || !form.last_name}
            onClick={() => submit({ action: 'create-staff', ...form })}
            className="col-span-2 px-3 py-1.5 bg-indigo-600 text-white rounded text-sm disabled:opacity-50">
            {busy ? 'Creating…' : 'Create staff + map PIN'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Reassign panel: move a mapped PIN to a different person ──────────
function ReassignPanel({ sn, item, onDone }: { sn: string; item: ReconItem; onDone: () => void }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const { data: studentSearch } = useSWR<any>(q.length > 1 ? `/api/students/search?q=${encodeURIComponent(q)}&limit=10` : null, fetcher);
  const { data: staffSearch } = useSWR<any>(q.length > 1 ? `/api/staff?search=${encodeURIComponent(q)}&limit=10` : null, fetcher);
  const students = studentSearch?.students ?? studentSearch?.data ?? [];
  const staff = staffSearch?.data ?? staffSearch?.staff ?? [];

  const submit = async (user_type: 'student' | 'staff', id: number, name: string) => {
    if (!window.confirm(
      `Reassign PIN ${item.devicePin} to ${name}?\n\n` +
      `• Future scans on this device PIN will resolve to ${name}.\n` +
      `• Past attendance stays with the previously-mapped person.\n` +
      `• This is recorded in mapping history.`,
    )) return;
    setBusy(true);
    try {
      await apiFetch(`/api/attendance/devices/${encodeURIComponent(sn)}/users/${encodeURIComponent(item.devicePin!)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reassign', user_type, student_id: user_type === 'student' ? id : undefined, staff_id: user_type === 'staff' ? id : undefined, reason: reason || undefined }),
      });
      onDone();
    } catch { /* toast shown */ } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200 bg-amber-100/60 dark:bg-amber-900/20 rounded p-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          Reassigning <span className="font-mono">PIN {item.devicePin}</span>
          {item.matchedRoleType ? <> (currently {item.matchedRoleType} #{item.matchedRoleRefId})</> : null}.
          Old attendance is preserved with the current person; only future scans move to the new person.
        </div>
      </div>
      <div className="flex items-center gap-2 border rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700">
        <Search className="w-4 h-4 text-gray-400" />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search the NEW learner or staff…" className="flex-1 text-sm bg-transparent outline-none" />
      </div>
      <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (optional, e.g. wrong mapping)" className="w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-700" />
      <div className="max-h-44 overflow-y-auto space-y-1">
        {students.map((s: any) => (
          <button key={`st${s.id}`} disabled={busy} onClick={() => submit('student', s.id || s.student_id, [s.first_name, s.last_name].filter(Boolean).join(' '))}
            className="w-full flex items-center justify-between px-3 py-1.5 text-sm rounded hover:bg-amber-50 dark:hover:bg-slate-600">
            <span>{[s.first_name, s.last_name].filter(Boolean).join(' ')}</span>
            <span className="text-[11px] text-gray-400">learner {s.admission_no || s.id}</span>
          </button>
        ))}
        {staff.map((s: any) => (
          <button key={`sf${s.id}`} disabled={busy} onClick={() => submit('staff', s.id || s.staff_id, [s.first_name, s.last_name].filter(Boolean).join(' '))}
            className="w-full flex items-center justify-between px-3 py-1.5 text-sm rounded hover:bg-amber-50 dark:hover:bg-slate-600">
            <span>{[s.first_name, s.last_name].filter(Boolean).join(' ')}</span>
            <span className="text-[11px] text-gray-400">staff {s.id}</span>
          </button>
        ))}
        {q.length > 1 && students.length === 0 && staff.length === 0 && <div className="text-xs text-gray-400 px-3">No matches</div>}
      </div>
    </div>
  );
}

// ── History panel: mapping change audit for a PIN ────────────────────
const HISTORY_LABEL: Record<string, string> = {
  map: 'Mapped', reassign: 'Reassigned', unmap: 'Unmapped', revoke: 'Revoked',
  suspend_person_archived: 'Suspended (person archived)', reactivate: 'Reactivated', edit: 'Edited',
};
function HistoryPanel({ sn, pin }: { sn: string; pin: string }) {
  const { data, isLoading } = useSWR<any>(`/api/attendance/devices/${encodeURIComponent(sn)}/users/${encodeURIComponent(pin)}`, fetcher);
  const history: any[] = data?.history ?? [];
  if (isLoading) return <div className="text-xs text-gray-400 flex items-center gap-2"><Loader className="w-3.5 h-3.5 animate-spin" /> Loading history…</div>;
  if (history.length === 0) return <div className="text-xs text-gray-400">No mapping changes recorded for PIN {pin}.</div>;
  return (
    <div className="space-y-1">
      <div className="text-[11px] uppercase text-gray-400 mb-1">Mapping history · PIN {pin}</div>
      {history.map((h) => (
        <div key={h.id} className="flex items-center gap-2 text-xs bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded px-3 py-1.5">
          <span className="font-semibold text-indigo-600 whitespace-nowrap">{HISTORY_LABEL[h.action] ?? h.action}</span>
          <span className="text-gray-600 dark:text-gray-300 truncate">
            {h.old_person_name ? h.old_person_name : (h.old_role_type ? `${h.old_role_type} #${h.old_role_ref_id}` : '')}
            {h.new_person_name || h.new_role_type ? <> → {h.new_person_name || `${h.new_role_type} #${h.new_role_ref_id}`}</> : null}
          </span>
          {h.reason && <span className="text-gray-400 italic truncate">“{h.reason}”</span>}
          <span className="text-gray-400 ml-auto whitespace-nowrap">{h.actor_name || '—'} · {fmt(h.created_at)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Missing from Device ──────────────────────────────────────────────
function MissingTab({ sn, rows, onChanged }: { sn: string; rows: ReconItem[]; onChanged: () => void }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const pushable = rows.filter(r => r.canonicalEnrollmentId);
  if (rows.length === 0) return <Empty msg="Every DRAIS enrollment is accounted for on this device (within the partial directory)." />;

  const toggle = (id: number) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const pushSelected = async (preview: boolean) => {
    const ids = [...selected];
    if (ids.length === 0) { showToast('warning', 'Select at least one person'); return; }
    setBusy(true);
    try {
      const r = await apiFetch<any>(`/api/attendance/devices/${encodeURIComponent(sn)}/push-missing`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollment_ids: ids, preview }),
      });
      if (preview) showToast('info', `Will queue ${r.will_queue}, skip ${r.skipped}`);
      else { showToast('success', r.message); setSelected(new Set()); onChanged(); }
    } catch { /* toast */ } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={() => pushSelected(true)} disabled={busy || selected.size === 0} className="px-3 py-1.5 text-xs rounded bg-slate-100 dark:bg-slate-800 disabled:opacity-50">Preview push ({selected.size})</button>
        <button onClick={() => pushSelected(false)} disabled={busy || selected.size === 0} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded bg-indigo-600 text-white disabled:opacity-50"><Send className="w-3.5 h-3.5" /> Push selected to device</button>
        <button onClick={() => setSelected(new Set(pushable.map(r => r.canonicalEnrollmentId!)))} className="px-2 py-1 text-xs text-indigo-600">Select all pushable</button>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] uppercase text-gray-400 border-b border-gray-100">
          <tr><th className="py-2 w-8"></th><th>Name</th><th>Role</th><th>PIN</th><th>Status</th><th>Template</th><th>Last seen</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
          {rows.map(r => (
            <tr key={`${r.devicePin}:${r.canonicalEnrollmentId}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="py-2">{r.canonicalEnrollmentId && <input type="checkbox" checked={selected.has(r.canonicalEnrollmentId)} onChange={() => toggle(r.canonicalEnrollmentId!)} />}</td>
              <td className="text-gray-700 dark:text-gray-200">{r.deviceName || '—'}</td>
              <td className="text-gray-500">{r.matchedRoleType}</td>
              <td className="font-mono text-xs">{r.devicePin}</td>
              <td><MismatchBadge type={r.mismatchType} /></td>
              <td>{r.hasFingerprintEvidence ? <span className="text-xs text-indigo-500">in DRAIS</span> : <span className="text-xs text-gray-400">none</span>}</td>
              <td className="text-xs text-gray-400">{fmt(r.lastSeenOnDeviceAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Mismatches (grouped) ─────────────────────────────────────────────
function MismatchesTab({ rows }: { rows: ReconItem[] }) {
  if (rows.length === 0) return <Empty msg="No mismatches — device and DRAIS agree (within the partial directory)." />;
  const groups = rows.reduce<Record<string, ReconItem[]>>((acc, r) => { (acc[r.mismatchType] ??= []).push(r); return acc; }, {});
  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([type, list]) => (
        <div key={type}>
          <div className="flex items-center gap-2 mb-1"><MismatchBadge type={type} /><span className="text-xs text-gray-400">{list.length}</span></div>
          <div className="space-y-1">
            {list.map(r => (
              <div key={`${r.devicePin}:${type}`} className="flex items-center gap-3 text-sm bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded px-3 py-1.5">
                <span className="font-mono text-xs text-gray-500">PIN {r.devicePin}</span>
                <span className="text-gray-700 dark:text-gray-200">{r.deviceName || '—'}</span>
                {r.notes && <span className="text-xs text-gray-400 ml-auto">{r.notes}</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Orphan templates ─────────────────────────────────────────────────
function OrphansTab({ sn, rows, onChanged, setActionPin, actionPin }: {
  sn: string; rows: ReconItem[]; onChanged: () => void;
  setActionPin: (p: string | null) => void; actionPin: string | null;
}) {
  if (rows.length === 0) return <Empty msg="No orphan fingerprint templates on this device." />;
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400">Fingerprint templates the device captured that DRAIS cannot link to a person. Attach to a learner/staff, or ignore.</p>
      {rows.map(r => (
        <div key={r.devicePin} className="bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Fingerprint className="w-5 h-5 text-orange-500" />
              <div>
                <div className="text-sm font-medium">PIN {r.devicePin} {r.deviceName ? `· ${r.deviceName}` : ''}</div>
                <div className="text-xs text-gray-400">{r.notes} · {fmt(r.lastSeenOnDeviceAt)}</div>
              </div>
            </div>
            <ActionBtn label="Attach" icon={UserPlus} primary onClick={() => setActionPin(actionPin === r.devicePin ? null : r.devicePin)} />
          </div>
          {actionPin === r.devicePin && (
            <div className="mt-3 border-t border-gray-100 dark:border-slate-700 pt-3">
              <ResolvePanel sn={sn} item={r} onDone={() => { setActionPin(null); onChanged(); }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Activity (commands + audit) ──────────────────────────────────────
function ActivityTab({ activity, onRefresh }: { activity: any; onRefresh: () => void }) {
  const commands = activity?.commands ?? [];
  const audit = activity?.audit ?? [];
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase">Command queue</h3>
          <button onClick={onRefresh} className="text-xs text-indigo-600 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> refresh</button>
        </div>
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {commands.length === 0 ? <Empty msg="No commands." /> : commands.map((c: any) => (
            <div key={c.id} className="flex items-center gap-3 text-xs bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded px-3 py-1.5">
              <span className={`px-1.5 py-0.5 rounded font-semibold ${c.status === 'acknowledged' ? 'bg-emerald-100 text-emerald-700' : c.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{c.status}</span>
              <span className="font-mono text-gray-500 truncate flex-1">{c.command}</span>
              <span className="text-gray-400">{fmt(c.created_at)}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Directory audit</h3>
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {audit.length === 0 ? <Empty msg="No directory actions yet." /> : audit.map((a: any) => (
            <div key={a.id} className="flex items-center gap-3 text-xs bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded px-3 py-1.5">
              <span className="font-semibold text-indigo-600">{a.action}</span>
              {a.device_user_pin && <span className="font-mono text-gray-500">PIN {a.device_user_pin}</span>}
              <span className="text-gray-400 ml-auto">{fmt(a.created_at)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── shared bits ──────────────────────────────────────────────────────
function ActionBtn({ label, icon: Icon, onClick, primary }: { label: string; icon: any; onClick: () => void; primary?: boolean }) {
  return (
    <button onClick={onClick} title={label}
      className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded ${primary ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 hover:bg-slate-200'}`}>
      <Icon className="w-3 h-3" /> {label}
    </button>
  );
}
function Empty({ msg }: { msg: string }) {
  return <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2"><Check className="w-7 h-7 text-emerald-400" /><p className="text-sm text-center max-w-sm">{msg}</p></div>;
}
async function act(sn: string, pin: string, body: any, onChanged: () => void) {
  try {
    await apiFetch(`/api/attendance/devices/${encodeURIComponent(sn)}/users/${encodeURIComponent(pin)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), successMessage: 'Done',
    });
    onChanged();
  } catch { /* toast */ }
}
