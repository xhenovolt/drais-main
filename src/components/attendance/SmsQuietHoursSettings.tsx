'use client';

/**
 * SmsQuietHoursSettings — school-configured window during which a
 * punch-backed arrival/late SMS is suppressed (e.g. boarders known to play
 * with the biometric device overnight). Binds to GET/PUT
 * /api/attendance/settings/quiet-hours. Never affects the punch, the
 * attendance record, or biometric evidence — only whether a parent is
 * texted about it.
 */

import React, { useEffect, useState } from 'react';
import { BellOff, Save, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';

interface QuietHours { enabled: boolean; start: string; end: string }

export default function SmsQuietHoursSettings() {
  const [s, setS] = useState<QuietHours | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    fetch('/api/attendance/settings/quiet-hours')
      .then((r) => r.json())
      .then((d) => { if (d?.success) setS({ enabled: d.enabled, start: d.start, end: d.end }); })
      .catch(() => setToast({ type: 'error', msg: 'Could not load quiet hours' }));
  }, []);

  if (!s) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading quiet hours…
      </div>
    );
  }

  const save = async () => {
    setSaving(true); setToast(null);
    try {
      const res = await fetch('/api/attendance/settings/quiet-hours', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Save failed');
      setToast({ type: 'success', msg: 'Quiet hours saved' });
    } catch (e: any) {
      setToast({ type: 'error', msg: e?.message || 'Failed to save quiet hours' });
    } finally { setSaving(false); }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
        <BellOff className="w-4 h-4 text-indigo-500" /> SMS Quiet Hours
      </h2>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        A punch that happens inside this window never texts a parent — for example, boarding
        learners known to trigger the device overnight (e.g. around 1 AM). The punch, the
        attendance record, and biometric evidence are unaffected; only the SMS is held back.
      </p>

      <label className="flex items-center gap-3 cursor-pointer">
        <button
          type="button"
          onClick={() => setS({ ...s, enabled: !s.enabled })}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors ${s.enabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform mt-0.5 ${s.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Enable quiet hours</span>
      </label>

      {s.enabled && (
        <div className="grid grid-cols-2 gap-4 max-w-sm border-t border-gray-100 dark:border-gray-700 pt-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Starts</label>
            <input
              type="time"
              value={s.start}
              onChange={(e) => setS({ ...s, start: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ends</label>
            <input
              type="time"
              value={s.end}
              onChange={(e) => setS({ ...s, end: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            />
          </div>
          <p className="col-span-2 text-xs text-gray-400">
            A window that crosses midnight (e.g. 23:00 → 05:00) is handled correctly.
          </p>
        </div>
      )}

      {toast && (
        <div className={`flex items-center gap-2 p-2.5 rounded-lg text-sm font-medium ${toast.type === 'success' ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}{toast.msg}
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{saving ? 'Saving…' : 'Save Quiet Hours'}
        </button>
      </div>
    </div>
  );
}
