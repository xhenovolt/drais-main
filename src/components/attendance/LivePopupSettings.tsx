'use client';

/**
 * LivePopupSettings — admin UI for the live identity popup.
 * Binds to GET/PUT /api/attendance/live-settings (attendance_live_ui_settings).
 *
 * The "Where it appears" selector maps to (live_popup_enabled, mount_scope):
 *   Off               → enabled 0
 *   Students list     → enabled 1, scope 'students'  (fast, in-memory render)
 *   Attendance pages  → enabled 1, scope 'attendance'
 *   Anywhere          → enabled 1, scope 'global'
 */

import React, { useEffect, useState } from 'react';
import { MonitorSmartphone, Save, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';

type Where = 'off' | 'students' | 'attendance' | 'global';

interface Settings {
  live_popup_enabled: number;
  show_for_students: number;
  show_for_staff: number;
  show_for_unknown: number;
  show_for_late_only: number;
  show_sms_status: number;
  show_guardian_phone: number;
  show_fee_balance: number;
  sound_enabled: number;
  popup_duration_ms: number;
  mount_scope: string;
}

const DURATIONS = [
  { v: 3000, label: '3 seconds' },
  { v: 5000, label: '5 seconds' },
  { v: 10000, label: '10 seconds' },
  { v: 0, label: 'Until dismissed' },
];

const WHERE_OPTS: { v: Where; label: string; hint: string }[] = [
  { v: 'students', label: 'Students list', hint: 'Fastest — renders from the already-loaded list, no per-scan lookup' },
  { v: 'attendance', label: 'Attendance pages', hint: 'Only on /attendance screens' },
  { v: 'global', label: 'Anywhere', hint: 'On every page (server looks up each scan)' },
  { v: 'off', label: 'Off', hint: 'No live popup' },
];

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer py-1.5">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`mt-0.5 relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform mt-0.5 ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
      <span>
        <span className="block text-sm font-medium text-gray-800 dark:text-gray-200">{label}</span>
        {hint && <span className="block text-xs text-gray-500">{hint}</span>}
      </span>
    </label>
  );
}

export default function LivePopupSettings() {
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    fetch('/api/attendance/live-settings')
      .then((r) => r.json())
      .then((d) => { if (d?.settings) setS(d.settings); })
      .catch(() => setToast({ type: 'error', msg: 'Could not load popup settings' }));
  }, []);

  if (!s) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading popup settings…
      </div>
    );
  }

  const where: Where = s.live_popup_enabled !== 1 ? 'off' : (['students', 'attendance', 'global'].includes(s.mount_scope) ? (s.mount_scope as Where) : 'global');
  const set = (patch: Partial<Settings>) => setS((p) => (p ? { ...p, ...patch } : p));
  const setWhere = (w: Where) => {
    if (w === 'off') set({ live_popup_enabled: 0 });
    else set({ live_popup_enabled: 1, mount_scope: w });
  };

  const save = async () => {
    setSaving(true); setToast(null);
    try {
      const res = await fetch('/api/attendance/live-settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s),
      });
      if (!res.ok) throw new Error('Save failed');
      setToast({ type: 'success', msg: 'Popup settings saved' });
    } catch {
      setToast({ type: 'error', msg: 'Failed to save popup settings' });
    } finally { setSaving(false); }
  };

  const enabled = where !== 'off';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-5">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
        <MonitorSmartphone className="w-4 h-4 text-indigo-500" /> Live Scan Popup
      </h2>

      {toast && (
        <div className={`flex items-center gap-2 p-2.5 rounded-lg text-sm font-medium ${toast.type === 'success' ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}{toast.msg}
        </div>
      )}

      {/* Where it appears */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Where it appears</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {WHERE_OPTS.map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setWhere(o.v)}
              title={o.hint}
              className={`px-3 py-2 rounded-lg text-sm font-medium border text-left transition-colors ${where === o.v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-indigo-400'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-1.5">{WHERE_OPTS.find((o) => o.v === where)?.hint}</p>
      </div>

      {enabled && (
        <>
          <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Show popup for</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              <Toggle label="Students" checked={s.show_for_students === 1} onChange={(v) => set({ show_for_students: v ? 1 : 0 })} />
              <Toggle label="Staff" checked={s.show_for_staff === 1} onChange={(v) => set({ show_for_staff: v ? 1 : 0 })} />
              <Toggle label="Unknown / unmatched scans" checked={s.show_for_unknown === 1} onChange={(v) => set({ show_for_unknown: v ? 1 : 0 })} />
              <Toggle label="Late arrivals only" hint="Suppress on-time scans" checked={s.show_for_late_only === 1} onChange={(v) => set({ show_for_late_only: v ? 1 : 0 })} />
            </div>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Show details</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              <Toggle label="SMS status" checked={s.show_sms_status === 1} onChange={(v) => set({ show_sms_status: v ? 1 : 0 })} />
              <Toggle label="Guardian phone" checked={s.show_guardian_phone === 1} onChange={(v) => set({ show_guardian_phone: v ? 1 : 0 })} />
              <Toggle label="Fee balance" checked={s.show_fee_balance === 1} onChange={(v) => set({ show_fee_balance: v ? 1 : 0 })} />
              <Toggle label="Sound" checked={s.sound_enabled === 1} onChange={(v) => set({ sound_enabled: v ? 1 : 0 })} />
            </div>
            <p className="text-xs text-gray-400 mt-1">Fee balance &amp; guardian phone apply to the enriched popup (Attendance pages / Anywhere); the fast Students-list popup shows roster fields only.</p>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Auto-dismiss after</label>
            <select
              value={s.popup_duration_ms}
              onChange={(e) => set({ popup_duration_ms: Number(e.target.value) })}
              className="w-full sm:w-60 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            >
              {DURATIONS.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
            </select>
          </div>
        </>
      )}

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{saving ? 'Saving…' : 'Save Popup Settings'}
        </button>
      </div>
    </div>
  );
}
