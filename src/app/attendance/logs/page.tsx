"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Users, UserCheck, Briefcase, AlertTriangle, Activity,
  Search, RefreshCw, ChevronLeft, ChevronRight,
  Fingerprint, Download, UserPlus, X, Check, Clock,
  Radio, ChevronDown, ChevronUp, Trash2,
} from 'lucide-react';
import useSWR from 'swr';
import { showToast } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';
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
function ProvisionalBadge({ isProvisional }: { isProvisional?: boolean | null }) {
  if (!isProvisional) return null;
  return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">Provisional</span>;
}
function SmsPill({ status, matched, isProvisional }: { status: string | null; matched: number | boolean; isProvisional?: boolean | null }) {
  if (!matched || isProvisional) return <span className="text-[10px] text-gray-400">SMS: skipped</span>;
  if (!status) return <span className="text-[10px] text-gray-400">SMS: none</span>;
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${SMS_CLASS[status] ?? 'bg-gray-100 text-gray-500'}`}>{SMS_LABEL[status] ?? `SMS ${status}`}</span>;
}

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
  const [liveFeedOpen, setLiveFeedOpen] = useState(true);
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

  // Build query params
  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set('tab', tab);
    p.set('page', String(page));
    p.set('limit', '50');
    if (dateFrom) p.set('date_from', dateFrom);
    if (dateTo) p.set('date_to', dateTo);
    if (deviceSn) p.set('device_sn', deviceSn);
    if (search) p.set('search', search);
    if (classId) p.set('class_id', classId);
    if (gender) p.set('gender', gender);
    return p.toString();
  }, [tab, page, dateFrom, dateTo, deviceSn, search, classId, gender]);

  const { data, isLoading, mutate } = useSWR<any>(
    `/api/attendance/history?${params}`,
    { refreshInterval: 15000 },
  );

  // Devices for filter
  const { data: devicesData } = useSWR<any>('/api/devices/list');
  const devices = devicesData?.data || [];

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100
      dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600
            bg-clip-text text-transparent flex items-center gap-3">
            <Fingerprint className="w-8 h-8 text-blue-600" />
            Attendance Logs
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Human-readable logs from biometric devices — persisted history
          </p>
        </div>

        {/* ── Live Feed ──────────────────────────────────────────────── */}
        <div className="mb-6 bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
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

        {/* ── Filters ────────────────────────────────────────────────── */}
        <div className="card bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700
          rounded-xl p-4 mb-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                bg-white dark:bg-slate-900 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                bg-white dark:bg-slate-900 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Device</label>
            <select
              value={deviceSn}
              onChange={(e) => { setDeviceSn(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                bg-white dark:bg-slate-900 text-sm"
            >
              <option value="">All Devices</option>
              {devices.map((d: any) => (
                <option key={d.sn || d.id} value={d.sn}>{d.device_name || d.sn}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Class</label>
            <select
              value={classId}
              onChange={(e) => { setClassId(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                bg-white dark:bg-slate-900 text-sm"
            >
              <option value="">All Classes</option>
              {classes.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Gender</label>
            <select
              value={gender}
              onChange={(e) => { setGender(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                bg-white dark:bg-slate-900 text-sm"
            >
              <option value="">All</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Name or User ID..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                  bg-white dark:bg-slate-900 text-sm"
              />
            </div>
          </div>
        </div>
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          Leave the date filters blank to show all saved attendance logs. The live panel above is only for new punches arriving right now.
        </p>

        {/* ── Toolbar ────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-500">
            {pagination.total.toLocaleString()} records
            {tab === 'unmatched' && pagination.total > 0 && (
              <span className="ml-2 text-red-600 font-medium">
                — requires identity assignment
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => mutate()}
              className="flex items-center gap-1 px-3 py-2 text-sm border border-gray-300
                dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => handleExport('excel')}
              disabled={exportingFormat !== null}
              className="flex items-center gap-1 px-3 py-2 text-sm border border-gray-300
                dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              {exportingFormat === 'excel' ? 'Exporting…' : 'Export Visible Excel'}
            </button>
            <button
              onClick={() => handleExport('csv')}
              disabled={exportingFormat !== null}
              className="flex items-center gap-1 px-3 py-2 text-sm border border-gray-300
                dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              {exportingFormat === 'csv' ? 'Exporting…' : 'Export Visible CSV'}
            </button>
            <button
              onClick={() => { setClearConfirmText(''); setShowClearModal(true); }}
              className="flex items-center gap-1 px-3 py-2 text-sm border border-red-300
                dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg
                hover:bg-red-50 dark:hover:bg-red-900/30"
              title="Permanently delete all attendance logs for this school"
            >
              <Trash2 className="w-4 h-4" />
              Clear Logs
            </button>
            <button
              onClick={() => { setResetConfirmText(''); setShowResetModal(true); }}
              className="flex items-center gap-1 px-3 py-2 text-sm border border-red-300
                dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg
                hover:bg-red-50 dark:hover:bg-red-900/30"
              title="Unmap every device PIN for this school (clears biometric enrollments + mappings)"
            >
              <Fingerprint className="w-4 h-4" />
              Reset Biometrics
            </button>
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Class</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Device ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Verification Method</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Attendance Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Match Status</th>
                  {tab === 'unmatched' && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Action</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {isLoading && logs.length === 0 && (
                  <tr>
                    <td colSpan={tab === 'unmatched' ? 9 : 8} className="px-4 py-12 text-center text-gray-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                      Loading...
                    </td>
                  </tr>
                )}
                {!isLoading && logs.length === 0 && (
                  <tr>
                    <td colSpan={tab === 'unmatched' ? 9 : 8} className="px-4 py-12 text-center text-gray-400">
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
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        {presentation?.time || '—'}
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
                          <span className="text-sm font-medium">{presentation?.name || log.person_name}</span>
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
                          <span className={`inline-block w-fit px-2 py-0.5 rounded text-xs font-medium ${DERIVED_CLASS[log.derived_event] ?? 'bg-slate-100 text-slate-600'}`}>
                            {presentation.attendanceStatus}
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
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t
              border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-900/30">
              <p className="text-sm text-gray-500">
                Page {pagination.page} of {pagination.totalPages}
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
