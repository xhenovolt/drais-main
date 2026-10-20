"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { toLocalDateStr } from '@/lib/datetime/local-date';
import {
  Users, UserCheck, Briefcase, AlertTriangle, Activity,
  Search, RefreshCw, ChevronLeft, ChevronRight,
  Fingerprint, Download, UserPlus, X, Check, Clock,
  Radio, ChevronDown, ChevronUp, Trash2, Wand2, GitBranch,
} from 'lucide-react';
import useSWR from 'swr';
import FilterAccordion, { FilterField, filterInputCls, type FilterChip } from '@/components/ui/FilterAccordion';
import { showToast } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';
import ClockHealthBadges from '@/components/attendance/ClockHealthBadges';
import { AttendanceExportService } from '@/lib/attendance/export/AttendanceExportService';
import { useSchoolConfig } from '@/hooks/useSchoolConfig';
import { useI18n } from '@/components/i18n/I18nProvider';
import { MediaImg } from '@/components/media/MediaImg';

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
  const { t, lang, digits } = useI18n();
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
      <button onClick={toggle} title={t('attendancePages.logs.explain.title')} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 font-medium">
        {t('attendancePages.logs.explain.why')}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 end-0 w-72 p-3 rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 shadow-xl text-start">
          {loading && <p className="text-xs text-gray-400">{t('attendancePages.logs.explain.loading')}</p>}
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
              <p className="text-[10px] text-indigo-500">{t('attendancePages.logs.explain.policy', { policy: data.policy })}</p>
            </div>
          )}
          {!loading && !data && <p className="text-xs text-gray-400">{t('attendancePages.logs.explain.none')}</p>}
        </div>
      )}
    </span>
  );
}

/** Per-record confidence chip (Phase 3). Hover shows the five sub-scores so an
 *  operator knows WHY a row is or isn't trustworthy. */
function ConfidenceBadge({ confidence }: { confidence?: any }) {
  const { t, lang, digits } = useI18n();
  if (!confidence?.overall) return null;
  const { overall, identity, device, time, policy } = confidence;
  const cls = overall.band === 'high'
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
    : overall.band === 'medium'
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
      : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300';
  const tip = [
    t('attendancePages.logs.confidence.overall', { score: overall.score, reason: overall.reason }),
    t('attendancePages.logs.confidence.identity', { score: identity.score, reason: identity.reason }),
    t('attendancePages.logs.confidence.time', { score: time.score, reason: time.reason }),
    t('attendancePages.logs.confidence.device', { score: device.score, reason: device.reason }),
    t('attendancePages.logs.confidence.policy', { score: policy.score, reason: policy.reason }),
  ].join('\n');
  return (
    <span title={tip} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${overall.band === 'high' ? 'bg-emerald-500' : overall.band === 'medium' ? 'bg-amber-500' : 'bg-rose-500'}`} />
      {lang === 'ar' ? `${digits(overall.score)}٪` : `${overall.score}%`}
    </span>
  );
}

function ProvisionalBadge({ isProvisional }: { isProvisional?: boolean | null }) {
  const { t } = useI18n();
  if (!isProvisional) return null;
  return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">{t('attendancePages.logs.provisional')}</span>;
}
function SmsPill({ status, matched, isProvisional }: { status: string | null; matched: number | boolean; isProvisional?: boolean | null }) {
  const { t } = useI18n();
  if (!matched || isProvisional) return <span className="text-[10px] text-gray-400">{t('attendancePages.logs.sms.skipped')}</span>;
  if (!status) return <span className="text-[10px] text-gray-400">{t('attendancePages.logs.sms.none')}</span>;
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${SMS_CLASS[status] ?? 'bg-gray-100 text-gray-500'}`}>{SMS_LABEL[status] ? t(`attendancePages.logs.sms.${status}`) : t('attendancePages.logs.sms.other', { status })}</span>;
}

/** Per-row redundancy for the SMS Outbox's own bulk "Resend failed" button
 *  (see src/app/admin/notifications/outbox/page.tsx) — lets an operator
 *  fix one learner's failed/expired notification right here, without
 *  leaving the logs page to find it in the outbox. Only ever shown for
 *  'failed'/'expired' — a resend is meaningless for any other status, and
 *  the backend itself refuses to touch anything else regardless. */
function ResendSmsButton({ status, studentId, date }: { status: string | null; studentId?: number | null; date?: string | null }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  if (!studentId || !date || (status !== 'failed' && status !== 'expired')) return null;

  const resend = async () => {
    setBusy(true);
    try {
      await apiFetch<any>('/api/admin/notifications/outbox/resend', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, date_from: date, date_to: date }),
        successMessage: t('attendancePages.logs.resend.done'),
      });
    } catch { /* apiFetch surfaces the error toast */ }
    finally { setBusy(false); }
  };

  return (
    <button
      onClick={resend}
      disabled={busy}
      title={t('attendancePages.logs.resend.title')}
      className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-50 font-medium"
    >
      {busy ? t('attendancePages.logs.resend.busy') : t('attendancePages.logs.resend.button')}
    </button>
  );
}

const fetcher2 = (url: string) => fetch(url).then(r => r.json());

/** School-local quick date ranges (browser tz == school tz for on-site
 *  operators; the API converts through the school-configured offset). */
function quickRange(kind: string): { from: string; to: string } {
  // Format from LOCAL calendar components — NOT toISOString(), which converts
  // to UTC and rolls a local-midnight Date back a day for any tz east of UTC
  // (e.g. EAT +03:00 turned "today" into yesterday for on-site operators).
  const d = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
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
  const { t, digits } = useI18n();
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
        detail: s.class_name || s.admission_number || t('attendancePages.logs.idLabel', { id: s.id || s.student_id }),
      }));
    }
    return (staffData?.data || []).map((s: any) => ({
      id: s.id || s.staff_id,
      name: [s.first_name, s.last_name].filter(Boolean).join(' '),
      detail: s.role || s.designation || t('attendancePages.logs.idLabel', { id: s.id || s.staff_id }),
    }));
  }, [userType, studentsData, staffData, t]);

  const handleSave = async () => {
    if (!selectedId) {
      showToast('error', t('attendancePages.logs.assign.selectFirst'));
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
        successMessage: t('attendancePages.logs.assign.mapped'),
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
          <h3 className="text-lg font-semibold">{t('attendancePages.logs.assign.title')}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/30 rounded-lg border border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            {t('attendancePages.logs.assign.deviceUserId', { id: deviceUserId })}
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            {t('attendancePages.logs.assign.retro')}
          </p>
        </div>

        {/* Type selector */}
        <div className="flex gap-2 mb-4">
          {(['student', 'staff'] as const).map((ut) => (
            <button
              key={ut}
              onClick={() => { setUserType(ut); setPersonSearch(''); setSelectedId(null); }}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors
                ${userType === ut
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}
            >
              {ut === 'student' ? t('attendancePages.logs.role.learner') : t('attendancePages.logs.role.staff')}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={userType === 'student' ? t('attendancePages.logs.assign.searchLearner') : t('attendancePages.logs.assign.searchStaff')}
            value={personSearch}
            onChange={(e) => { setPersonSearch(e.target.value); setSelectedId(null); }}
            className="w-full ps-10 pe-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-sm"
            autoFocus
          />
        </div>

        {/* Results */}
        <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg mb-4">
          {results.length === 0 && personSearch.length > 1 && (
            <p className="text-center text-gray-400 text-sm py-4">{t('attendancePages.logs.assign.noResults')}</p>
          )}
          {results.length === 0 && personSearch.length <= 1 && (
            <p className="text-center text-gray-400 text-sm py-4">{t('attendancePages.logs.assign.typeToSearch')}</p>
          )}
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={`w-full text-start px-3 py-2 flex items-center justify-between hover:bg-gray-50
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
            className="flex-1 py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-slate-700"
          >
            {t('attendancePages.logs.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!selectedId || saving}
            className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? t('attendancePages.logs.saving') : <><UserPlus className="w-4 h-4" /> {t('attendancePages.logs.assign.button')}</>}
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
  const { t, rich } = useI18n();
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
    const timer = setTimeout(async () => {
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
        if (!res.ok) setSearchErr(t('attendancePages.logs.correct.searchFailed', { status: res.status }));
      } catch (e: any) {
        if (!cancelled) setSearchErr(e?.message || t('attendancePages.logs.correct.searchError'));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
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
        successMessage: tab === 'create' ? t('attendancePages.logs.correct.created') : t('attendancePages.logs.correct.corrected'),
      });
      if (r) onCorrected();
    } catch { /* apiFetch toasts */ } finally { setBusy(false); }
  }, [tab, deviceUserId, role, newName, picked, reason, onCorrected, t]);

  const undoLast = useCallback(async () => {
    setBusy(true);
    try {
      const r = await apiFetch('/api/attendance/identity-correction', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'undo_correction', device_user_id: deviceUserId }),
        successMessage: t('attendancePages.logs.correct.undone'),
      });
      if (r) onCorrected();
    } catch { /* toast */ } finally { setBusy(false); }
  }, [deviceUserId, onCorrected, t]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">{t('attendancePages.logs.correct.title')}</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="text-xs p-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 flex items-start justify-between gap-2">
          <span>{rich('attendancePages.logs.correct.intro', { pin: <span className="font-mono font-bold">{deviceUserId}</span>, name: <span className="font-semibold">{currentName || t('attendancePages.logs.correct.someone')}</span> })}</span>
          <button onClick={undoLast} disabled={busy} title={t('attendancePages.logs.correct.undoTitle')} className="flex-shrink-0 text-[11px] px-2 py-0.5 rounded bg-white/70 dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 hover:bg-white font-medium disabled:opacity-50">{t('attendancePages.logs.correct.undo')}</button>
        </div>
        <div className="flex gap-2">
          {(['reassign', 'create'] as const).map(tb => (
            <button key={tb} onClick={() => setTab(tb)} className={`flex-1 py-1.5 rounded-lg text-sm font-medium ${tab === tb ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300'}`}>
              {tb === 'reassign' ? t('attendancePages.logs.correct.existing') : t('attendancePages.logs.correct.createNew')}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {(['staff', 'student'] as const).map(r => (
            <button key={r} onClick={() => { setRole(r); setPicked(null); }} className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${role === r ? 'bg-slate-800 text-white dark:bg-slate-600' : 'bg-gray-100 dark:bg-slate-700 text-gray-500'}`}>
              {r === 'staff' ? t('attendancePages.logs.role.staff') : t('attendancePages.logs.role.learner')}
            </button>
          ))}
        </div>

        {tab === 'reassign' ? (
          <div>
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-900">
              <Search className="w-4 h-4 text-gray-400" />
              <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setPicked(null); }} placeholder={role === 'staff' ? t('attendancePages.logs.correct.searchStaff') : t('attendancePages.logs.correct.searchLearner')} className="flex-1 bg-transparent text-sm outline-none" />
            </div>
            <div className="max-h-40 overflow-y-auto mt-1 divide-y divide-gray-100 dark:divide-gray-700 border border-gray-100 dark:border-gray-700 rounded-lg">
              {searching && <p className="px-2 py-2 text-xs text-gray-400 flex items-center gap-1.5"><RefreshCw className="w-3 h-3 animate-spin" /> {role === 'staff' ? t('attendancePages.logs.correct.searchingStaff') : t('attendancePages.logs.correct.searchingLearners')}</p>}
              {searchErr && <p className="px-2 py-2 text-xs text-rose-500">{searchErr}</p>}
              {!searching && !searchErr && q.trim().length >= 2 && results.length === 0 && (
                <p className="px-2 py-2 text-xs text-gray-400">{role === 'staff' ? t('attendancePages.logs.correct.noStaff', { q: q.trim() }) : t('attendancePages.logs.correct.noLearners', { q: q.trim() })}</p>
              )}
              {!searching && q.trim().length < 2 && <p className="px-2 py-2 text-xs text-gray-400">{t('attendancePages.logs.correct.minLetters')}</p>}
              {results.map((r: any) => (
                <button key={r.id} onClick={() => setPicked(r)} className={`w-full text-start px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-slate-700 ${picked?.id === r.id ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''}`}>
                  {r.name} {r.detail && <span className="text-xs text-gray-400">· {r.detail}</span>}
                </button>
              ))}
            </div>
            {picked && !preview && <p className="mt-1 text-[11px] text-gray-400">{t('attendancePages.logs.correct.checking', { name: picked.name })}</p>}
            {picked && preview && (
              <div className="mt-1.5 p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-[11px] text-indigo-800 dark:text-indigo-200">
                {rich('attendancePages.logs.correct.preview', { events: <span className="font-semibold">{t('attendancePages.logs.correct.events', { count: preview.events })}</span>, from: <span className="font-semibold">{preview.fromName || t('attendancePages.logs.correct.currentOwner')}</span>, to: <span className="font-semibold">{preview.toName || picked.name}</span> }, {
                range: preview.firstDate ? ` (${preview.firstDate}${preview.lastDate && preview.lastDate !== preview.firstDate ? ` → ${preview.lastDate}` : ''})` : '' })}
                
              </div>
            )}
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('attendancePages.logs.correct.reason')} className="w-full mt-2 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-900 text-sm" />
          </div>
        ) : (
          <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={role === 'staff' ? t('attendancePages.logs.correct.newStaff') : t('attendancePages.logs.correct.newLearner')} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-900 text-sm" />
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500">{t('attendancePages.logs.cancel')}</button>
          <button onClick={submit} disabled={busy || (tab === 'reassign' ? !picked : !newName.trim())} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">
            {busy && <RefreshCw className="w-4 h-4 animate-spin" />}{tab === 'create' ? t('attendancePages.logs.correct.createMap') : t('attendancePages.logs.correct.apply')}
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
  const { t, rich, lang, digits, formatNumber } = useI18n();
  const [tab, setTab] = useState<TabKey>('all');
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [deviceSn, setDeviceSn] = useState('');
  const [search, setSearch] = useState('');          // debounced value used in the query
  const [searchInput, setSearchInput] = useState(''); // immediate input value (no refetch per keystroke)
  const [assignTarget, setAssignTarget] = useState<string | null>(null);
  const [correctTarget, setCorrectTarget] = useState<{ deviceUserId: string; name: string | null } | null>(null);
  const [liveFeedOpen, setLiveFeedOpen] = useState(false); // collapsed — data first
  const [classId, setClassId] = useState('');
  const [gender, setGender] = useState('');
  const [residence, setResidence] = useState<'' | 'day' | 'boarding'>('');
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [exportingFormat, setExportingFormat] = useState<'csv' | 'excel' | null>(null);
  const { events: liveEvents, connected: sseConnected } = useLiveFeed();
  const { school } = useSchoolConfig();
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

  // Debounce the search box → the server query (and its SWR key) only changes
  // after the user pauses typing, so keystrokes no longer each round-trip.
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

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
  const allowanceDate = dateFrom || toLocalDateStr();
  const { data: allowanceData, isLoading: allowanceLoading } = useSWR<any>(
    showAllowance ? `/api/attendance/allowance-report?date=${allowanceDate}` : null,
    fetcher2,
  );

  // Build query params
  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set('tab', tab);
    p.set('lang', lang); // server-formatted labels/dates follow the interface language
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
    if (residence) p.set('residence', residence);
    if (timeframe === 'custom') {
      if (customTimeFrom) p.set('time_from', customTimeFrom);
      if (customTimeTo) p.set('time_to', customTimeTo);
    } else if (TIMEFRAMES[timeframe]) {
      p.set('time_from', TIMEFRAMES[timeframe]!.from);
      p.set('time_to', TIMEFRAMES[timeframe]!.to);
    }
    return p.toString();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, tab, page, dateFrom, dateTo, deviceSn, search, classId, gender, residence, timeframe, customTimeFrom, customTimeTo, rowsPerPage, derivedFilter, sortBy, sortDir]);

  const { data, isLoading, mutate } = useSWR<any>(
    `/api/attendance/history?${params}`,
    { refreshInterval: 15000 },
  );

  // Devices for filter
  const { data: devicesData } = useSWR<any>('/api/devices/list');
  const devices = devicesData?.data || [];

  // Table row density (Settings → Attendance → Logs display) — school-wide,
  // not per-browser, so every admin sees the layout the school configured.
  const { data: displaySettings } = useSWR<any>('/api/attendance/settings/logs-display');
  const logsDensity: 'compact' | 'comfortable' | 'spacious' = displaySettings?.density || 'comfortable';

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
      showToast('error', t('attendancePages.logs.detect.noDevices'));
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
          showToast('error', t('attendancePages.logs.detect.failed', { sn, error: runData.error || t('attendancePages.logs.detect.matchingFailed') }));
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
        showToast('success', t('attendancePages.logs.detect.mapped', { count: mapped }));
      }
      if (review > 0) {
        showToast('success', t('attendancePages.logs.detect.review', { count: review }));
        window.location.href = '/attendance/identity-matching';
        return;
      }
      if (mapped === 0 && review === 0) {
        showToast('error', unmatchedLeft > 0
          ? t('attendancePages.logs.detect.noneFound', { count: unmatchedLeft })
          : t('attendancePages.logs.detect.nothing'));
      }
      mutate();
    } finally {
      setDetecting(false);
    }
  }, [deviceSn, devices, mutate, t]);

  const handleExport = useCallback(async (format: 'csv' | 'excel') => {
    setExportingFormat(format);
    try {
      // Export the ENTIRE filtered set (every page for the current day/filters),
      // not just the visible page. Fetch all rows with the same query, page 1,
      // a high limit capped for safety.
      const exportParams = new URLSearchParams(params);
      exportParams.set('page', '1');
      exportParams.set('limit', String(Math.min(50000, Math.max(pagination.total || 0, 1))));
      exportParams.set('export', format); // marks this pull as an audited export (P2)
      const r = await fetch(`/api/attendance/history?${exportParams.toString()}`, { cache: 'no-store' });
      const j = await r.json();
      const allRows = (j?.data || []).map((log: any) => log.presentation).filter(Boolean);
      if (allRows.length === 0) {
        showToast('error', t('attendancePages.logs.export.none'));
        return;
      }
      const scope = tab === 'staff' ? 'Staff' : tab === 'learners' ? 'Learners' : tab === 'unmatched' ? 'Unmatched' : 'All';
      const dateLabel = dateFrom
        ? (dateTo && dateTo !== dateFrom ? `${dateFrom} to ${dateTo}` : dateFrom)
        : 'All dates';
      const heading = [
        (school?.name || 'DRAIS') + ' — Attendance Report',
        `Scope: ${scope}${search ? ` · Search: "${search}"` : ''}${deviceSn ? ` · Device: ${deviceSn}` : ''}`,
        `Dates: ${dateLabel}`,
        `Records: ${allRows.length.toLocaleString()} · Generated: ${new Date().toLocaleString()}`,
      ];
      await AttendanceExportService.exportVisibleRows({
        format,
        filename: `attendance-logs-${tab}-${dateFrom || 'all-time'}${dateTo && dateTo !== dateFrom ? `_to_${dateTo}` : ''}`,
        rows: allRows,
        heading,
      });
      showToast('success', t('attendancePages.logs.export.done', { count: lang === 'ar' ? formatNumber(allRows.length) : allRows.length.toLocaleString(), what: format === 'excel' ? t('attendancePages.logs.export.rowsExcel') : t('attendancePages.logs.export.rowsCsv') }));
    } catch (error) {
      console.error('[Attendance Logs] Export failed:', error);
      showToast('error', t('attendancePages.logs.export.failed'));
    } finally {
      setExportingFormat(null);
    }
  }, [params, pagination.total, dateFrom, dateTo, tab, search, deviceSn, school?.name, t, lang, formatNumber]);

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

  // Selective time correction — shift ONLY the selected punches (for when a
  // subset of people have wrong times, e.g. an AM/PM mix-up, not the whole batch).
  const [timeCorrecting, setTimeCorrecting] = useState(false);
  const handleCorrectSelected = async (shiftMinutes: number, label: string) => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (!window.confirm(t('attendancePages.logs.shift.confirm', { count: ids.length, label }))) return;
    setTimeCorrecting(true);
    try {
      const res = await apiFetch<any>('/api/attendance/time-health', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'correct_selected', ids, shift_minutes: shiftMinutes }),
      });
      showToast('success', t('attendancePages.logs.shift.done', { count: res?.affected ?? ids.length, refreshed: res?.reEvaluated ?? 0 }));
      setSelectedIds(new Set());
      mutate();
    } catch { /* apiFetch surfaces the error toast */ }
    finally { setTimeCorrecting(false); }
  };

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (!window.confirm(t('attendancePages.logs.delete.confirm', { count: ids.length }))) return;
    setDeleting(true);
    try {
      const res = await apiFetch<any>('/api/attendance/logs/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, confirm: true }),
      });
      showToast('success', t('attendancePages.logs.delete.done', { count: res?.deleted ?? ids.length }));
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
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">{t('attendancePages.logs.title')}</h1>
          <span className="text-xs text-gray-400 hidden sm:inline">{t('attendancePages.logs.subtitle')}</span>
        </div>

        {/* ── Live Feed (collapsed by default — data first) ───────────── */}
        <div className="mb-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <button
            onClick={() => setLiveFeedOpen(!liveFeedOpen)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50"
          >
            <div className="flex items-center gap-2">
              <Radio className={`w-4 h-4 ${sseConnected ? 'text-green-500 animate-pulse' : 'text-red-400'}`} />
              <span className="text-sm font-medium">{t('attendancePages.logs.live.title')}</span>
              <span className={`w-2 h-2 rounded-full ${sseConnected ? 'bg-green-500' : 'bg-red-400'}`} />
              <span className="text-xs text-gray-400">
                {sseConnected ? t('attendancePages.logs.live.connected') : t('attendancePages.logs.live.reconnecting')}
              </span>
              {liveEvents.length > 0 && (
                <span className="ms-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 rounded-full">
                  {t('attendancePages.logs.live.new', { count: liveEvents.length })}
                </span>
              )}
            </div>
            {liveFeedOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {liveFeedOpen && (
            <div className="max-h-48 overflow-y-auto border-t border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
              <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-900/40">
                {t('attendancePages.logs.live.note')}
              </div>
              {liveEvents.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-gray-400">
                  {t('attendancePages.logs.live.waiting')}
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
                    <span className="text-amber-600 font-mono text-xs">{ev.presentation?.name || t('attendancePages.dash.uid', { uid: ev.device_user_id })}</span>
                  )}
                  <span className={`px-1.5 py-0.5 rounded text-xs
                    ${ev.person_type === 'student' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                      : ev.person_type === 'staff' ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'}`}>
                    {ev.presentation?.category || (ev.person_type === 'student' ? t('attendancePages.logs.role.learner') : ev.person_type === 'staff' ? t('attendancePages.logs.role.staff') : t('attendancePages.logs.role.unmatched'))}
                  </span>
                  {ev.class_name && <span className="text-xs text-gray-400">{ev.presentation?.className || ev.class_name}</span>}
                  {ev.device_name && <span className="text-xs text-gray-400 ms-auto">{ev.device_name}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Tab Bar ────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2 mb-6">
          {TABS.map(({ key, icon: Icon }) => {
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
                {t(`attendancePages.logs.tab.${key}`)}
                <span className={`ms-1 px-2 py-0.5 text-xs rounded-full
                  ${active
                    ? 'bg-white/20 text-white'
                    : key === 'unmatched' && count > 0
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                      : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400'}`}
                >
                  {lang === 'ar' ? formatNumber(count) : count.toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Filters — collapsed by default: "Filters • N active" + removable chips ── */}
        <div className="mb-3">
          <FilterAccordion
            chips={[
              timeframe !== 'all' ? { key: 'time', label: timeframe === 'custom' ? t('attendancePages.logs.chip.time', { from: customTimeFrom || '…', to: customTimeTo || '…' }) : (TIMEFRAMES[timeframe] ? t(`attendancePages.logs.tf.${timeframe}`) : timeframe), onRemove: () => { setTimeframe('all'); setCustomTimeFrom(''); setCustomTimeTo(''); setPage(1); } } : null,
              derivedFilter ? { key: 'derived', label: t('attendancePages.logs.chip.arrival', { value: derivedFilter === 'ontime' ? t('attendancePages.logs.chip.ontimeEarly') : t(`attendancePages.logs.chip.arrivalValue.${derivedFilter}`, derivedFilter) }), onRemove: () => { setDerivedFilter(''); setPage(1); } } : null,
              deviceSn ? { key: 'device', label: t('attendancePages.logs.chip.device', { name: devices.find((d: any) => d.sn === deviceSn)?.device_name || deviceSn }), onRemove: () => { setDeviceSn(''); setPage(1); } } : null,
              classId ? { key: 'class', label: t('attendancePages.logs.chip.class', { name: classes.find((c: any) => String(c.id) === String(classId))?.name || classId }), onRemove: () => { setClassId(''); setPage(1); } } : null,
              gender ? { key: 'gender', label: gender === 'male' ? t('attendancePages.logs.chip.genderBoys') : t('attendancePages.logs.chip.genderGirls'), onRemove: () => { setGender(''); setPage(1); } } : null,
              residence ? { key: 'res', label: residence === 'boarding' ? t('attendancePages.logs.chip.residenceBoarding') : t('attendancePages.logs.chip.residenceDay'), onRemove: () => { setResidence(''); setPage(1); } } : null,
            ].filter(Boolean) as FilterChip[]}
            onClear={() => {
              setTimeframe('all'); setCustomTimeFrom(''); setCustomTimeTo(''); setDerivedFilter(''); setDeviceSn('');
              setClassId(''); setGender(''); setResidence(''); setPage(1);
            }}
          >
            <FilterField label={t('attendancePages.logs.f.timeOfDay')}>
              <select
                value={timeframe} className={filterInputCls}
                onChange={(e) => {
                  const tf = e.target.value as typeof timeframe; setTimeframe(tf); setPage(1);
                  if (tf !== 'all' && !dateFrom && !dateTo) {
                    const today = toLocalDateStr();
                    setDateFrom(today); setDateTo(today); setDatePreset('today');
                  }
                }}
              >
                <option value="all">{t('attendancePages.logs.f.allDay')}</option>
                <option value="morning">{t('attendancePages.logs.tf.morning')}</option>
                <option value="afternoon">{t('attendancePages.logs.tf.afternoon')}</option>
                <option value="evening">{t('attendancePages.logs.tf.evening')}</option>
                <option value="custom">{t('attendancePages.logs.f.customTime')}</option>
              </select>
              {timeframe === 'custom' && (
                <div className="flex items-center gap-1 mt-1">
                  <input type="time" value={customTimeFrom} onChange={(e) => { setCustomTimeFrom(e.target.value); setPage(1); }} className={filterInputCls} />
                  <span className="text-gray-400 text-xs">→</span>
                  <input type="time" value={customTimeTo} onChange={(e) => { setCustomTimeTo(e.target.value); setPage(1); }} className={filterInputCls} />
                </div>
              )}
            </FilterField>
            <FilterField label={t('attendancePages.logs.f.arrival')}>
              <select value={derivedFilter} onChange={(e) => { setDerivedFilter(e.target.value as any); setPage(1); }} className={filterInputCls}>
                <option value="">{t('attendancePages.logs.f.all')}</option>
                <option value="late">{t('attendancePages.logs.f.lateOnly')}</option>
                <option value="early">{t('attendancePages.logs.f.earlyOnly')}</option>
                <option value="ontime">{t('attendancePages.logs.f.onTimeEarly')}</option>
              </select>
            </FilterField>
            <FilterField label={t('attendancePages.logs.f.residence')}>
              <select value={residence} onChange={(e) => { setResidence(e.target.value as any); setPage(1); }} className={filterInputCls}>
                <option value="">{t('attendancePages.logs.f.allLearners')}</option>
                <option value="day">{t('attendancePages.logs.f.dayScholars')}</option>
                <option value="boarding">{t('attendancePages.logs.f.boarding')}</option>
              </select>
            </FilterField>
            <FilterField label={t('attendancePages.logs.f.gender')}>
              <select value={gender} onChange={(e) => { setGender(e.target.value); setPage(1); }} className={filterInputCls}>
                <option value="">{t('attendancePages.logs.f.all')}</option>
                <option value="male">{t('attendancePages.logs.f.boys')}</option>
                <option value="female">{t('attendancePages.logs.f.girls')}</option>
              </select>
            </FilterField>
            <FilterField label={t('attendancePages.logs.f.class')}>
              <select value={classId} onChange={(e) => { setClassId(e.target.value); setPage(1); }} className={filterInputCls}>
                <option value="">{t('attendancePages.logs.f.allClasses')}</option>
                {classes.map((c: any) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </FilterField>
            <FilterField label={t('attendancePages.logs.f.device')}>
              <select value={deviceSn} onChange={(e) => { setDeviceSn(e.target.value); setPage(1); }} className={filterInputCls}>
                <option value="">{t('attendancePages.logs.f.allDevices')}</option>
                {devices.map((d: any) => (<option key={d.sn || d.id} value={d.sn}>{d.device_name || d.sn}</option>))}
              </select>
            </FilterField>
            <FilterField label={t('attendancePages.logs.f.rowsPerPage')}>
              <select value={rowsPerPage} onChange={(e) => { setRowsPerPage(e.target.value); setPage(1); }} className={filterInputCls}>
                {['10', '20', '50', '100', '250', 'all'].map(n => (<option key={n} value={n}>{n === 'all' ? t('attendancePages.logs.f.allRows') : t('attendancePages.logs.f.nRows', { n })}</option>))}
              </select>
            </FilterField>
          </FilterAccordion>
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
            title={t('attendancePages.logs.bar.date')}
          >
            <option value="all">{t('attendancePages.logs.bar.allTime')}</option>
            {QUICK_DATES.map(q => <option key={q.key} value={q.key}>{t(`attendancePages.logs.quick.${q.key}`)}</option>)}
            <option value="customdate">{t('attendancePages.logs.bar.customRange')}</option>
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


          <div className="relative flex-1 min-w-36 max-w-56">
            <Search className="absolute start-2.5 top-2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text" placeholder={t('attendancePages.logs.bar.search')} value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full ps-8 pe-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-900 text-xs"
            />
          </div>

          <button
            onClick={() => setShowAllowance(v => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${showAllowance
              ? 'bg-emerald-600 text-white'
              : 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'}`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            {t('attendancePages.logs.bar.allowance')}
          </button>

          <div className="relative">
            <button
              onClick={() => setShowActions(v => !v)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              {t('attendancePages.logs.bar.actions')} <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {showActions && (
              <div className="absolute end-0 z-30 mt-1 w-52 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 shadow-lg py-1 text-sm"
                onMouseLeave={() => setShowActions(false)}>
                <button onClick={() => { setShowActions(false); mutate(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-700 text-start">
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> {t('attendancePages.logs.bar.refresh')}
                </button>
                <button onClick={() => { setShowActions(false); handleExport('excel'); }} disabled={exportingFormat !== null}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-700 text-start disabled:opacity-50">
                  <Download className="w-4 h-4" /> {t('attendancePages.logs.bar.exportExcel')}
                </button>
                <button onClick={() => { setShowActions(false); handleExport('csv'); }} disabled={exportingFormat !== null}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-700 text-start disabled:opacity-50">
                  <Download className="w-4 h-4" /> {t('attendancePages.logs.bar.exportCsv')}
                </button>
                <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
                <button onClick={() => { setShowActions(false); setClearConfirmText(''); setShowClearModal(true); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-start">
                  <Trash2 className="w-4 h-4" /> {t('attendancePages.logs.bar.clearAll')}
                </button>
                <button onClick={() => { setShowActions(false); setResetConfirmText(''); setShowResetModal(true); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-start">
                  <Fingerprint className="w-4 h-4" /> {t('attendancePages.logs.bar.resetBio')}
                </button>
              </div>
            )}
          </div>

          {selectedIds.size > 0 && (
            <div className="w-full flex items-center gap-2 pt-1">
              <span className="text-xs text-gray-500 dark:text-gray-400">{t('attendancePages.logs.sel.count', { count: selectedIds.size })}</span>
              {/* Selective time correction — fix only these punches' times */}
              <span className="text-xs text-gray-400 hidden sm:inline">{t('attendancePages.logs.sel.correctTime')}</span>
              <button onClick={() => handleCorrectSelected(12 * 60, t('attendancePages.logs.sel.plus12Label'))} disabled={timeCorrecting}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium disabled:opacity-50" title={t('attendancePages.logs.sel.plus12Title')}>
                {timeCorrecting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />} {t('attendancePages.logs.sel.plus12')}
              </button>
              <button onClick={() => handleCorrectSelected(-12 * 60, t('attendancePages.logs.sel.minus12Label'))} disabled={timeCorrecting}
                className="px-2.5 py-1.5 rounded-lg bg-amber-600/80 hover:bg-amber-700 text-white text-xs font-medium disabled:opacity-50" title={t('attendancePages.logs.sel.minus12Title')}>{t('attendancePages.logs.sel.minus12')}</button>
              <button onClick={() => {
                const h = window.prompt(t('attendancePages.logs.sel.prompt'));
                if (h == null) return;
                const mins = Math.round(parseFloat(h) * 60);
                if (!Number.isFinite(mins) || mins === 0) { showToast('error', t('attendancePages.logs.sel.nonZero')); return; }
                handleCorrectSelected(mins, t('attendancePages.logs.sel.hoursLabel', { sign: mins > 0 ? '+' : '', hours: mins / 60 }));
              }} disabled={timeCorrecting}
                className="px-2.5 py-1.5 rounded-lg border border-amber-500 text-amber-600 dark:text-amber-300 text-xs font-medium disabled:opacity-50">{t('attendancePages.logs.sel.shift')}</button>
              <span className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />
              <button
                onClick={handleDeleteSelected}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium disabled:opacity-50"
              >
                {deleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                {t('attendancePages.logs.sel.delete')}
              </button>
              <button onClick={() => setSelectedIds(new Set())}
                className="px-2 py-1.5 rounded-lg text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                {t('attendancePages.logs.sel.clear')}
              </button>
            </div>
          )}
        </div>
        {/* ── Allowance Eligibility Report ────────────────────────────── */}
        {showAllowance && (
          <div className="card bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 mb-6 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-semibold text-gray-900 dark:text-white">
                {t('attendancePages.logs.allow.title', { date: digits(allowanceDate) })}
              </h2>
              {allowanceData?.summary && (
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="px-2 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-semibold">{t('attendancePages.logs.allow.eligible', { count: allowanceData.summary.eligible })}</span>
                  <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 font-semibold">{t('attendancePages.logs.allow.late', { count: allowanceData.summary.late })}</span>
                  <span className="px-2 py-1 rounded-full bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">{t('attendancePages.logs.allow.absent', { count: allowanceData.summary.absent })}</span>
                  <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{t('attendancePages.logs.allow.missingCheckout', { count: allowanceData.summary.checkoutMissing })}</span>
                </div>
              )}
              <div className="ms-auto flex items-center gap-2">
                <select
                  value={allowanceFilter}
                  onChange={(e) => setAllowanceFilter(e.target.value as any)}
                  className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-900 text-xs"
                >
                  <option value="all">{t('attendancePages.logs.allow.everyone')}</option>
                  <option value="eligible">{t('attendancePages.logs.allow.eligibleOnly')}</option>
                  <option value="rejected">{t('attendancePages.logs.allow.rejectedOnly')}</option>
                </select>
                <a
                  href={`/api/attendance/allowance-report?date=${allowanceDate}&format=csv`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
                >
                  <Download className="w-3.5 h-3.5" /> {t('attendancePages.logs.allow.exportCsv')}
                </a>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('attendancePages.logs.allow.explain')}
              
              
            </p>
            <div className="overflow-x-auto max-h-[28rem] overflow-y-auto border border-gray-100 dark:border-gray-700 rounded-lg">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 dark:bg-slate-900 z-10">
                  <tr>
                    {['Employee', 'Designation', 'Department', 'Arrival', 'Departure', 'Status', 'Allowance'].map(h => (
                      <th key={h} className="px-3 py-2 text-start text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{t(`attendancePages.logs.allow.col.${h}`)}</th>
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
                        <td className="px-3 py-2 font-mono text-gray-900 dark:text-white whitespace-nowrap">{r.arrival ? digits(r.arrival) : '—'}</td>
                        <td className="px-3 py-2 font-mono text-gray-600 dark:text-gray-300 whitespace-nowrap">
                          {(r.departure && digits(r.departure)) || (r.checkoutMissing && r.arrivalStatus !== 'ABSENT'
                            ? <span className="text-amber-600 dark:text-amber-400 text-xs font-sans">{t('attendancePages.logs.allow.missing')}</span> : '—')}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${ARRIVAL_BADGE[r.arrivalStatus] || ''}`}>
                            {t(`attendancePages.logs.allow.status.${r.arrivalStatus}`, r.arrivalStatus.replace('_', ' '))}{r.arrivalStatus === 'LATE' && r.lateMinutes ? t('attendancePages.logs.allow.lateMinutes', { n: r.lateMinutes }) : ''}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {r.allowance
                            ? <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-bold text-xs"><Check className="w-3.5 h-3.5" /> {t('attendancePages.logs.allow.yes')}</span>
                            : <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-bold text-xs"><X className="w-3.5 h-3.5" /> {t('attendancePages.logs.allow.no')}</span>}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── What DRAIS just fixed, and what it could not ─────────────
               The device is offline except when staff connect it to upload
               and print, so this page IS the moment the clock gets checked.
               A correction that happened without saying so would be worse
               than the wrong times — the person printing has to know the
               times moved, and how to put it back. */}
        {Array.isArray(data?.clock_corrections) && data.clock_corrections.length > 0 && (
          <div className="mb-2 px-3 py-2 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-xs">
            {data.clock_corrections.map((c: any) => (
              <div key={`${c.device_sn}-${c.date}`} className="text-emerald-900 dark:text-emerald-200">
                <span className="font-semibold">{t('attendancePages.logs.clock.corrected')}</span>{' '}
                {t('attendancePages.logs.clock.correctedBody', { device: c.device_sn, hours: Math.abs(c.drift_hours), dir: c.drift_hours >= 0 ? t('attendancePages.logs.clock.fast') : t('attendancePages.logs.clock.slow'), date: c.date, punches: t('attendancePages.logs.clock.punches', { count: c.affected }) })}{' '}
                
                <a href="/attendance/time-health" className="underline font-medium">{t('attendancePages.logs.clock.reviewUndo')}</a>
              </div>
            ))}
          </div>
        )}
        {Array.isArray(data?.clock_needs_review) && data.clock_needs_review.length > 0 && (
          <div className="mb-2 px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-xs">
            {data.clock_needs_review.map((c: any) => (
              <div key={`${c.device_sn}-${c.date}`} className="text-amber-900 dark:text-amber-200">
                <span className="font-semibold">{t('attendancePages.logs.clock.noGuess')}</span>{' '}
                {c.reason}{' '}
                <a href="/attendance/time-health" className="underline font-medium">{t('attendancePages.logs.clock.checkBefore')}</a>
              </div>
            ))}
          </div>
        )}

        {/* ── Attention row — anomalies + clock health on ONE compact line
               so alerts never push the table below the fold ───────────── */}
        {(timeAnomaly || recoveryGap) && (
          <div className="mb-2 flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 text-xs">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />
            {timeAnomaly && (
              <span className="text-rose-800 dark:text-rose-200">
                {t('attendancePages.logs.clock.drift', { device: timeAnomaly.device_sn, pct: timeAnomaly.driftConfidence })}{' '}
                <a href="/attendance/time-health" className="underline font-medium">{t('attendancePages.logs.clock.fixTime')}</a>
              </span>
            )}
            {timeAnomaly && recoveryGap && <span className="text-rose-300">·</span>}
            {recoveryGap && (
              <span className="text-rose-800 dark:text-rose-200">
                {t('attendancePages.logs.gap.on', { device: recoveryGap.device_name || recoveryGap.device_sn })}{' '}
                <a href="/attendance/recovery" className="underline font-medium">{t('attendancePages.logs.gap.recover')}</a>
              </span>
            )}
          </div>
        )}

        {/* ── Record count + device clock health, one line ─────────────── */}
        <div className="mb-1.5"><ClockHealthBadges /></div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-sm text-gray-500">
            {t('attendancePages.logs.records', { count: lang === 'ar' ? formatNumber(pagination.total) : pagination.total.toLocaleString() })}
            {tab === 'unmatched' && pagination.total > 0 && (
              <span className="ms-2 text-red-600 font-medium">
                {t('attendancePages.logs.needsIdentity')}
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
                  title={t('attendancePages.logs.detect.title')}
                >
                  {detecting
                    ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> {t('attendancePages.logs.detect.running')}</>
                    : <><Wand2 className="w-3.5 h-3.5" /> {t('attendancePages.logs.detect.button')}</>}
                </button>
                <a
                  href="/attendance/identity-matching"
                  className="text-xs text-violet-600 dark:text-violet-400 hover:underline whitespace-nowrap"
                >
                  {t('attendancePages.logs.reviewQueue')}
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
              {t('attendancePages.logs.loading')}
            </div>
          )}
          {!isLoading && logs.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">{t('attendancePages.logs.noRecords')}</div>
          )}
          {logs.map((log: any) => {
            const presentation = log.presentation;

            return (
            <div key={log.id} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {log.photo_url ? (
                    <MediaImg src={log.photo_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
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
                      <p className="text-xs font-mono text-amber-600 dark:text-amber-400">{presentation?.name || t('attendancePages.dash.uid', { uid: log.device_user_id })}</p>
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
                  {presentation?.attendanceStatus && !!log.derived_event ? (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${DERIVED_CLASS[log.derived_event] ?? 'bg-slate-100 text-slate-600'}`}
                          title={presentation?.statusDetail && presentation.statusDetail !== '—' ? presentation.statusDetail : ''}>
                      {presentation.attendanceStatus}
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500" title={t('attendancePages.logs.awaiting')}>{t('attendancePages.logs.scan')}</span>
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
                  {presentation?.category || (log.person_type === 'student' ? t('attendancePages.logs.role.learner') : log.person_type === 'staff' ? t('attendancePages.logs.role.staff') : t('attendancePages.logs.role.unmatched'))}
                </span>
                <div className="flex items-center gap-1.5">
                  {log.matched && !log.is_provisional ? (
                    <span className="flex items-center gap-0.5 text-green-600 text-[10px] font-medium">
                      <UserCheck className="w-3 h-3" /> {presentation?.matchStatus || t('attendancePages.logs.matched')}
                    </span>
                  ) : (
                    <span className="flex items-center gap-0.5 text-red-500 text-[10px] font-medium">
                      <AlertTriangle className="w-3 h-3" /> {log.is_provisional ? t('attendancePages.logs.provisional') : (presentation?.matchStatus || t('attendancePages.logs.role.unmatched'))}
                    </span>
                  )}
                  <ProvisionalBadge isProvisional={log.is_provisional} />
                  <ConfidenceBadge confidence={log.confidence} />
                </div>
                {tab === 'unmatched' && (
                  <button
                    onClick={() => setAssignTarget(log.device_user_id)}
                    className="ms-auto flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors"
                  >
                    <UserPlus className="w-3 h-3" /> {t('attendancePages.logs.assign.button')}
                  </button>
                )}
              </div>
            </div>
          )})}
        </div>

        {/* ── Table (sm+) ────────────────────────────────────────────── */}
        {/* Row density is school-configured (Settings → Attendance → Logs
            display), not hardcoded — a scoped CSS override beats rewriting
            every td/th's Tailwind classes, and its specificity (class+tag)
            reliably beats the plain utility classes on the cells. */}
        <style jsx>{`
          .logs-density-compact :global(td),
          .logs-density-compact :global(th) { padding-top: 0.25rem; padding-bottom: 0.25rem; font-size: 0.75rem; }
          .logs-density-spacious :global(td),
          .logs-density-spacious :global(th) { padding-top: 1.25rem; padding-bottom: 1.25rem; }
        `}</style>
        <div className={`hidden sm:block bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700
          rounded-xl overflow-hidden shadow-sm logs-density-${logsDensity}`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-900/50">
                <tr>
                  <th className="ps-4 pe-1 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      className="rounded border-gray-300 dark:border-gray-600"
                      title={t('attendancePages.logs.selectAllPage')}
                    />
                  </th>
                  {([
                    { key: 'time', label: t('attendancePages.logs.col.time'), cls: '' },
                    { key: 'name', label: t('attendancePages.logs.col.name'), cls: '' },
                    { key: 'type', label: t('attendancePages.logs.col.category'), cls: '' },
                    { key: null, label: t('attendancePages.logs.col.class'), cls: ' hidden md:table-cell' },
                    { key: null, label: t('attendancePages.logs.col.section'), cls: ' hidden md:table-cell' },
                    { key: 'pin', label: t('attendancePages.logs.col.deviceId'), cls: ' hidden lg:table-cell' },
                    { key: null, label: t('attendancePages.logs.col.verification'), cls: ' hidden lg:table-cell' },
                    { key: 'status', label: t('attendancePages.logs.col.status'), cls: '' },
                    { key: null, label: t('attendancePages.logs.col.match'), cls: '' },
                  ] as Array<{ key: string | null; label: string; cls: string }>).map((col) => (
                    <th
                      key={col.label}
                      onClick={col.key ? () => toggleSort(col.key!) : undefined}
                      className={`px-4 py-3 text-start text-xs font-semibold text-gray-500 uppercase${col.cls} ${
                        col.key ? 'cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-300' : ''
                      }`}
                      title={col.key ? t('attendancePages.logs.sortBy', { col: lang === 'ar' ? col.label : col.label.toLowerCase() }) : undefined}
                    >
                      <span className="inline-flex items-center gap-0.5">
                        {col.label}
                        {col.key && (
                          <span className="flex flex-col -space-y-1.5 ms-0.5">
                            <ChevronUp className={`w-3 h-3 ${sortBy === col.key && sortDir === 'asc' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-300 dark:text-gray-600'}`} />
                            <ChevronDown className={`w-3 h-3 ${sortBy === col.key && sortDir === 'desc' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-300 dark:text-gray-600'}`} />
                          </span>
                        )}
                      </span>
                    </th>
                  ))}
                  {tab === 'unmatched' && (
                    <th className="px-4 py-3 text-start text-xs font-semibold text-gray-500 uppercase">{t('attendancePages.logs.col.action')}</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {isLoading && logs.length === 0 && (
                  <tr>
                    <td colSpan={tab === 'unmatched' ? 11 : 10} className="px-4 py-12 text-center text-gray-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                      {t('attendancePages.logs.loading')}
                    </td>
                  </tr>
                )}
                {!isLoading && logs.length === 0 && (
                  <tr>
                    <td colSpan={tab === 'unmatched' ? 11 : 10} className="px-4 py-12 text-center text-gray-400">
                      {t('attendancePages.logs.noRecordsFilter')}
                      {t('attendancePages.logs.tryLive')} <br></br>
                      {liveEvents.map((ev, i) => (
                        <div key={`${ev.id}-${i}`} className="flex items-center gap-3 px-4 py-2 text-sm">
                          <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="text-gray-500 text-xs whitespace-nowrap">
                            {ev.presentation?.time || '—'}
                          </span>
                          {ev.person_name ? (
                            <span className="font-medium">{ev.presentation?.name || ev.person_name}</span>
                          ) : (
                            <span className="text-amber-600 font-mono text-xs">{ev.presentation?.name || t('attendancePages.dash.uid', { uid: ev.device_user_id })}</span>
                          )}
                          <span className={`px-1.5 py-0.5 rounded text-xs
                            ${ev.person_type === 'student' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                              : ev.person_type === 'staff' ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'}`}>
                            {ev.presentation?.category || (ev.person_type === 'student' ? t('attendancePages.logs.role.learner') : ev.person_type === 'staff' ? t('attendancePages.logs.role.staff') : t('attendancePages.logs.role.unmatched'))}
                          </span>
                          {ev.class_name && <span className="text-xs text-gray-400">{ev.presentation?.className || ev.class_name}</span>}
                          {ev.device_name && <span className="text-xs text-gray-400 ms-auto">{ev.device_name}</span>}
                        </div>
                      ))}
                    </td>
                  </tr>
                )}
                {logs.map((log: any) => {
                  const presentation = log.presentation;

                  return (
                  <tr key={log.id} className={`hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors ${selectedIds.has(log.id) ? 'bg-red-50/60 dark:bg-red-900/10' : ''}`}>
                    <td className="ps-4 pe-1 py-3 w-8">
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
                          title={t('attendancePages.logs.trace')}
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
                            <MediaImg
                              src={log.photo_url}
                              alt=""
                              className="w-8 h-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-xs font-bold text-blue-600">
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
                          {presentation?.name || t('attendancePages.dash.uid', { uid: log.device_user_id })}
                          <span className="text-xs ms-1 text-gray-400">{t('attendancePages.logs.unassigned')}</span>
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
                        {presentation?.category || (log.person_type === 'student' ? t('attendancePages.logs.role.learner')
                          : log.person_type === 'staff' ? t('attendancePages.logs.role.staff')
                            : t('attendancePages.logs.role.unmatched'))}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 hidden md:table-cell">
                      {presentation?.className || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm hidden md:table-cell">
                      {log.person_type === 'student' ? (
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          log.residency_status === 'boarding'
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                            : log.residency_status === 'day'
                              ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                        }`}>
                          {presentation?.residence || t('attendancePages.logs.notSet')}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-500 hidden lg:table-cell">
                      {digits(presentation?.deviceId || log.device_user_id)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 hidden lg:table-cell">
                      {presentation?.verificationMethod || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {/* DERIVED attendance meaning from the state engine */}
                      {presentation?.attendanceStatus && !!log.derived_event ? (
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
                          <span className="flex items-center gap-1">
                            <SmsPill status={log.sms_status} matched={log.matched} isProvisional={log.is_provisional} />
                            {log.person_type === 'student' && (
                              <ResendSmsButton status={log.sms_status} studentId={log.person_id} date={(log.check_time || '').slice(0, 10)} />
                            )}
                          </span>
                        </div>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-500" title={t('attendancePages.logs.awaitingDay')}>{t('attendancePages.logs.scan')}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {log.matched && !log.is_provisional ? (
                          <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                            <UserCheck className="w-3.5 h-3.5" /> {presentation?.matchStatus || t('attendancePages.logs.matched')}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-500 text-xs font-medium">
                            <AlertTriangle className="w-3.5 h-3.5" /> {log.is_provisional ? t('attendancePages.logs.provisional') : (presentation?.matchStatus || t('attendancePages.logs.role.unmatched'))}
                          </span>
                        )}
                        <ProvisionalBadge isProvisional={log.is_provisional} />
                        <ConfidenceBadge confidence={log.confidence} />
                        {log.matched && log.person_id && (
                          <button
                            onClick={() => setCorrectTarget({ deviceUserId: log.device_user_id, name: log.person_name })}
                            title={t('attendancePages.logs.correctTitle')}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 hover:text-indigo-600"
                          >{t('attendancePages.logs.correctButton')}</button>
                        )}
                      </div>
                    </td>
                    {tab === 'unmatched' && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setAssignTarget(log.device_user_id)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          {t('attendancePages.logs.assign.button')}
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
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-900/30">
              <p className="text-sm text-gray-500">
                {t('attendancePages.logs.showing', { from: (pagination.page - 1) * (pagination.limit || logs.length) + 1, to: Math.min(pagination.page * (pagination.limit || logs.length), pagination.total), total: lang === 'ar' ? formatNumber(pagination.total) : Number(pagination.total).toLocaleString() })}
                
                
                
                {pagination.totalPages > 1 && <>{t('attendancePages.logs.pageOf', { page: pagination.page, pages: pagination.totalPages })}</>}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4 rtl-flip" />
                </button>
                <button
                  onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
                  disabled={page >= pagination.totalPages}
                  className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-50"
                >
                  <ChevronRight className="w-4 h-4 rtl-flip" />
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
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('attendancePages.logs.clear.title')}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  {t('attendancePages.logs.schoolOnly')}
                </p>
              </div>
            </div>

            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-800 dark:text-red-200 font-medium">
                {t('attendancePages.logs.clear.warning')}
                
              </p>
              <ul className="mt-2 text-xs text-red-700 dark:text-red-300 list-disc list-inside space-y-0.5">
                <li>{t('attendancePages.logs.clear.kept')}</li>
                <li>{t('attendancePages.logs.clear.exportFirst')}</li>
                <li>{t('attendancePages.logs.clear.matching', { count: pagination.total })}</li>
              </ul>
            </div>

            <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
              {rich('attendancePages.logs.typeToConfirm', { word: <span className="font-mono font-bold">CLEAR</span> })}
            </label>
            <input
              type="text"
              value={clearConfirmText}
              onChange={(e) => setClearConfirmText(e.target.value)}
              placeholder="CLEAR"
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900 text-sm mb-4 focus:ring-2 focus:ring-red-500"
            />

            <div className="flex gap-3">
              <button
                onClick={() => { setShowClearModal(false); setClearConfirmText(''); }}
                disabled={clearing}
                className="flex-1 py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                {t('attendancePages.logs.cancel')}
              </button>
              <button
                onClick={handleClearLogs}
                disabled={clearing || clearConfirmText.trim().toUpperCase() !== 'CLEAR'}
                className="flex-1 py-2 px-4 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {clearing ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> {t('attendancePages.logs.clear.busy')}</>
                ) : (
                  <><Trash2 className="w-4 h-4" /> {t('attendancePages.logs.clear.button')}</>
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
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('attendancePages.logs.reset.title')}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  {t('attendancePages.logs.schoolOnly')}
                </p>
              </div>
            </div>

            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-800 dark:text-red-200 font-medium">
                {t('attendancePages.logs.reset.warning')}
                
              </p>
              <ul className="mt-2 text-xs text-red-700 dark:text-red-300 list-disc list-inside space-y-0.5">
                <li>{t('attendancePages.logs.reset.l1')}</li>
                <li>{t('attendancePages.logs.reset.l2')}</li>
                <li>{t('attendancePages.logs.reset.l3')}</li>
                <li>{t('attendancePages.logs.reset.l4')}</li>
              </ul>
            </div>

            <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
              {rich('attendancePages.logs.typeToConfirm', { word: <span className="font-mono font-bold">RESET</span> })}
            </label>
            <input
              type="text"
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              placeholder="RESET"
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900 text-sm mb-4 focus:ring-2 focus:ring-red-500"
            />

            <div className="flex gap-3">
              <button
                onClick={() => { setShowResetModal(false); setResetConfirmText(''); }}
                disabled={resetting}
                className="flex-1 py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                {t('attendancePages.logs.cancel')}
              </button>
              <button
                onClick={handleResetBiometrics}
                disabled={resetting || resetConfirmText.trim().toUpperCase() !== 'RESET'}
                className="flex-1 py-2 px-4 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {resetting ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> {t('attendancePages.logs.reset.busy')}</>
                ) : (
                  <><Fingerprint className="w-4 h-4" /> {t('attendancePages.logs.reset.button')}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
