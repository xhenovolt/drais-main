'use client';

/**
 * LogsDisplaySettings — school-wide row density for the Attendance Logs
 * table. Binds to GET/PUT /api/attendance/settings/logs-display. The Logs
 * page (src/app/attendance/logs/page.tsx) reads the same endpoint and maps
 * the density to Tailwind padding/text-size classes on its table cells.
 */

import React, { useEffect, useState } from 'react';
import { Rows3, Save, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import type { LogsDensity } from '@/app/api/attendance/settings/logs-display/route';

const OPTIONS: { v: LogsDensity; label: string; hint: string }[] = [
  { v: 'compact', label: 'Compact', hint: 'Smallest rows — fit the most records on screen' },
  { v: 'comfortable', label: 'Comfortable', hint: 'Default spacing' },
  { v: 'spacious', label: 'Spacious', hint: 'Largest rows — easiest to read on a big screen' },
];

export default function LogsDisplaySettings() {
  const [density, setDensity] = useState<LogsDensity | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    fetch('/api/attendance/settings/logs-display')
      .then((r) => r.json())
      .then((d) => { if (d?.success) setDensity(d.density); })
      .catch(() => setToast({ type: 'error', msg: 'Could not load display settings' }));
  }, []);

  if (!density) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading display settings…
      </div>
    );
  }

  const save = async (next: LogsDensity) => {
    setDensity(next);
    setSaving(true); setToast(null);
    try {
      const res = await fetch('/api/attendance/settings/logs-display', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ density: next }),
      });
      if (!res.ok) throw new Error('Save failed');
      setToast({ type: 'success', msg: 'Display setting saved' });
    } catch {
      setToast({ type: 'error', msg: 'Failed to save display setting' });
    } finally { setSaving(false); }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
        <Rows3 className="w-4 h-4 text-indigo-500" /> Attendance Logs table
      </h2>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Controls row height and spacing on the Attendance Logs table for every admin at this school.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-xl">
        {OPTIONS.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => save(o.v)}
            title={o.hint}
            disabled={saving}
            className={`px-3 py-2 rounded-lg text-sm font-medium border text-left transition-colors disabled:opacity-50 ${density === o.v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-indigo-400'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500">{OPTIONS.find((o) => o.v === density)?.hint}</p>

      {toast && (
        <div className={`flex items-center gap-2 p-2.5 rounded-lg text-sm font-medium ${toast.type === 'success' ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}{toast.msg}
        </div>
      )}
      {saving && <div className="flex items-center gap-1.5 text-xs text-gray-400"><Save className="w-3.5 h-3.5" /> Saving…</div>}
    </div>
  );
}
