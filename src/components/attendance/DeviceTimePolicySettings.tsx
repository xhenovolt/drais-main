'use client';

/**
 * DeviceTimePolicySettings — admin UI for the per-school device time policy.
 * Binds to GET/PUT /api/attendance/time-policy (attendance_time_policy).
 */

import React, { useEffect, useState } from 'react';
import { Clock4, Save, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';

interface Policy {
  school_timezone: string;
  utc_offset_minutes: number;
  device_time_policy: string;
  auto_sync_device_time: number;
  max_allowed_drift_seconds: number;
  correct_offline_backlog: number;
  display_raw_and_corrected_time: number;
}

const POLICY_OPTS = [
  { v: 'CORRECT_BY_DRIFT', label: 'Correct by drift', hint: 'Trust device time unless it reads in the future; recover the real time from learned drift. Best default.' },
  { v: 'TRUST_DEVICE_TIME', label: 'Trust device time', hint: 'Store exactly what the device reports. Never correct. Use only if every device clock is reliable.' },
  { v: 'TRUST_SERVER_RECEIVE_TIME', label: 'Trust server time', hint: 'Stamp every punch with the moment DRAIS received it. Accurate for realtime, wrong for offline backlog.' },
  { v: 'MANUAL_REVIEW_IF_DRIFT', label: 'Flag for review', hint: 'Keep device time but flag punches that drift beyond the limit for a human to check.' },
];

const TZ_PRESETS = [
  { tz: 'Africa/Kampala', off: 180, label: 'Africa/Kampala (EAT, +3)' },
  { tz: 'Africa/Nairobi', off: 180, label: 'Africa/Nairobi (EAT, +3)' },
  { tz: 'Africa/Lagos', off: 60, label: 'Africa/Lagos (WAT, +1)' },
  { tz: 'UTC', off: 0, label: 'UTC (+0)' },
];

function Toggle({ label, hint, checked, onChange, warn }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; warn?: boolean }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer py-1.5">
      <button type="button" onClick={() => onChange(!checked)}
        className={`mt-0.5 relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors ${checked ? (warn ? 'bg-amber-500' : 'bg-indigo-600') : 'bg-gray-300 dark:bg-gray-600'}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform mt-0.5 ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
      <span>
        <span className="block text-sm font-medium text-gray-800 dark:text-gray-200">{label}</span>
        {hint && <span className="block text-xs text-gray-500">{hint}</span>}
      </span>
    </label>
  );
}

export default function DeviceTimePolicySettings() {
  const [p, setP] = useState<Policy | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    fetch('/api/attendance/time-policy').then(r => r.json())
      .then(d => { if (d?.settings) setP(d.settings); })
      .catch(() => setToast({ type: 'error', msg: 'Could not load time policy' }));
  }, []);

  if (!p) {
    return <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading time policy…</div>;
  }

  const set = (patch: Partial<Policy>) => setP(prev => prev ? { ...prev, ...patch } : prev);
  const fieldCls = 'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm';

  const save = async () => {
    setSaving(true); setToast(null);
    try {
      const res = await fetch('/api/attendance/time-policy', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
      if (!res.ok) throw new Error();
      setToast({ type: 'success', msg: 'Time policy saved' });
    } catch { setToast({ type: 'error', msg: 'Failed to save time policy' }); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-5">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
        <Clock4 className="w-4 h-4 text-indigo-500" /> Device Time Policy
      </h2>

      {toast && (
        <div className={`flex items-center gap-2 p-2.5 rounded-lg text-sm font-medium ${toast.type === 'success' ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}{toast.msg}
        </div>
      )}

      <p className="text-xs text-gray-500">Controls how DRAIS interprets biometric device clocks. Raw device time, server-received time, and the corrected time are always stored — this only chooses which one attendance uses, and whether DRAIS may change the device clock.</p>

      {/* Timezone */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">School timezone</label>
          <select className={fieldCls} value={p.school_timezone}
            onChange={(e) => { const t = TZ_PRESETS.find(x => x.tz === e.target.value); set({ school_timezone: e.target.value, utc_offset_minutes: t ? t.off : p.utc_offset_minutes }); }}>
            {TZ_PRESETS.map(t => <option key={t.tz} value={t.tz}>{t.label}</option>)}
            {!TZ_PRESETS.some(t => t.tz === p.school_timezone) && <option value={p.school_timezone}>{p.school_timezone}</option>}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">UTC offset (minutes)</label>
          <input type="number" className={fieldCls} value={p.utc_offset_minutes} onChange={(e) => set({ utc_offset_minutes: parseInt(e.target.value) || 0 })} />
        </div>
      </div>

      {/* Policy */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">When the device clock is wrong</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {POLICY_OPTS.map(o => (
            <button key={o.v} type="button" onClick={() => set({ device_time_policy: o.v })}
              className={`px-3 py-2 rounded-lg text-sm font-medium border text-left transition-colors ${p.device_time_policy === o.v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-indigo-400'}`}>
              {o.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-1.5">{POLICY_OPTS.find(o => o.v === p.device_time_policy)?.hint}</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Max allowed drift (seconds)</label>
        <input type="number" min={0} className={`${fieldCls} sm:w-48`} value={p.max_allowed_drift_seconds} onChange={(e) => set({ max_allowed_drift_seconds: parseInt(e.target.value) || 0 })} />
        <p className="text-xs text-gray-500 mt-1">Beyond this, a clock is treated as faulty (correct/flag depending on policy).</p>
      </div>

      <div className="border-t border-gray-100 dark:border-gray-700 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6">
        <Toggle label="Let DRAIS correct device clocks" hint="When ON, DRAIS pushes the correct time to a drifting device. OFF = DRAIS never changes your machine's clock." warn checked={p.auto_sync_device_time === 1} onChange={(v) => set({ auto_sync_device_time: v ? 1 : 0 })} />
        <Toggle label="Trust offline backlog times" hint="Keep original timestamps for punches uploaded after the device was offline." checked={p.correct_offline_backlog === 1} onChange={(v) => set({ correct_offline_backlog: v ? 1 : 0 })} />
        <Toggle label="Show raw + corrected time" hint="Display both the device's reported time and the corrected time in logs." checked={p.display_raw_and_corrected_time === 1} onChange={(v) => set({ display_raw_and_corrected_time: v ? 1 : 0 })} />
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{saving ? 'Saving…' : 'Save Time Policy'}
        </button>
      </div>
    </div>
  );
}
