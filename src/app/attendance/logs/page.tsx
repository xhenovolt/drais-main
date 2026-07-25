"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Users, UserCheck, Briefcase, AlertTriangle, Activity,
  Search, RefreshCw, ChevronLeft, ChevronRight,
  Fingerprint, Download, UserPlus, X, Check, Clock,
  Radio, ChevronDown, ChevronUp, Trash2, Wand2, GitBranch,
} from 'lucide-react';
import useSWR from 'swr';
import { showToast } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';
import ClockHealthBadges from '@/components/attendance/ClockHealthBadges';
import { AttendanceExportService } from '@/lib/attendance/export/AttendanceExportService';

// DERIVED attendance meaning (from the state engine), NOT the device's
// raw IN/OUT field. This is what operators should trust.
const DERIVED_LABEL: Record<string, string> = {
  ARRIVED: 'Arrived', ARRIVED_LATE: 'Late arrival', ARRIVED_EARLY: 'Arrived early',
  TEMP_EXIT: 'Stepped out', RETURNED: 'Returned',
  CHECKED_OUT: 'Checked out', EARLY_DEPARTURE: 'Left early', OVERTIME_EXIT: 'Overtime exit',
  DUPLICATE: 'Duplicate',
};
const DERIVED_CLASS: Record<string, string> = {
  ARRIVED: 'bg-emerald-100 text-emerald-700', ARRIVED_EARLY: 'bg-emerald-100 text-emerald-700',
  ARRIVED_LATE: 'bg-amber-100 text-amber-800',
  TEMP_EXIT: 'bg-slate-100 text-slate-600', RETURNED: 'bg-sky-100 text-sky-700',
  CHECKED_OUT: 'bg-indigo-100 text-indigo-700', OVERTIME_EXIT: 'bg-purple-100 text-purple-800',
  EARLY_DEPARTURE: 'bg-orange-100 text-orange-800', DUPLICATE: 'bg-gray-100 text-gray-400',
};

// SMS notification outbox status for the row.
const SMS_LABEL: Record<string, string> = {
  queued: 'SMS queued', sending: 'SMS sending', delivered: 'SMS sent',
  failed: 'SMS failed', expired: 'SMS expired',
};
const SMS_CLASS: Record<string, string> = {
  queued: 'bg-blue-100 text-blue-700', sending: 'bg-blue-100 text-blue-700',
  delivered: 'bg-emerald-100 text-emerald-700', failed: 'bg-red-100 text-red-700',
  expired: 'bg-gray-100 text-gray-500',
};
/** "Why?" — the Explanation Engine (Phase 9). Every verdict explains itself:
 *  arrival vs cutoff, grace, difference, deciding policy, plain reason. */
function ExplainButton({ personId, date, roleType }: { personId?: number | null; date?: string | null; roleType?: string | null }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  if (!personId || !date) return null;

  const toggle = async () => {
    const next = !open; setOpen(next);
    if (next && !data) {
      setLoading(true);
      try {
        const r = await fetch(`/api/attendance/explain?person_id=${personId}&date=${date}&role=${roleType === 'staff' ? 'staff' : 'student'}`, { cache: 'no-store' });
        const j = await r.json();
        if (j.success) setData(j.explanation);
      } finally { setLoading(false); }
    }
  };

  return (
    <span className="relative inline-block">
      <button onClick={toggle} title="Explain this verdict" className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 font-medium">
        Why?
      </button>
      {open && (
        <div className="absolute z-30 mt-1 right-0 w-72 p-3 rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 shadow-xl text-left">
          {loading && <p className="text-xs text-gray-400">Explaining…</p>}
          {!loading && data && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{data.headline}</p>
              <div className="space-y-0.5">
                {data.factors.map((f: any, i: number) => (
                  <div key={i} className="flex justify-between text-[11px]">
                    <span className="text-gray-400">{f.label}</span>
                    <span className="text-gray-700 dark:text-gray-200 font-medium">{f.value}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-1.5">{data.reason}</p>
              <p className="text-[10px] text-indigo-500">Policy: {data.policy}</p>
            </div>
          )}
          {!loading && !data && <p className="text-xs text-gray-400">No verdict to explain for this day.</p>}
        </div>
      )}
    </span>
  );
}

/** Per-record confidence chip (Phase 3). Hover shows the five sub-scores so an
 *  operator knows WHY a row is or isn't trustworthy. */
function ConfidenceBadge({ confidence }: { confidence?: any }) {
  if (!confidence?.overall) return null;
  const { overall, identity, device, time, policy } = confidence;
  const cls = overall.band === 'high'
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
    : overall.band === 'medium'
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
      : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300';
  const tip = [
    `Overall ${overall.score}% — ${overall.reason}`,
    `· Identity ${identity.score}% (${identity.reason})`,
    `· Time ${time.score}% (${time.reason})`,
    `· Device ${device.score}% (${device.reason})`,
    `· Policy ${policy.score}% (${policy.reason})`,
  ].join('\n');
  return (
    <span title={tip} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${overall.band === 'high' ? 'bg-emerald-500' : overall.band === 'medium' ? 'bg-amber-500' : 'bg-rose-500'}`} />
      {overall.score}%
    </span>
  );
}

function ProvisionalBadge({ isProvisional }: { isProvisional?: boolean | null }) {
  if (!isProvisional) return null;
  return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">Provisional</span>;
}
function SmsPill({ status, matched, isProvisional }: { status: string | null; matched: number | boolean; isProvisional?: boolean | null }) {
  if (!matched || isProvisional) return <span className="text-[10px] text-gray-400">SMS: skipped</span>;
  if (!status) return <span className="text-[10px] text-gray-400">SMS: none</span>;
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${SMS_CLASS[status] ?? 'bg-gray-100 text-gray-500'}`}>{SMS_LABEL[status] ?? `SMS ${status}`}</span>;
}

const fetcher2 = (url: string) => fetch(url).then(r => r.json());

/** School-local quick date ranges (browser tz == school tz for on-site
 *  operators; the API converts through the school-configured offset). */
function quickRange(kind: string): { from: string; to: string } {
  const d = (x: Date) => x.toISOString().slice(0, 10);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const shift = (base: Date, days: number) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  switch (kind) {
    case 'today': return { from: d(today), to: d(today) };
    case 'yesterday': { const y = shift(today, -1); return { from: d(y), to: d(y) }; }
    case 'this_week': { // Monday-start week
      const dow = (today.getDay() + 6) % 7;
      return { from: d(shift(today, -dow)), to: d(today) };
    }
    case 'last_week': {
      const dow = (today.getDay() + 6) % 7;
      const monday = shift(today, -dow - 7);
      return { from: d(monday), to: d(shift(monday, 6)) };
    }
    case 'this_month': return { from: d(new Date(today.getFullYear(), today.getMonth(), 1)), to: d(today) };
    case 'last_month': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: d(first), to: d(last) };
    }
    case 'last_friday': {
      // Friday is day 5; the most recent Friday strictly before/at today.
      const back = ((today.getDay() - 5) + 7) % 7 || 7;
      const fri = shift(today, -back);
      return { from: d(fri), to: d(fri) };
    }
    default: return { from: '', to: '' };
  }
}

const QUICK_DATES: Array<{ key: string; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last_friday', label: 'Last Friday' },
  { key: 'this_week', label: 'This Week' },
  { key: 'last_week', label: 'Last Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
];

const ARRIVAL_BADGE: Record<string, string> = {
  EARLY: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  ON_TIME: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  LATE: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  ABSENT: 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

const TABS = [
  { key: 'all',       label: 'All Logs',   icon: Activity },
  { key: 'learners',  label: 'Learners',   icon: Users },
  { key: 'staff',     label: 'Staff',      icon: Briefcase },
  { key: 'unmatched', label: 'Unmatched',  icon: AlertTriangle },
] as const;
type TabKey = typeof TABS[number]['key'];

// ── Quick-Assign Modal ─────────────────────────────────────────────────────
function QuickAssignModal({
  open, onClose, deviceUserId, onAssigned,
}: {
  open: boolean;
  onClose: () => void;
  deviceUserId: string;
  onAssigned: () => void;
}) {
  const [userType, setUserType] = useState<'student' | 'staff'>('student');
  const [personSearch, setPersonSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Search students/staff based on type
  const { data: studentsData } = useSWR(
    userType === 'student' && personSearch.length > 1
      ? `/api/students/enrolled?search=${encodeURIComponent(personSearch)}&limit=10`
      : null,
  );
  const { data: staffData } = useSWR(
    userType === 'staff' && personSearch.length > 1
      ? `/api/staff?search=${encodeURIComponent(personSearch)}&limit=10`
      : null,
  );

  const results: Array<{ id: number; name: string; detail: string }> = useMemo(() => {
    if (userType === 'student') {
      return (studentsData?.data || []).map((s: any) => ({
        id: s.id || s.student_id,
        name: [s.first_name, s.last_name].filter(Boolean).join(' '),
        detail: s.class_name || s.admission_number || `ID: ${s.id || s.student_id}`,
      }));
    }
    return (staffData?.data || []).map((s: any) => ({
      id: s.id || s.staff_id,
      name: [s.first_name, s.last_name].filter(Boolean).join(' '),
      detail: s.role || s.designation || `ID: ${s.id || s.staff_id}`,
    }));
  }, [userType, studentsData, staffData]);

  const handleSave = async () => {
    if (!selectedId) {
      showToast('error', 'Select a person first');
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/api/attendance/zk/user-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_user_id: deviceUserId,
          user_type: userType,
          student_id: userType === 'student' ? selectedId : undefined,
          staff_id: userType === 'staff' ? selectedId : undefined,
        }),
        successMessage: 'Identity mapped successfully',
      });
      onAssigned();
      onClose();
    } catch {
      // apiFetch already showed error toast
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Assign Identity</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/30 rounded-lg border border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Device User ID: <span className="font-mono font-bold">{deviceUserId}</span>
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            All unmatched logs with this ID will be retroactively matched.
          </p>
        </div>

        {/* Type selector */}
        <div className="flex gap-2 mb-4">
          {(['student', 'staff'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setUserType(t); setPersonSearch(''); setSelectedId(null); }}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors
                ${userType === t
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}
            >
              {t === 'student' ? 'Learner' : 'Staff'}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={`Search ${userType === 'student' ? 'learner' : 'staff'} by name...`}
            value={personSearch}
            onChange={(e) => { setPersonSearch(e.target.value); setSelectedId(null); }}
            className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
              focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-sm"
            autoFocus
          />
        </div>

        {/* Results */}
        <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg mb-4">
          {results.length === 0 && personSearch.length > 1 && (
            <p className="text-center text-gray-400 text-sm py-4">No results</p>
          )}
          {results.length === 0 && personSearch.length <= 1 && (
            <p className="text-center text-gray-400 text-sm py-4">Type to search...</p>
          )}
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-gray-50
                dark:hover:bg-slate-700 border-b border-gray-100 dark:border-gray-700 last:border-0
                ${selectedId === r.id ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}
            >
              <div>
                <p className="text-sm font-medium">{r.name}</p>
                <p className="text-xs text-gray-500">{r.detail}</p>
              </div>
              {selectedId === r.id && <Check className="w-4 h-4 text-blue-600" />}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-lg
              text-sm hover:bg-gray-50 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!selectedId || saving}
            className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium
              hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? 'Saving...' : <><UserPlus className="w-4 h-4" /> Assign</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Identity Correction Modal ──────────────────────────────────────────────
// "This punch is on the wrong person." Correct the mapping OR create a new
// person — the attendance event is never deleted, only the identity is fixed
// (history-first, audited, verdicts re-evaluated). Part 2/3 of the hardening.
function CorrectIdentityModal({
  open, deviceUserId, currentName, onClose, onCorrected,
}: { open: boolean; deviceUserId: string; currentName: string | null; onClose: () => void; onCorrected: () => void }) {
  const [tab, setTab] = useState<'reassign' | 'create'>('reassign');
  const [role, setRole] = useState<'staff' | 'student'>('staff');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<any>(null);
  const [newName, setNewName] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  // Direct debounced search with VISIBLE states — no SWR (it silently
  // returned nothing here twice). This runs the fetch itself, tolerates any
  // response envelope, and surfaces searching/empty/error so nothing is hidden.
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  useEffect(() => {
    if (tab !== 'reassign' || q.trim().length < 2) { setResults([]); setSearching(false); setSearchErr(null); return; }
    let cancelled = false;
    setSearching(true); setSearchErr(null);
    const t = setTimeout(async () => {
      try {
        const url = role === 'staff'
          ? `/api/staff?search=${encodeURIComponent(q.trim())}&limit=10`
          : `/api/students/enrolled?search=${encodeURIComponent(q.trim())}&limit=10`;
        const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
        const j = await res.json().catch(() => null);
        if (cancelled) return;
        const rows = Array.isArray(j) ? j : (j?.data || j?.rows || j?.results || []);
        setResults(rows.map((s: any) => ({
          id: s.id ?? s.staff_id ?? s.student_id,
          name: (s.display_name || [s.first_name, s.other_name, s.last_name].filter(Boolean).join(' ')).trim() || `#${s.id ?? '?'}`,
          detail: s.position || s.class_name || s.admission_no || s.staff_no || '',
        })).filter((r: any) => r.id != null));
        if (!res.ok) setSearchErr(`Search failed (${res.status})`);
      } catch (e: any) {
        if (!cancelled) setSearchErr(e?.message || 'Search error');
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, role, tab]);

  // Preview the impact once a target is picked (Phase A — confirm on facts).
  const [preview, setPreview] = useState<any>(null);
  useEffect(() => {
    if (tab !== 'reassign' || !picked?.id) { setPreview(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/attendance/identity-correction', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'preview', device_user_id: deviceUserId, new_role: role, new_ref_id: picked.id }),
        });
        const j = await res.json();
        if (!cancelled) setPreview(res.ok ? j : null);
      } catch { if (!cancelled) setPreview(null); }
    })();
    return () => { cancelled = true; };
  }, [tab, picked, role, deviceUserId]);

  const submit = useCallback(async () => {
    setBusy(true);
    try {
      const body = tab === 'create'
        ? { action: 'create_and_assign', device_user_id: deviceUserId, role, name: newName.trim() }
        : { device_user_id: deviceUserId, new_role: role, new_ref_id: picked?.id, reason: reason.trim() || 'identity correction' };
      const r = await apiFetch('/api/attendance/identity-correction', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        successMessage: tab === 'create' ? 'Person created and mapped' : 'Identity corrected — events preserved',
      });
      if (r) onCorrected();
    } catch { /* apiFetch toasts */ } finally { setBusy(false); }
  }, [tab, deviceUserId, role, newName, picked, reason, onCorrected]);

  const undoLast = useCallback(async () => {
    setBusy(true);
    try {
      const r = await apiFetch('/api/attendance/identity-correction', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'undo_correction', device_user_id: deviceUserId }),
        successMessage: 'Last correction undone — events restored to the previous owner',
      });
      if (r) onCorrected();
    } catch { /* toast */ } finally { setBusy(false); }
  }, [deviceUserId, onCorrected]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Correct identity</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="text-xs p-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 flex items-start justify-between gap-2">
          <span>PIN <span className="font-mono font-bold">{deviceUserId}</span> currently maps to <span className="font-semibold">{currentName || 'someone'}</span>. The attendance events stay; only who they belong to changes (audited).</span>
          <button onClick={undoLast} disabled={busy} title="Revert the most recent correction on this PIN" className="flex-shrink-0 text-[11px] px-2 py-0.5 rounded bg-white/70 dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 hover:bg-white font-medium disabled:opacity-50">Undo last</button>
        </div>
        <div className="flex gap-2">
          {(['reassign', 'create'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 py-1.5 rounded-lg text-sm font-medium ${tab === t ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300'}`}>
              {t === 'reassign' ? 'Existing person' : 'Create new'}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {(['staff', 'student'] as const).map(r => (
            <button key={r} onClick={() => { setRole(r); setPicked(null); }} className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${role === r ? 'bg-slate-800 text-white dark:bg-slate-600' : 'bg-gray-100 dark:bg-slate-700 text-gray-500'}`}>
              {r === 'staff' ? 'Staff' : 'Learner'}
            </button>
          ))}
        </div>

        {tab === 'reassign' ? (
          <div>
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-900">
              <Search className="w-4 h-4 text-gray-400" />
              <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setPicked(null); }} placeholder={`Search the correct ${role === 'staff' ? 'staff member' : 'learner'}…`} className="flex-1 bg-transparent text-sm outline-none" />
            </div>
            <div className="max-h-40 overflow-y-auto mt-1 divide-y divide-gray-100 dark:divide-gray-700 border border-gray-100 dark:border-gray-700 rounded-lg">
              {searching && <p className="px-2 py-2 text-xs text-gray-400 flex items-center gap-1.5"><RefreshCw className="w-3 h-3 animate-spin" /> Searching {role === 'staff' ? 'staff' : 'learners'}…</p>}
              {searchErr && <p className="px-2 py-2 text-xs text-rose-500">{searchErr}</p>}
              {!searching && !searchErr && q.trim().length >= 2 && results.length === 0 && (
                <p className="px-2 py-2 text-xs text-gray-400">No {role === 'staff' ? 'staff' : 'learners'} match “{q.trim()}”. Try the other role tab, a different spelling, or “Create new”.</p>
              )}
              {!searching && q.trim().length < 2 && <p className="px-2 py-2 text-xs text-gray-400">Type at least 2 letters to search.</p>}
              {results.map((r: any) => (
                <button key={r.id} onClick={() => setPicked(r)} className={`w-full text-left px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-slate-700 ${picked?.id === r.id ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''}`}>
                  {r.name} {r.detail && <span className="text-xs text-gray-400">· {r.detail}</span>}
                </button>
              ))}
            </div>
            {picked && !preview && <p className="mt-1 text-[11px] text-gray-400">Selected: {picked.name} — checking impact…</p>}
            {picked && preview && (
              <div className="mt-1.5 p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-[11px] text-indigo-800 dark:text-indigo-200">
                This moves <span className="font-semibold">{preview.events} attendance event{preview.events === 1 ? '' : 's'}</span>
                {preview.firstDate ? ` (${preview.firstDate}${preview.lastDate && preview.lastDate !== preview.firstDate ? ` → ${preview.lastDate}` : ''})` : ''} from{' '}
                <span className="font-semibold">{preview.fromName || 'current owner'}</span> → <span className="font-semibold">{preview.toName || picked.name}</span>. Verdicts for both re-evaluate. Reversible with “Undo last”.
              </div>
            )}
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional, for the audit trail)" className="w-full mt-2 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-900 text-sm" />
          </div>
        ) : (
          <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={`New ${role === 'staff' ? 'staff' : 'learner'} full name`} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-900 text-sm" />
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500">Cancel</button>
          <button onClick={submit} disabled={busy || (tab === 'reassign' ? !picked : !newName.trim())} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">
            {busy && <RefreshCw className="w-4 h-4 animate-spin" />}{tab === 'create' ? 'Create & map' : 'Apply correction'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Live Feed Hook ─────────────────────────────────────────────────────────
function useLiveFeed() {
  const [events, setEvents] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource('/api/attendance/stream');
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        setEvents((prev) => [data, ...prev].slice(0, 50)); // keep last 50
      } catch { /* ignore parse errors */ }
    };
    es.onerror = () => setConnected(false);

    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  return { events, connected };
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function UnifiedAttendancePage() {
  const [tab, setTab] = useState<TabKey>('all');
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [deviceSn, setDeviceSn] = useState('');
  const [search, setSearch] = useState('');
  const [assignTarget, setAssignTarget] = useState<string | null>(null);
  const [correctTarget, setCorrectTarget] = useState<{ deviceUserId: string; name: string | null } | null>(null);
  const [liveFeedOpen, setLiveFeedOpen] = useState(false); // collapsed — data first
  const [classId, setClassId] = useState('');
  const [gender, setGender] = useState('');
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [exportingFormat, setExportingFormat] = useState<'csv' | 'excel' | null>(null);
  const { events: liveEvents, connected: sseConnected } = useLiveFeed();
  // Per-row selection for surgical deletes + intra-day timeframe filter.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [timeframe, setTimeframe] = useState<'all' | 'morning' | 'afternoon' | 'evening' | 'custom'>('all');
  const [customTimeFrom, setCustomTimeFrom] = useState('');
  const [customTimeTo, setCustomTimeTo] = useState('');

  const TIMEFRAMES: Record<string, { label: string; from: string; to: string } | null> = {
    all: null,
    morning: { label: 'Morning', from: '05:00', to: '11:59' },
    afternoon: { label: 'Afternoon', from: '12:00', to: '16:59' },
    evening: { label: 'Evening', from: '17:00', to: '22:59' },
  };

  // Datatable-style column sorting (server-side, whitelisted keys).
  const [sortBy, setSortBy] = useState<string>('time');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const toggleSort = useCallback((key: string) => {
    setPage(1);
    setSortBy((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir(key === 'time' ? 'desc' : 'asc');
      return key;
    });
  }, []);

  // Rows-per-page, arrival-status filter, and the allowance report view.
  const [rowsPerPage, setRowsPerPage] = useState<string>('50');
  const [datePreset, setDatePreset] = useState<string>('all');
  const [showActions, setShowActions] = useState(false);
  const [derivedFilter, setDerivedFilter] = useState<'' | 'late' | 'early' | 'ontime'>('');
  const [showAllowance, setShowAllowance] = useState(false);
  const [allowanceFilter, setAllowanceFilter] = useState<'all' | 'eligible' | 'rejected'>('all');
  const allowanceDate = dateFrom || new Date().toISOString().slice(0, 10);
  const { data: allowanceData, isLoading: allowanceLoading } = useSWR<any>(
    showAllowance ? `/api/attendance/allowance-report?date=${allowanceDate}` : null,
    fetcher2,
  );

  // Build query params
  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set('tab', tab);
    p.set('page', String(page));
    p.set('limit', rowsPerPage);
    if (derivedFilter) p.set('derived', derivedFilter);
    if (sortBy !== 'time' || sortDir !== 'desc') { p.set('sort', sortBy); p.set('dir', sortDir); }
    if (dateFrom) p.set('date_from', dateFrom);
    if (dateTo) p.set('date_to', dateTo);
    if (deviceSn) p.set('device_sn', deviceSn);
    if (search) p.set('search', search);
    if (classId) p.set('class_id', classId);
    if (gender) p.set('gender', gender);
    if (timeframe === 'custom') {
      if (customTimeFrom) p.set('time_from', customTimeFrom);
      if (customTimeTo) p.set('time_to', customTimeTo);
    } else if (TIMEFRAMES[timeframe]) {
      p.set('time_from', TIMEFRAMES[timeframe]!.from);
      p.set('time_to', TIMEFRAMES[timeframe]!.to);
    }
    return p.toString();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page, dateFrom, dateTo, deviceSn, search, classId, gender, timeframe, customTimeFrom, customTimeTo, rowsPerPage, derivedFilter, sortBy, sortDir]);

  const { data, isLoading, mutate } = useSWR<any>(
    `/api/attendance/history?${params}`,
    { refreshInterval: 15000 },
  );

  // Devices for filter
  const { data: devicesData } = useSWR<any>('/api/devices/list');
  const devices = devicesData?.data || [];

  // Time Intelligence: proactive clock-drift warning — the anomaly finds the
  // operator, not the other way round. Cheap poll; renders only on anomaly.
  const { data: timeHealth } = useSWR<any>('/api/attendance/time-health?banner=1', {
    refreshInterval: 5 * 60_000, revalidateOnFocus: false,
  });
  const timeAnomaly = timeHealth?.anomaly || null;

  // Recovery: proactive attendance-gap detection (Phase 6).
  const { data: recovery } = useSWR<any>('/api/attendance/recovery?banner=1', {
    refreshInterval: 5 * 60_000, revalidateOnFocus: false,
  });
  const recoveryGap = recovery?.gap || null;

  // Classes for filter
  const { data: classesData } = useSWR<any>('/api/classes');
  const classes = classesData?.data || classesData?.classes || [];

  const logs = data?.data || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 };
  const tabCounts = data?.tab_counts || { all: 0, learners: 0, staff: 0, unmatched: 0 };
  const visiblePresentationRows = useMemo(
    () => logs.map((log: any) => log.presentation).filter(Boolean),
    [logs],
  );

  const handleTabChange = useCallback((key: TabKey) => {
    setTab(key);
    setPage(1);
  }, []);

  // ── Detect & Map ─────────────────────────────────────────────────────────
  // One click: run the identity-matching engine over the device directory
  // (live TCP, cached directory as fallback), auto-confirm the certain tier,
  // retro-claim old punches, and point the operator at the review queue for
  // the rest. No more manually assigning PINs one by one.
  const [detecting, setDetecting] = useState(false);
  const handleDetectAndMap = useCallback(async () => {
    const targets: string[] = deviceSn
      ? [deviceSn]
      : devices.map((d: any) => d.sn).filter(Boolean);
    if (targets.length === 0) {
      showToast('error', 'No devices registered for this school');
      return;
    }
    setDetecting(true);
    try {
      let mapped = 0, review = 0, unmatchedLeft = 0;
      for (const sn of targets) {
        const runRes = await fetch('/api/attendance/identity-matching', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'run', device_sn: sn }),
        });
        const runData = await runRes.json();
        if (!runRes.ok) {
          showToast('error', `${sn}: ${runData.error || 'matching failed'}`);
          continue;
        }
        review += Number(runData.report?.review || 0);
        unmatchedLeft += Number(runData.report?.unmatched || 0);
        if (Number(runData.report?.auto || 0) > 0) {
          const confRes = await fetch('/api/attendance/identity-matching', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'confirm_auto', device_sn: sn }),
          });
          const confData = await confRes.json();
          if (confRes.ok) mapped += Number(confData.confirmed || 0);
        }
      }
      if (mapped > 0) {
        showToast('success', `Auto-mapped ${mapped} ${mapped === 1 ? 'person' : 'people'} — old logs claimed retroactively`);
      }
      if (review > 0) {
        showToast('success', `${review} likely ${review === 1 ? 'match needs' : 'matches need'} your confirmation — opening review…`);
        window.location.href = '/attendance/identity-matching';
        return;
      }
      if (mapped === 0 && review === 0) {
        showToast('error', unmatchedLeft > 0
          ? `No name matches found for ${unmatchedLeft} device user${unmatchedLeft === 1 ? '' : 's'} — assign them manually or create the missing people`
          : 'Nothing to detect — every device user is already mapped');
      }
      mutate();
    } finally {
      setDetecting(false);
    }
  }, [deviceSn, devices, mutate]);

  const handleExport = useCallback(async (format: 'csv' | 'excel') => {
    if (visiblePresentationRows.length === 0) {
      showToast('error', 'No visible attendance rows to export');
      return;
    }

    setExportingFormat(format);
    try {
      await AttendanceExportService.exportVisibleRows({
        format,
        filename: `attendance-logs-${tab}-${dateFrom || 'all-time'}-page-${page}`,
        rows: visiblePresentationRows,
      });
      showToast('success', format === 'excel' ? 'Excel exported' : 'CSV exported');
    } catch (error) {
      console.error('[Attendance Logs] Export failed:', error);
      showToast('error', 'Failed to export attendance logs');
    } finally {
      setExportingFormat(null);
    }
  }, [dateFrom, page, tab, visiblePresentationRows]);

  const handleClearLogs = async () => {
    setClearing(true);
    try {
      await apiFetch<any>('/api/attendance/logs/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      setShowClearModal(false);
      setClearConfirmText('');
      setPage(1);
      mutate();
    } catch {
      // apiFetch surfaces the error toast (e.g. 403 for non-admins)
    } finally {
      setClearing(false);
    }
  };

  const handleResetBiometrics = async () => {
    setResetting(true);
    try {
      await apiFetch<any>('/api/attendance/biometric/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      setShowResetModal(false);
      setResetConfirmText('');
      mutate();
    } catch {
      // apiFetch surfaces the error toast (e.g. 403 for non-admins)
    } finally {
      setResetting(false);
    }
  };

  // ── Surgical log deletion (admin) ─────────────────────────────────────
  const toggleSelected = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const allVisibleSelected = logs.length > 0 && logs.every((l: any) => selectedIds.has(l.id));
  const toggleAllVisible = useCallback(() => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const every = logs.every((l: any) => next.has(l.id));
      for (const l of logs) { if (every) next.delete(l.id); else next.add(l.id); }
      return next;
    });
  }, [logs]);

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (!window.confirm(`Permanently delete ${ids.length} attendance log(s)? Derived attendance for the affected days is recomputed. This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await apiFetch<any>('/api/attendance/logs/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, confirm: true }),
      });
      showToast('success', `Deleted ${res?.deleted ?? ids.length} log(s)`);
      setSelectedIds(new Set());
      mutate();
    } catch {
      // apiFetch surfaces the error toast (e.g. 403 for non-admins)
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-[1600px] mx-auto px-4 py-4">
        {/* ── Header — compact, ERP-style ─────────────────────────────── */}
        <div className="mb-3 flex items-center gap-2">
          <Fingerprint className="w-5 h-5 text-indigo-600" />
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Attendance Logs</h1>
          <span className="text-xs text-gray-400 hidden sm:inline">— persisted biometric history</span>
        </div>

        {/* ── Live Feed (collapsed by default — data first) ───────────── */}
        <div className="mb-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <button
            onClick={() => setLiveFeedOpen(!liveFeedOpen)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50"
          >
            <div className="flex items-center gap-2">
              <Radio className={`w-4 h-4 ${sseConnected ? 'text-green-500 animate-pulse' : 'text-red-400'}`} />
              <span className="text-sm font-medium">Live Feed</span>
              <span className={`w-2 h-2 rounded-full ${sseConnected ? 'bg-green-500' : 'bg-red-400'}`} />
              <span className="text-xs text-gray-400">
                {sseConnected ? 'Connected' : 'Reconnecting...'}
              </span>
              {liveEvents.length > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 rounded-full">
                  {liveEvents.length} new
                </span>
              )}
            </div>
            {liveFeedOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {liveFeedOpen && (
            <div className="max-h-48 overflow-y-auto border-t border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
              <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-900/40">
                Realtime only. Historical logs stay in the table below even if the device is offline.
              </div>
              {liveEvents.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-gray-400">
                  Waiting for new attendance events...
                </p>
              )}
              {liveEvents.map((ev, i) => (
                <div key={`${ev.id}-${i}`} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span className="text-gray-500 text-xs whitespace-nowrap">
                    {ev.presentation?.time || '—'}
                  </span>
                  {ev.person_name ? (
                    <span className="font-medium">{ev.presentation?.name || ev.person_name}</span>
                  ) : (
                    <span className="text-amber-600 font-mono text-xs">{ev.presentation?.name || `UID: ${ev.device_user_id}`}</span>
                  )}
                  <span className={`px-1.5 py-0.5 rounded text-xs
                    ${ev.person_type === 'student' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                      : ev.person_type === 'staff' ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'}`}>
                    {ev.presentation?.category || (ev.person_type === 'student' ? 'Learner' : ev.person_type === 'staff' ? 'Staff' : 'Unmatched')}
                  </span>
                  {ev.class_name && <span className="text-xs text-gray-400">{ev.presentation?.className || ev.class_name}</span>}
                  {ev.device_name && <span className="text-xs text-gray-400 ml-auto">{ev.device_name}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Tab Bar ────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2 mb-6">
          {TABS.map(({ key, label, icon: Icon }) => {
            const count = tabCounts[key] ?? 0;
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => handleTabChange(key)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
                  transition-all ${active
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                    : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 border border-gray-200 dark:border-gray-700'}`}
              >
                <Icon className="w-4 h-4" />
                {label}
                <span className={`ml-1 px-2 py-0.5 text-xs rounded-full
                  ${active
                    ? 'bg-white/20 text-white'
                    : key === 'unmatched' && count > 0
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                      : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400'}`}
                >
                  {count.toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Unified toolbar — one compact row, data first ────────────── */}
        <div className="card bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 mb-3 flex flex-wrap items-center gap-2">
          <select
            value={datePreset}
            onChange={(e) => {
              const v = e.target.value; setDatePreset(v); setPage(1);
              if (v === 'all') { setDateFrom(''); setDateTo(''); }
              else if (v !== 'customdate') { const r = quickRange(v); setDateFrom(r.from); setDateTo(r.to); }
            }}
            className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-900 text-xs"
            title="Date"
          >
            <option value="all">All time</option>
            {QUICK_DATES.map(q => <option key={q.key} value={q.key}>{q.label}</option>)}
            <option value="customdate">Custom range…</option>
          </select>
          {datePreset === 'customdate' && (
            <>
              <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-900 text-xs" />
              <span className="text-gray-400 text-xs">→</span>
              <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-900 text-xs" />
            </>
          )}

          <select
            value={timeframe}
            onChange={(e) => {
              const tf = e.target.value as typeof timeframe; setTimeframe(tf); setPage(1);
              if (tf !== 'all' && !dateFrom && !dateTo) {
                const today = new Date().toISOString().slice(0, 10);
                setDateFrom(today); setDateTo(today); setDatePreset('today');
              }
            }}
            className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-900 text-xs"
            title="Time of day"
          >
            <option value="all">All day</option>
            <option value="morning">Morning</option>
            <option value="afternoon">Afternoon</option>
            <option value="evening">Evening</option>
            <option value="custom">Custom time…</option>
          </select>
          {timeframe === 'custom' && (
            <>
              <input type="time" value={customTimeFrom} onChange={(e) => { setCustomTimeFrom(e.target.value); setPage(1); }}
                className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-900 text-xs" />
              <span className="text-gray-400 text-xs">→</span>
              <input type="time" value={customTimeTo} onChange={(e) => { setCustomTimeTo(e.target.value); setPage(1); }}
                className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-900 text-xs" />
            </>
          )}

          <select value={derivedFilter} onChange={(e) => { setDerivedFilter(e.target.value as any); setPage(1); }}
            className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-900 text-xs" title="Arrival status">
            <option value="">All statuses</option>
            <option value="late">Late only</option>
            <option value="early">Early only</option>
            <option value="ontime">On time / early</option>
          </select>

          <select value={deviceSn} onChange={(e) => { setDeviceSn(e.target.value); setPage(1); }}
            className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-900 text-xs max-w-36" title="Device">
            <option value="">All devices</option>
            {devices.map((d: any) => (
              <option key={d.sn || d.id} value={d.sn}>{d.device_name || d.sn}</option>
            ))}
          </select>

          <select value={classId} onChange={(e) => { setClassId(e.target.value); setPage(1); }}
            className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-900 text-xs max-w-32" title="Class">
            <option value="">All classes</option>
            {classes.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select value={gender} onChange={(e) => { setGender(e.target.value); setPage(1); }}
            className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-900 text-xs" title="Gender">
            <option value="">All</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>

          <select value={rowsPerPage} onChange={(e) => { setRowsPerPage(e.target.value); setPage(1); }}
            className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-900 text-xs" title="Rows per page">
            {['10', '20', '50', '100', '250', 'all'].map(n => (
              <option key={n} value={n}>{n === 'all' ? 'All rows' : `${n} rows`}</option>
            ))}
          </select>

          <div className="relative flex-1 min-w-36 max-w-56">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text" placeholder="Name or User ID…" value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-8 pr-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-900 text-xs"
            />
          </div>

          <button
            onClick={() => setShowAllowance(v => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${showAllowance
              ? 'bg-emerald-600 text-white'
              : 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'}`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            Allowance
          </button>

          <div className="relative">
            <button
              onClick={() => setShowActions(v => !v)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              Actions <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {showActions && (
              <div className="absolute right-0 z-30 mt-1 w-52 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 shadow-lg py-1 text-sm"
                onMouseLeave={() => setShowActions(false)}>
                <button onClick={() => { setShowActions(false); mutate(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-700 text-left">
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
                </button>
                <button onClick={() => { setShowActions(false); handleExport('excel'); }} disabled={exportingFormat !== null}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-700 text-left disabled:opacity-50">
                  <Download className="w-4 h-4" /> Export visible (Excel)
                </button>
                <button onClick={() => { setShowActions(false); handleExport('csv'); }} disabled={exportingFormat !== null}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-700 text-left disabled:opacity-50">
                  <Download className="w-4 h-4" /> Export visible (CSV)
                </button>
                <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
                <button onClick={() => { setShowActions(false); setClearConfirmText(''); setShowClearModal(true); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-left">
                  <Trash2 className="w-4 h-4" /> Clear all logs…
                </button>
                <button onClick={() => { setShowActions(false); setResetConfirmText(''); setShowResetModal(true); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-left">
                  <Fingerprint className="w-4 h-4" /> Reset biometrics…
                </button>
              </div>
            )}
          </div>

          {selectedIds.size > 0 && (
            <div className="w-full flex items-center gap-2 pt-1">
              <span className="text-xs text-gray-500 dark:text-gray-400">{selectedIds.size} selected</span>
              <button
                onClick={handleDeleteSelected}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium disabled:opacity-50"
              >
                {deleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete selected
              </button>
              <button onClick={() => setSelectedIds(new Set())}
                className="px-2 py-1.5 rounded-lg text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                Clear
              </button>
            </div>
          )}
        </div>
        {/* ── Allowance Eligibility Report ────────────────────────────── */}
        {showAllowance && (
          <div className="card bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 mb-6 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-semibold text-gray-900 dark:text-white">
                Allowance Eligibility — {allowanceDate}
              </h2>
              {allowanceData?.summary && (
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="px-2 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-semibold">{allowanceData.summary.eligible} eligible</span>
                  <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 font-semibold">{allowanceData.summary.late} late</span>
                  <span className="px-2 py-1 rounded-full bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">{allowanceData.summary.absent} absent</span>
                  <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{allowanceData.summary.checkoutMissing} missing checkout</span>
                </div>
              )}
              <div className="ml-auto flex items-center gap-2">
                <select
                  value={allowanceFilter}
                  onChange={(e) => setAllowanceFilter(e.target.value as any)}
                  className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-900 text-xs"
                >
                  <option value="all">Everyone</option>
                  <option value="eligible">Allowance: eligible only</option>
                  <option value="rejected">Allowance: rejected only</option>
                </select>
                <a
                  href={`/api/attendance/allowance-report?date=${allowanceDate}&format=csv`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
                >
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </a>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Decided from the school&apos;s own attendance rules: arrival before the reporting cutoff = eligible;
              crossing the late threshold or absence = not eligible. Uses the day selected above — pick a quick
              date chip (e.g. Today, Last Friday) to change it.
            </p>
            <div className="overflow-x-auto max-h-[28rem] overflow-y-auto border border-gray-100 dark:border-gray-700 rounded-lg">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 dark:bg-slate-900 z-10">
                  <tr>
                    {['Employee', 'Designation', 'Department', 'Arrival', 'Departure', 'Status', 'Allowance'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                  {allowanceLoading && (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400"><RefreshCw className="w-5 h-5 animate-spin mx-auto" /></td></tr>
                  )}
                  {(allowanceData?.rows || [])
                    .filter((r: any) => allowanceFilter === 'all' ? true : allowanceFilter === 'eligible' ? r.allowance : !r.allowance)
                    .map((r: any) => (
                      <tr key={r.staffId} className={r.allowance
                        ? 'bg-emerald-50/50 dark:bg-emerald-900/10'
                        : r.arrivalStatus === 'LATE' ? 'bg-red-50/60 dark:bg-red-900/10' : ''}>
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-white whitespace-nowrap">{r.name}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap">{r.designation || '—'}</td>
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{r.department || '—'}</td>
                        <td className="px-3 py-2 font-mono text-gray-900 dark:text-white whitespace-nowrap">{r.arrival || '—'}</td>
                        <td className="px-3 py-2 font-mono text-gray-600 dark:text-gray-300 whitespace-nowrap">
                          {r.departure || (r.checkoutMissing && r.arrivalStatus !== 'ABSENT'
                            ? <span className="text-amber-600 dark:text-amber-400 text-xs font-sans">MISSING CHECKOUT</span> : '—')}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${ARRIVAL_BADGE[r.arrivalStatus] || ''}`}>
                            {r.arrivalStatus.replace('_', ' ')}{r.arrivalStatus === 'LATE' && r.lateMinutes ? ` +${r.lateMinutes}m` : ''}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {r.allowance
                            ? <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-bold text-xs"><Check className="w-3.5 h-3.5" /> YES</span>
                            : <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-bold text-xs"><X className="w-3.5 h-3.5" /> NO</span>}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Attention row — anomalies + clock health on ONE compact line
               so alerts never push the table below the fold ───────────── */}
        {(timeAnomaly || recoveryGap) && (
          <div className="mb-2 flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 text-xs">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />
            {timeAnomaly && (
              <span className="text-rose-800 dark:text-rose-200">
                Clock drift on {timeAnomaly.device_sn} ({timeAnomaly.driftConfidence}%) —{' '}
                <a href="/attendance/time-health" className="underline font-medium">fix time</a>
              </span>
            )}
            {timeAnomaly && recoveryGap && <span className="text-rose-300">·</span>}
            {recoveryGap && (
              <span className="text-rose-800 dark:text-rose-200">
                Gap on {recoveryGap.device_name || recoveryGap.device_sn} —{' '}
                <a href="/attendance/recovery" className="underline font-medium">recover</a>
              </span>
            )}
          </div>
        )}

        {/* ── Record count + device clock health, one line ─────────────── */}
        <div className="mb-1.5"><ClockHealthBadges /></div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-sm text-gray-500">
            {pagination.total.toLocaleString()} records
            {tab === 'unmatched' && pagination.total > 0 && (
              <span className="ml-2 text-red-600 font-medium">
                — requires identity assignment
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            {tab === 'unmatched' && pagination.total > 0 && (
              <>
                <button
                  onClick={handleDetectAndMap}
                  disabled={detecting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
                  title="Match device user names against DRAIS staff/learners automatically"
                >
                  {detecting
                    ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Detecting…</>
                    : <><Wand2 className="w-3.5 h-3.5" /> Detect &amp; map</>}
                </button>
                <a
                  href="/attendance/identity-matching"
                  className="text-xs text-violet-600 dark:text-violet-400 hover:underline whitespace-nowrap"
                >
                  Review queue
                </a>
              </>
            )}
            {isLoading && <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />}
          </div>
        </div>

        {/* ── Mobile card list (xs only, < sm) ───────────────────────── */}
        <div className="sm:hidden space-y-2 mb-4">
          {isLoading && logs.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              Loading...
            </div>
          )}
          {!isLoading && logs.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">No records found.</div>
          )}
          {logs.map((log: any) => {
            const presentation = log.presentation;

            return (
            <div key={log.id} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {log.photo_url ? (
                    <img src={log.photo_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      log.person_name
                        ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600'
                        : 'bg-amber-100 dark:bg-amber-900/50 text-amber-600'
                    }`}>
                      {log.person_name ? log.person_name.charAt(0) : '?'}
                    </div>
                  )}
                  <div className="min-w-0">
                    {log.person_name ? (
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{presentation?.name || log.person_name}</p>
                    ) : (
                      <p className="text-xs font-mono text-amber-600 dark:text-amber-400">{presentation?.name || `UID: ${log.device_user_id}`}</p>
                    )}
                    {log.staff_position && (
                      <p className="text-xs text-indigo-500 dark:text-indigo-400 truncate">{log.staff_position}{log.staff_department ? ` · ${log.staff_department}` : ''}</p>
                    )}
                    {log.class_name && (
                      <p className="text-xs text-gray-400 truncate">{presentation?.className || log.class_name}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {presentation?.time || '—'}
                  </span>
                  {/* DERIVED meaning from the state engine (falls back to
                      "Scan" when a day hasn't been evaluated yet) — never
                      the device's raw IN/OUT field. */}
                  {presentation?.attendanceStatus && presentation.attendanceStatus !== 'Scan' ? (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${DERIVED_CLASS[log.derived_event] ?? 'bg-slate-100 text-slate-600'}`}
                          title={log.derived_detail || ''}>
                      {presentation.attendanceStatus}
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500" title="Awaiting evaluation">Scan</span>
                  )}
                  {presentation?.statusDetail && presentation.statusDetail !== '—' && (
                    <span className="text-[10px] text-gray-400 whitespace-nowrap">{presentation.statusDetail}</span>
                  )}
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  log.person_type === 'student'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                    : log.person_type === 'staff'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
                }`}>
                  {presentation?.category || (log.person_type === 'student' ? 'Learner' : log.person_type === 'staff' ? 'Staff' : 'Unmatched')}
                </span>
                <div className="flex items-center gap-1.5">
                  {log.matched && !log.is_provisional ? (
                    <span className="flex items-center gap-0.5 text-green-600 text-[10px] font-medium">
                      <UserCheck className="w-3 h-3" /> {presentation?.matchStatus || 'Matched'}
                    </span>
                  ) : (
                    <span className="flex items-center gap-0.5 text-red-500 text-[10px] font-medium">
                      <AlertTriangle className="w-3 h-3" /> {log.is_provisional ? 'Provisional' : (presentation?.matchStatus || 'Unmatched')}
                    </span>
                  )}
                  <ProvisionalBadge isProvisional={log.is_provisional} />
                  <ConfidenceBadge confidence={log.confidence} />
                </div>
                {tab === 'unmatched' && (
                  <button
                    onClick={() => setAssignTarget(log.device_user_id)}
                    className="ml-auto flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors"
                  >
                    <UserPlus className="w-3 h-3" /> Assign
                  </button>
                )}
              </div>
            </div>
          )})}
        </div>

        {/* ── Table (sm+) ────────────────────────────────────────────── */}
        <div className="hidden sm:block bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700
          rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-900/50">
                <tr>
                  <th className="pl-4 pr-1 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      className="rounded border-gray-300 dark:border-gray-600"
                      title="Select all on this page"
                    />
                  </th>
                  {([
                    { key: 'time', label: 'Time', cls: '' },
                    { key: 'name', label: 'Name', cls: '' },
                    { key: 'type', label: 'Category', cls: '' },
                    { key: null, label: 'Class', cls: ' hidden md:table-cell' },
                    { key: 'pin', label: 'Device ID', cls: ' hidden lg:table-cell' },
                    { key: null, label: 'Verification Method', cls: ' hidden lg:table-cell' },
                    { key: 'status', label: 'Attendance Status', cls: '' },
                    { key: null, label: 'Match Status', cls: '' },
                  ] as Array<{ key: string | null; label: string; cls: string }>).map((col) => (
                    <th
                      key={col.label}
                      onClick={col.key ? () => toggleSort(col.key!) : undefined}
                      className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase${col.cls} ${
                        col.key ? 'cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-300' : ''
                      }`}
                      title={col.key ? 'Sort by ' + col.label.toLowerCase() : undefined}
                    >
                      <span className="inline-flex items-center gap-0.5">
                        {col.label}
                        {col.key && (
                          <span className="flex flex-col -space-y-1.5 ml-0.5">
                            <ChevronUp className={`w-3 h-3 ${sortBy === col.key && sortDir === 'asc' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-300 dark:text-gray-600'}`} />
                            <ChevronDown className={`w-3 h-3 ${sortBy === col.key && sortDir === 'desc' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-300 dark:text-gray-600'}`} />
                          </span>
                        )}
                      </span>
                    </th>
                  ))}
                  {tab === 'unmatched' && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Action</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {isLoading && logs.length === 0 && (
                  <tr>
                    <td colSpan={tab === 'unmatched' ? 10 : 9} className="px-4 py-12 text-center text-gray-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                      Loading...
                    </td>
                  </tr>
                )}
                {!isLoading && logs.length === 0 && (
                  <tr>
                    <td colSpan={tab === 'unmatched' ? 10 : 9} className="px-4 py-12 text-center text-gray-400">
                      No records found for this filter.
                      Try to see this live view here <br></br>
                      {liveEvents.map((ev, i) => (
                        <div key={`${ev.id}-${i}`} className="flex items-center gap-3 px-4 py-2 text-sm">
                          <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="text-gray-500 text-xs whitespace-nowrap">
                            {ev.presentation?.time || '—'}
                          </span>
                          {ev.person_name ? (
                            <span className="font-medium">{ev.presentation?.name || ev.person_name}</span>
                          ) : (
                            <span className="text-amber-600 font-mono text-xs">{ev.presentation?.name || `UID: ${ev.device_user_id}`}</span>
                          )}
                          <span className={`px-1.5 py-0.5 rounded text-xs
                            ${ev.person_type === 'student' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                              : ev.person_type === 'staff' ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'}`}>
                            {ev.presentation?.category || (ev.person_type === 'student' ? 'Learner' : ev.person_type === 'staff' ? 'Staff' : 'Unmatched')}
                          </span>
                          {ev.class_name && <span className="text-xs text-gray-400">{ev.presentation?.className || ev.class_name}</span>}
                          {ev.device_name && <span className="text-xs text-gray-400 ml-auto">{ev.device_name}</span>}
                        </div>
                      ))}
                    </td>
                  </tr>
                )}
                {logs.map((log: any) => {
                  const presentation = log.presentation;

                  return (
                  <tr key={log.id} className={`hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors ${selectedIds.has(log.id) ? 'bg-red-50/60 dark:bg-red-900/10' : ''}`}>
                    <td className="pl-4 pr-1 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(log.id)}
                        onChange={() => toggleSelected(log.id)}
                        className="rounded border-gray-300 dark:border-gray-600"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        {presentation?.time || '—'}
                        <a
                          href={`/attendance/trace?event=${log.id}`}
                          title="Trace this punch through every pipeline stage"
                          className="text-gray-300 dark:text-gray-600 hover:text-indigo-500 dark:hover:text-indigo-400"
                        >
                          <GitBranch className="w-3 h-3" />
                        </a>
                      </div>
                      <span className="text-xs text-gray-400">
                        {presentation?.date && presentation.date !== '—' ? presentation.date : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {log.person_name ? (
                        <div className="flex items-center gap-2">
                          {log.photo_url ? (
                            <img
                              src={log.photo_url}
                              alt=""
                              className="w-8 h-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50
                              flex items-center justify-center text-xs font-bold text-blue-600">
                              {log.person_name.charAt(0)}
                            </div>
                          )}
                          <span className="text-sm font-medium">
                            {presentation?.name || log.person_name}
                            {log.staff_position && (
                              <span className="block text-xs font-normal text-indigo-500 dark:text-indigo-400">
                                {log.staff_position}{log.staff_department ? ` · ${log.staff_department}` : ''}
                              </span>
                            )}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-amber-600 dark:text-amber-400 font-mono">
                          {presentation?.name || `UID: ${log.device_user_id}`}
                          <span className="text-xs ml-1 text-gray-400">(Unassigned)</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
                        ${log.person_type === 'student'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                          : log.person_type === 'staff'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'}`}>
                        {presentation?.category || (log.person_type === 'student' ? 'Learner'
                          : log.person_type === 'staff' ? 'Staff'
                            : 'Unmatched')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 hidden md:table-cell">
                      {presentation?.className || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-500 hidden lg:table-cell">
                      {presentation?.deviceId || log.device_user_id}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 hidden lg:table-cell">
                      {presentation?.verificationMethod || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {/* DERIVED attendance meaning from the state engine */}
                      {presentation?.attendanceStatus && presentation.attendanceStatus !== 'Scan' ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="flex items-center gap-1.5">
                            <span className={`inline-block w-fit px-2 py-0.5 rounded text-xs font-medium ${DERIVED_CLASS[log.derived_event] ?? 'bg-slate-100 text-slate-600'}`}>
                              {presentation.attendanceStatus}
                            </span>
                            {log.matched && log.person_id && (
                              <ExplainButton personId={log.person_id} date={(log.check_time || '').slice(0, 10)} roleType={log.role_type} />
                            )}
                          </span>
                          {presentation.statusDetail !== '—' && <span className="text-[11px] text-gray-400">{presentation.statusDetail}</span>}
                          <SmsPill status={log.sms_status} matched={log.matched} isProvisional={log.is_provisional} />
                        </div>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-500" title="Awaiting day evaluation">Scan</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {log.matched && !log.is_provisional ? (
                          <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                            <UserCheck className="w-3.5 h-3.5" /> {presentation?.matchStatus || 'Matched'}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-500 text-xs font-medium">
                            <AlertTriangle className="w-3.5 h-3.5" /> {log.is_provisional ? 'Provisional' : (presentation?.matchStatus || 'Unmatched')}
                          </span>
                        )}
                        <ProvisionalBadge isProvisional={log.is_provisional} />
                        <ConfidenceBadge confidence={log.confidence} />
                        {log.matched && log.person_id && (
                          <button
                            onClick={() => setCorrectTarget({ deviceUserId: log.device_user_id, name: log.person_name })}
                            title="Wrong person? Correct this identity — the event is kept, only the identity is fixed"
                            className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 hover:text-indigo-600"
                          >Correct</button>
                        )}
                      </div>
                    </td>
                    {tab === 'unmatched' && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setAssignTarget(log.device_user_id)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white
                            rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          Assign
                        </button>
                      </td>
                    )}
                  </tr>
                )})}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.total > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t
              border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-900/30">
              <p className="text-sm text-gray-500">
                Showing {(pagination.page - 1) * (pagination.limit || logs.length) + 1}
                {' – '}
                {Math.min(pagination.page * (pagination.limit || logs.length), pagination.total)}
                {' of '}{Number(pagination.total).toLocaleString()} records
                {pagination.totalPages > 1 && <> · Page {pagination.page} of {pagination.totalPages}</>}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg
                    hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
                  disabled={page >= pagination.totalPages}
                  className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg
                    hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-50"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick-Assign Modal */}
      <QuickAssignModal
        open={!!assignTarget}
        onClose={() => setAssignTarget(null)}
        deviceUserId={assignTarget || ''}
        onAssigned={() => mutate()}
      />

      {/* Identity Correction Modal — fix a wrong mapping without deleting events */}
      <CorrectIdentityModal
        open={!!correctTarget}
        deviceUserId={correctTarget?.deviceUserId || ''}
        currentName={correctTarget?.name || null}
        onClose={() => setCorrectTarget(null)}
        onCorrected={() => { setCorrectTarget(null); mutate(); }}
      />

      {/* Clear-Logs Confirmation Modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Clear all attendance logs?</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  This affects this school only.
                </p>
              </div>
            </div>

            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-800 dark:text-red-200 font-medium">
                This permanently deletes every attendance punch, the derived
                daily records and dashboard totals. It cannot be undone.
              </p>
              <ul className="mt-2 text-xs text-red-700 dark:text-red-300 list-disc list-inside space-y-0.5">
                <li>Your devices, shifts, rules and holidays are kept.</li>
                <li>Export a CSV first if you need a copy.</li>
                <li>{pagination.total.toLocaleString()} log{pagination.total === 1 ? '' : 's'} currently match your view.</li>
              </ul>
            </div>

            <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
              Type <span className="font-mono font-bold">CLEAR</span> to confirm
            </label>
            <input
              type="text"
              value={clearConfirmText}
              onChange={(e) => setClearConfirmText(e.target.value)}
              placeholder="CLEAR"
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                bg-white dark:bg-slate-900 text-sm mb-4 focus:ring-2 focus:ring-red-500"
            />

            <div className="flex gap-3">
              <button
                onClick={() => { setShowClearModal(false); setClearConfirmText(''); }}
                disabled={clearing}
                className="flex-1 py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-lg
                  text-sm hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleClearLogs}
                disabled={clearing || clearConfirmText.trim().toUpperCase() !== 'CLEAR'}
                className="flex-1 py-2 px-4 bg-red-600 text-white rounded-lg text-sm font-medium
                  hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed
                  flex items-center justify-center gap-2"
              >
                {clearing ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Clearing…</>
                ) : (
                  <><Trash2 className="w-4 h-4" /> Clear all logs</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset-Biometrics Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
                <Fingerprint className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Reset biometric enrollments?</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  This affects this school only.
                </p>
              </div>
            </div>

            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-800 dark:text-red-200 font-medium">
                This unmaps every device PIN — DRAIS forgets who each
                fingerprint belongs to. It cannot be undone.
              </p>
              <ul className="mt-2 text-xs text-red-700 dark:text-red-300 list-disc list-inside space-y-0.5">
                <li>Clears biometric enrollments + device mappings.</li>
                <li>Students, staff, devices and attendance history are kept.</li>
                <li>The physical device keeps its users until you re-sync.</li>
                <li>You'll need to re-map or re-enroll each person afterwards.</li>
              </ul>
            </div>

            <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
              Type <span className="font-mono font-bold">RESET</span> to confirm
            </label>
            <input
              type="text"
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              placeholder="RESET"
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                bg-white dark:bg-slate-900 text-sm mb-4 focus:ring-2 focus:ring-red-500"
            />

            <div className="flex gap-3">
              <button
                onClick={() => { setShowResetModal(false); setResetConfirmText(''); }}
                disabled={resetting}
                className="flex-1 py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-lg
                  text-sm hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleResetBiometrics}
                disabled={resetting || resetConfirmText.trim().toUpperCase() !== 'RESET'}
                className="flex-1 py-2 px-4 bg-red-600 text-white rounded-lg text-sm font-medium
                  hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed
                  flex items-center justify-center gap-2"
              >
                {resetting ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Resetting…</>
                ) : (
                  <><Fingerprint className="w-4 h-4" /> Reset biometrics</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
