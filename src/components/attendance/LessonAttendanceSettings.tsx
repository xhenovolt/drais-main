'use client';
/**
 * Lesson attendance policy + device scopes. Off by default: enabling it changes
 * nothing about school-entry attendance; it only starts deriving per-lesson
 * verdicts from the timetable and biometric punches.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { showToast } from '@/lib/toast';

interface Policy {
  enabled: boolean; checkinBeforeMinutes: number; graceMinutes: number; lateUntilMinutes: number;
  minPresenceMinutes: number; absentFinalizeDelayMinutes: number; unmappedDeviceScope: 'gate' | 'lesson' | 'shared'; autoRoster: boolean;
}
interface Dev { sn: string; deviceName: string | null; location: string | null; roleLabel: string | null; scope: 'gate' | 'lesson' | 'shared' | null; classId: number | null; room: string | null }

const SCOPE_HELP: Record<string, string> = {
  gate: 'School entry only — its punches never count for lessons',
  lesson: 'Lessons only (a dedicated classroom device)',
  shared: 'Both: entry attendance and, inside a lesson window, lesson attendance',
};

export default function LessonAttendanceSettings() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [devices, setDevices] = useState<Dev[]>([]);
  const [saving, setSaving] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, d] = await Promise.all([fetch('/api/attendance/lessons/settings'), fetch('/api/attendance/lessons/settings?devices=1')]);
      if (p.status === 403) { setForbidden(true); return; }
      const pj = await p.json(); const dj = await d.json();
      if (pj.success) setPolicy(pj.policy);
      if (dj.success) setDevices(dj.devices);
    } catch { /* section stays hidden */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (forbidden || !policy) return null;
  const set = <K extends keyof Policy>(k: K, v: Policy[K]) => setPolicy({ ...policy, [k]: v });

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/attendance/lessons/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(policy) });
      const j = await r.json();
      if (!r.ok) { showToast('error', j.error || 'Save failed'); return; }
      setPolicy(j.policy); showToast('success', 'Lesson attendance settings saved');
    } catch { showToast('error', 'Save failed'); }
    finally { setSaving(false); }
  };

  const saveDevice = async (d: Dev, scope: Dev['scope'], room: string | null) => {
    const r = await fetch('/api/attendance/lessons/settings?devices=1', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceSn: d.sn, scope, classId: d.classId, room }),
    });
    const j = await r.json();
    if (!r.ok) { showToast('error', j.error || 'Could not update device'); return; }
    setDevices((all) => all.map((x) => (x.sn === d.sn ? { ...x, scope, room } : x)));
  };

  const num = (label: string, k: keyof Policy, help: string, max = 240) => (
    <label className="block text-sm">
      <span className="font-medium text-gray-800 dark:text-gray-200">{label}</span>
      <input type="number" min={0} max={max} value={policy[k] as number}
        onChange={(e) => set(k, Number(e.target.value) as never)}
        className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
      <span className="text-xs text-gray-500 dark:text-gray-400">{help}</span>
    </label>
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Lesson attendance (timetable-aware)</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Turns biometric punches into per-lesson attendance using your timetable. A school-entry punch never counts as proof of attending every lesson.
          Learners who are not on the biometric system are shown as “not accounted for”, never auto-marked absent.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
        <input type="checkbox" checked={policy.enabled} onChange={(e) => set('enabled', e.target.checked)} />
        Enable lesson attendance
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {num('Check-in opens (min before start)', 'checkinBeforeMinutes', 'Punches earlier than this don’t count for the lesson.', 60)}
        {num('Grace period (min after start)', 'graceMinutes', 'Arriving within this is still “present”.', 60)}
        {num('Late until (min after start)', 'lateUntilMinutes', 'Between grace and this = “late”. Later punches don’t count.', 180)}
        {num('Minimum presence (min)', 'minPresenceMinutes', '0 = one check-in is enough. Otherwise a first and a later punch this far apart are needed; one alone stays “pending”.', 180)}
        {num('Mark absent after lesson ends (min)', 'absentFinalizeDelayMinutes', 'Until then a missing punch shows as “pending”.', 240)}
        <label className="block text-sm">
          <span className="font-medium text-gray-800 dark:text-gray-200">Devices with no scope set</span>
          <select value={policy.unmappedDeviceScope} onChange={(e) => set('unmappedDeviceScope', e.target.value as Policy['unmappedDeviceScope'])}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
            <option value="shared">Shared (entry + lessons)</option>
            <option value="gate">Gate only (entry)</option>
            <option value="lesson">Lessons only</option>
          </select>
          <span className="text-xs text-gray-500 dark:text-gray-400">Set a scope per device below to override.</span>
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-900 dark:text-white">
        <input type="checkbox" checked={policy.autoRoster} onChange={(e) => set('autoRoster', e.target.checked)} />
        Build lesson rosters automatically when a lesson is opened
      </label>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
          {saving ? 'Saving…' : 'Save lesson settings'}
        </button>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">What each device is for</h4>
        {devices.length === 0 && <p className="text-sm text-gray-500">No devices registered.</p>}
        <div className="space-y-2">
          {devices.map((d) => (
            <div key={d.sn} className="flex flex-wrap items-center gap-3 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-sm">
              <div className="min-w-[180px]">
                <div className="font-medium text-gray-900 dark:text-white">{d.deviceName || d.sn}</div>
                <div className="text-xs text-gray-500">{[d.location, d.roleLabel].filter(Boolean).join(' · ') || d.sn}</div>
              </div>
              <select value={d.scope ?? ''} onChange={(e) => saveDevice(d, (e.target.value || null) as Dev['scope'], d.room)}
                className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                <option value="">Default ({policy.unmappedDeviceScope})</option>
                <option value="gate">Gate (entry only)</option>
                <option value="lesson">Dedicated lesson device</option>
                <option value="shared">Shared (entry + lessons)</option>
              </select>
              {d.scope === 'lesson' && (
                <input defaultValue={d.room ?? ''} placeholder="Room (optional)" maxLength={50}
                  onBlur={(e) => { if ((e.target.value || null) !== d.room) saveDevice(d, d.scope, e.target.value || null); }}
                  className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-40" />
              )}
              <span className="text-xs text-gray-500 dark:text-gray-400">{SCOPE_HELP[d.scope ?? policy.unmappedDeviceScope]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
