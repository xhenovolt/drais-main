"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Users, UserCheck, Briefcase, AlertTriangle, Activity,
  Search, Filter, RefreshCw, ChevronLeft, ChevronRight,
  Fingerprint, Download, UserPlus, X, Check, Clock,
  Radio, ChevronDown, ChevronUp,
} from 'lucide-react';
import useSWR from 'swr';
import { showToast } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';

// ── Helpers ────────────────────────────────────────────────────────────────
const verifyLabel = (v: number | null) => {
  const map: Record<number, string> = { 0: 'Password', 1: 'Fingerprint', 2: 'Card', 15: 'Face' };
  return v != null ? map[v] ?? `Type ${v}` : '—';
};
const ioLabel = (m: number | null) => {
  const map: Record<number, string> = { 0: 'Check-in', 1: 'Check-out', 2: 'Break Out', 3: 'Break In' };
  return m != null ? map[m] ?? `Mode ${m}` : '—';
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
  const today = new Date().toISOString().split('T')[0];
  const [tab, setTab] = useState<TabKey>('all');
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [deviceSn, setDeviceSn] = useState('');
  const [search, setSearch] = useState('');
  const [assignTarget, setAssignTarget] = useState<string | null>(null);
  const [liveFeedOpen, setLiveFeedOpen] = useState(true);
  const [classId, setClassId] = useState('');
  const [gender, setGender] = useState('');
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
    `/api/attendance/unified?${params}`,
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

  const handleTabChange = useCallback((key: TabKey) => {
    setTab(key);
    setPage(1);
  }, []);

  const handleExport = () => {
    const csvRows = [
      'Time,Person,Type,Class,Device User ID,Device,Verify,IO Mode,Matched',
      ...logs.map((l: any) =>
        [
          l.check_time,
          l.person_name || `UID: ${l.device_user_id}`,
          l.person_type,
          l.class_name || '',
          l.device_user_id,
          l.device_name || l.device_sn,
          verifyLabel(l.verify_type),
          ioLabel(l.io_mode),
          l.matched ? 'Yes' : 'No',
        ].join(','),
      ),
    ].join('\n');
    const blob = new Blob([csvRows], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `attendance-${tab}-${dateFrom}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('success', 'CSV exported');
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
            Human-readable logs from biometric devices — single source of truth
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
              {liveEvents.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-gray-400">
                  Waiting for new attendance events...
                </p>
              )}
              {liveEvents.map((ev, i) => (
                <div key={`${ev.id}-${i}`} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span className="text-gray-500 text-xs whitespace-nowrap">
                    {ev.check_time ? new Date(ev.check_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                  </span>
                  {ev.person_name ? (
                    <span className="font-medium">{ev.person_name}</span>
                  ) : (
                    <span className="text-amber-600 font-mono text-xs">UID: {ev.device_user_id}</span>
                  )}
                  <span className={`px-1.5 py-0.5 rounded text-xs
                    ${ev.person_type === 'student' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                      : ev.person_type === 'staff' ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'}`}>
                    {ev.person_type === 'student' ? 'Learner' : ev.person_type === 'staff' ? 'Staff' : 'Unmatched'}
                  </span>
                  {ev.class_name && <span className="text-xs text-gray-400">{ev.class_name}</span>}
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
              onClick={handleExport}
              className="flex items-center gap-1 px-3 py-2 text-sm border border-gray-300
                dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              <Download className="w-4 h-4" />
              Export CSV
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
          {logs.map((log: any) => (
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
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{log.person_name}</p>
                    ) : (
                      <p className="text-xs font-mono text-amber-600 dark:text-amber-400">UID: {log.device_user_id}</p>
                    )}
                    {log.class_name && (
                      <p className="text-xs text-gray-400 truncate">{log.class_name}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {log.check_time ? new Date(log.check_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    log.io_mode === 0
                      ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                  }`}>{ioLabel(log.io_mode)}</span>
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
                  {log.person_type === 'student' ? 'Learner' : log.person_type === 'staff' ? 'Staff' : 'Unmatched'}
                </span>
                {log.matched ? (
                  <span className="flex items-center gap-0.5 text-green-600 text-[10px] font-medium">
                    <UserCheck className="w-3 h-3" /> Matched
                  </span>
                ) : (
                  <span className="flex items-center gap-0.5 text-red-500 text-[10px] font-medium">
                    <AlertTriangle className="w-3 h-3" /> Unmatched
                  </span>
                )}
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
          ))}
        </div>

        {/* ── Table (sm+) ────────────────────────────────────────────── */}
        <div className="hidden sm:block bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700
          rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Person</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Class</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Device UID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Verify</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">IO</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
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
                    </td>
                  </tr>
                )}
                {logs.map((log: any) => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        {log.check_time ? new Date(log.check_time).toLocaleTimeString([], {
                          hour: '2-digit', minute: '2-digit', second: '2-digit',
                        }) : '—'}
                      </div>
                      <span className="text-xs text-gray-400">
                        {log.check_time ? new Date(log.check_time).toLocaleDateString() : ''}
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
                          <span className="text-sm font-medium">{log.person_name}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-amber-600 dark:text-amber-400 font-mono">
                          UID: {log.device_user_id}
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
                        {log.person_type === 'student' ? 'Learner'
                          : log.person_type === 'staff' ? 'Staff'
                            : 'Unmatched'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 hidden md:table-cell">
                      {log.class_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-500 hidden lg:table-cell">
                      {log.device_user_id}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 hidden lg:table-cell">
                      {verifyLabel(log.verify_type)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-0.5 rounded text-xs
                        ${log.io_mode === 0
                          ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'}`}>
                        {ioLabel(log.io_mode)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {log.matched ? (
                        <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                          <UserCheck className="w-3.5 h-3.5" /> Matched
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-500 text-xs font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" /> Unmatched
                        </span>
                      )}
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
                ))}
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
    </div>
  );
}
