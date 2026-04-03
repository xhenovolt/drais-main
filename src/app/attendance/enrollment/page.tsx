'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import useSWR from 'swr';
import {
  Fingerprint, Users, CheckCircle, AlertTriangle, Loader,
  RefreshCw, Wifi, WifiOff, ChevronDown, ChevronRight,
  UserPlus, Zap, Clock,
} from 'lucide-react';
import { showToast } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';

/* ── Types ──────────────────────────────────────────────────────── */

interface Student {
  student_id: number;
  first_name: string;
  last_name: string;
  admission_no: string | null;
  has_fingerprint: boolean;
  has_mapping: boolean;
  device_pin: string | null;
}

interface ClassGroup {
  class_id: number;
  class_name: string;
  students: Student[];
  enrolled: number;
  total: number;
  synced: number;
}

interface Capture {
  student_id: number;
  first_name: string;
  last_name: string;
  finger_position: string;
  hand: string;
  enrollment_timestamp: string;
}

interface Device {
  id: number;
  serial_number: string;
  device_name: string | null;
  connection_status: string;
}

/* ── Component ──────────────────────────────────────────────────── */

export default function EnrollmentStationPage() {
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [syncing, setSyncing] = useState(false);
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());
  const prevCaptureCount = useRef(0);

  // Fetch devices
  const { data: devData } = useSWR<any>('/api/attendance/zk/devices', { refreshInterval: 30000 });
  const devices: Device[] = (devData?.data || []);
  const onlineDevices = devices.filter(d => d.connection_status === 'online');

  // Auto-select first online device
  useEffect(() => {
    if (!selectedDevice && onlineDevices.length > 0) {
      setSelectedDevice(onlineDevices[0].serial_number);
    }
  }, [onlineDevices, selectedDevice]);

  // Fetch enrollment data — auto-refresh every 5s to catch new captures
  const { data: enrollData, isLoading, mutate } = useSWR<any>(
    selectedDevice ? `/api/attendance/enrollment-station?device_sn=${selectedDevice}` : null,
    { refreshInterval: 5000 },
  );

  const classes: ClassGroup[] = enrollData?.data?.classes || [];
  const summary = enrollData?.data?.summary || { total_students: 0, total_enrolled: 0, total_synced: 0, total_pending: 0 };
  const recentCaptures: Capture[] = enrollData?.data?.recent_captures || [];

  // Sound chime when new capture arrives
  useEffect(() => {
    if (recentCaptures.length > prevCaptureCount.current && prevCaptureCount.current > 0) {
      playChime();
    }
    prevCaptureCount.current = recentCaptures.length;
  }, [recentCaptures.length]);

  const toggleClass = (className: string) => {
    setExpandedClasses(prev => {
      const s = new Set(prev);
      if (s.has(className)) s.delete(className); else s.add(className);
      return s;
    });
  };

  const handleBulkSync = useCallback(async () => {
    if (!selectedDevice) return;
    setSyncing(true);
    try {
      const res = await apiFetch('/api/attendance/enrollment-station', {
        method: 'POST',
        body: JSON.stringify({ action: 'bulk_sync', device_sn: selectedDevice }),
      });
      if (res.queued > 0) {
        showToast('success', `${res.queued} identities queued for sync. Device will process them on next heartbeats.`);
      } else {
        showToast('info', `All students already synced (${res.already_synced} mapped).`);
      }
      mutate();
    } catch (err: any) {
      showToast('error', err?.message || 'Bulk sync failed');
    } finally {
      setSyncing(false);
    }
  }, [selectedDevice, mutate]);

  const pctEnrolled = summary.total_students > 0
    ? Math.round((summary.total_enrolled / summary.total_students) * 100)
    : 0;
  const pctSynced = summary.total_students > 0
    ? Math.round((summary.total_synced / summary.total_students) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100
      dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900">
      <div className="container mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600
              bg-clip-text text-transparent flex items-center gap-3">
              <Fingerprint className="w-8 h-8 text-blue-600" />
              Enrollment Station
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
              Bulk fingerprint enrollment — sync identities, then enroll locally on device
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Device selector */}
            <select
              value={selectedDevice}
              onChange={e => setSelectedDevice(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                bg-white dark:bg-slate-800 text-sm"
            >
              <option value="">Select device…</option>
              {devices.map(d => (
                <option key={d.serial_number} value={d.serial_number}>
                  {d.connection_status === 'online' ? '🟢' : '🔴'} {d.device_name || d.serial_number}
                </option>
              ))}
            </select>

            <button onClick={() => mutate()} disabled={isLoading}
              className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700">
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <SummaryCard
            label="Total Students"
            value={summary.total_students}
            icon={<Users className="w-5 h-5 text-blue-500" />}
          />
          <SummaryCard
            label="Synced to Device"
            value={`${summary.total_synced} (${pctSynced}%)`}
            icon={<UserPlus className="w-5 h-5 text-indigo-500" />}
            subtext={summary.total_synced < summary.total_students ? 'Needs bulk sync' : 'All synced'}
          />
          <SummaryCard
            label="Fingerprints Captured"
            value={`${summary.total_enrolled} (${pctEnrolled}%)`}
            icon={<Fingerprint className="w-5 h-5 text-emerald-500" />}
          />
          <SummaryCard
            label="Pending Enrollment"
            value={summary.total_pending}
            icon={<AlertTriangle className="w-5 h-5 text-amber-500" />}
          />
        </div>

        {/* Action bar */}
        {selectedDevice && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-800 dark:text-gray-200">Step 1: Sync Identities</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Push all student names to the device so they appear in the enrollment menu.
                  {summary.total_synced < summary.total_students &&
                    ` ${summary.total_students - summary.total_synced} students need syncing.`}
                </p>
              </div>
              <button
                onClick={handleBulkSync}
                disabled={syncing || !selectedDevice}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600
                  text-white font-medium rounded-lg hover:from-indigo-600 hover:to-purple-700
                  disabled:opacity-50 disabled:cursor-not-allowed shadow-md text-sm whitespace-nowrap"
              >
                {syncing ? <Loader className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {syncing ? 'Syncing…' : 'Sync All Identities'}
              </button>
            </div>

            <div className="mt-4 border-t border-gray-100 dark:border-gray-700 pt-4">
              <h3 className="font-semibold text-gray-800 dark:text-gray-200">Step 2: Enroll Fingerprints on Device</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                On the K40 Pro: Menu → User Mgt → select a user by PIN → Enroll FP → student places finger 3×.
                Templates auto-sync back here. This page refreshes every 5 seconds.
              </p>
            </div>
          </div>
        )}

        {/* Progress bar */}
        {summary.total_students > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Enrollment Progress</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {summary.total_enrolled}/{summary.total_students} ({pctEnrolled}%)
              </span>
            </div>
            <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-green-500 rounded-full transition-all duration-500"
                style={{ width: `${pctEnrolled}%` }}
              />
            </div>
          </div>
        )}

        {/* Live capture feed */}
        {recentCaptures.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-emerald-200 dark:border-emerald-800 p-4">
            <h3 className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4" />
              Recent Captures (Last Hour)
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {recentCaptures.map((c, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
                  <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    {c.first_name} {c.last_name}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {c.hand} {c.finger_position}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
                    {new Date(c.enrollment_timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Class list */}
        {!selectedDevice ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <Fingerprint className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>Select a device above to start</p>
          </div>
        ) : isLoading ? (
          <div className="text-center py-12">
            <Loader className="w-8 h-8 animate-spin mx-auto text-blue-500" />
          </div>
        ) : (
          <div className="space-y-3">
            {classes.map(cls => {
              const isExpanded = expandedClasses.has(cls.class_name);
              const classPct = cls.total > 0 ? Math.round((cls.enrolled / cls.total) * 100) : 0;
              const allDone = cls.enrolled === cls.total;

              return (
                <div key={cls.class_name}
                  className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  {/* Class header — click to expand */}
                  <button
                    onClick={() => toggleClass(cls.class_name)}
                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                      <span className="font-semibold text-gray-800 dark:text-gray-200">{cls.class_name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                        {cls.total} students
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {allDone && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${allDone
                              ? 'bg-emerald-500'
                              : classPct > 50 ? 'bg-blue-500' : 'bg-amber-500'}`}
                            style={{ width: `${classPct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 w-12 text-right">
                          {cls.enrolled}/{cls.total}
                        </span>
                      </div>
                    </div>
                  </button>

                  {/* Expanded students list */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 dark:border-gray-700">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-slate-700/50 text-left text-xs text-gray-500 dark:text-gray-400 uppercase">
                            <th className="px-4 py-2">PIN</th>
                            <th className="px-4 py-2">Name</th>
                            <th className="px-4 py-2">Adm No</th>
                            <th className="px-4 py-2 text-center">Synced</th>
                            <th className="px-4 py-2 text-center">Fingerprint</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                          {cls.students.map(s => (
                            <tr key={s.student_id}
                              className={s.has_fingerprint
                                ? 'bg-emerald-50/50 dark:bg-emerald-900/10'
                                : ''}>
                              <td className="px-4 py-2 text-gray-600 dark:text-gray-400 font-mono text-xs">
                                {s.device_pin || '—'}
                              </td>
                              <td className="px-4 py-2 font-medium text-gray-800 dark:text-gray-200">
                                {s.first_name} {s.last_name}
                              </td>
                              <td className="px-4 py-2 text-gray-500 dark:text-gray-400">
                                {s.admission_no || '—'}
                              </td>
                              <td className="px-4 py-2 text-center">
                                {s.has_mapping
                                  ? <CheckCircle className="w-4 h-4 text-indigo-500 mx-auto" />
                                  : <span className="text-gray-300 dark:text-gray-600">—</span>}
                              </td>
                              <td className="px-4 py-2 text-center">
                                {s.has_fingerprint
                                  ? <Fingerprint className="w-4 h-4 text-emerald-500 mx-auto" />
                                  : <span className="text-gray-300 dark:text-gray-600">—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────── */

function SummaryCard({ label, value, icon, subtext }: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  subtext?: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{value}</div>
      {subtext && <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{subtext}</div>}
    </div>
  );
}

/* ── Sound ──────────────────────────────────────────────────────── */

function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;
    [523.25, 659.25].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.18, now + i * 0.12 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.35);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.35);
    });
  } catch { /* audio unsupported */ }
}
