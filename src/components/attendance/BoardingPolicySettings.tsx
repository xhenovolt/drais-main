'use client';
/**
 * Boarding attendance policy (school-level). Written for school administrators: no developer terms.
 * Changing it applies from today only — past attendance is never rewritten — and every change is recorded
 * with who, when, and what it was before.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { showToast } from '@/lib/toast';

type Mode = 'DAILY_PUNCH' | 'REPORTED_ONCE';
type Period = 'TERM' | 'WEEK' | 'CUSTOM_DAYS';
interface Payload {
  policy: { mode: Mode; reportingPeriod: Period; periodDays: number | null; reportedSmsEnabled: boolean; effectiveFrom: string | null };
  period: { label: string; start: string; end: string };
  numbers: { boarders: number; reported: number };
  sms: { template: string; active: boolean; defaultTemplate: string };
  history: Array<{ at: string; by: string; from: Mode | null; to: Mode | null }>;
  today: string;
}

const MODE_LABEL: Record<Mode, string> = { DAILY_PUNCH: 'Daily punch', REPORTED_ONCE: 'Reported once' };

export default function BoardingPolicySettings() {
  const [data, setData] = useState<Payload | null>(null);
  const [mode, setMode] = useState<Mode>('DAILY_PUNCH');
  const [period, setPeriod] = useState<Period>('TERM');
  const [days, setDays] = useState('14');
  const [smsOn, setSmsOn] = useState(true);
  const [template, setTemplate] = useState('');
  const [saving, setSaving] = useState(false);
  const [hidden, setHidden] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/attendance/boarding-policy');
      if (r.status === 403) { setHidden(true); return; }
      const j: Payload & { success?: boolean } = await r.json();
      if (!j.success) return;
      setData(j);
      setMode(j.policy.mode); setPeriod(j.policy.reportingPeriod); setDays(String(j.policy.periodDays ?? 14));
      setSmsOn(j.policy.reportedSmsEnabled); setTemplate(j.sms.template);
    } catch { /* section stays hidden */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (hidden || !data) return null;
  const dirty = mode !== data.policy.mode || period !== data.policy.reportingPeriod
    || (period === 'CUSTOM_DAYS' && Number(days) !== (data.policy.periodDays ?? 14))
    || smsOn !== data.policy.reportedSmsEnabled || template !== data.sms.template;

  const save = async () => {
    if (mode !== data.policy.mode && !confirm(
      `Change the boarding policy to "${MODE_LABEL[mode]}"?\n\nThis takes effect from today (${data.today}). Attendance already recorded is not changed.`)) return;
    setSaving(true);
    try {
      const r = await fetch('/api/attendance/boarding-policy', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, reportingPeriod: period, periodDays: period === 'CUSTOM_DAYS' ? Number(days) : null, reportedSmsEnabled: smsOn, smsTemplate: template }),
      });
      const j = await r.json();
      if (!r.ok) { showToast('error', j.error || 'Could not save'); return; }
      showToast('success', j.changed ? `Boarding policy saved — applies from ${j.appliesFrom ?? 'today'}` : 'Saved');
      await load();
    } catch { showToast('error', 'Could not save'); }
    finally { setSaving(false); }
  };

  const card = (m: Mode, title: string, body: string) => (
    <label className={`block rounded-lg border p-3 cursor-pointer ${mode === m ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
      <span className="flex items-center gap-2 font-medium text-gray-900 dark:text-white text-sm">
        <input type="radio" name="boarding-mode" checked={mode === m} onChange={() => setMode(m)} /> {title}
      </span>
      <span className="block text-xs text-gray-600 dark:text-gray-400 mt-1 pl-6">{body}</span>
    </label>
  );

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4" aria-label="Boarding attendance policy">
      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Boarding attendance policy</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          How should attendance work for learners marked as <b>Boarding</b>? Day scholars always follow the daily attendance rules.
        </p>
      </div>

      {data.numbers.boarders === 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
          No learner is marked as Boarding yet, so this policy has nobody to apply to. Set a learner’s <b>Residence</b> to Boarding on the learners list.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {card('DAILY_PUNCH', 'Require daily biometric punch',
          'Boarding learners are expected to record attendance according to the daily attendance schedule, exactly like day scholars.')}
        {card('REPORTED_ONCE', 'Reported once',
          'A boarding learner is considered reported after their first valid arrival punch for the reporting period. They will not be treated as absent merely because they do not punch again.')}
      </div>

      {mode === 'REPORTED_ONCE' && (
        <div className="space-y-4 rounded-lg bg-gray-50 dark:bg-gray-900/40 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="font-medium text-gray-800 dark:text-gray-200">Reporting period</span>
              <select value={period} onChange={(e) => setPeriod(e.target.value as Period)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
                <option value="TERM">Each term</option>
                <option value="WEEK">Each week</option>
                <option value="CUSTOM_DAYS">Every … days</option>
              </select>
              <span className="text-xs text-gray-500 dark:text-gray-400">A boarder reports once in each period. Currently: {data.period.label}.</span>
            </label>
            {period === 'CUSTOM_DAYS' && (
              <label className="block text-sm">
                <span className="font-medium text-gray-800 dark:text-gray-200">Number of days</span>
                <input type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
              </label>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-900 dark:text-white">
            <input type="checkbox" checked={smsOn} onChange={(e) => setSmsOn(e.target.checked)} />
            Send the parent an SMS when a boarder first reports to school
          </label>
          {smsOn && (
            <div>
              <label className="text-sm font-medium text-gray-800 dark:text-gray-200" htmlFor="reported-template">Message</label>
              <textarea id="reported-template" rows={3} maxLength={480} value={template} onChange={(e) => setTemplate(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                You can use {'{name}'}, {'{school}'}, {'{date}'} and {'{time}'}. This is sent once per learner per period — never again if they punch again — and it says they have <i>reported</i>, not that they were late.
              </p>
              <button type="button" onClick={() => setTemplate(data.sms.defaultTemplate)} className="text-xs text-indigo-600 dark:text-indigo-400 underline mt-1">Use the standard message</button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-600 dark:text-gray-400">
        <span>
          Boarding learners: <b>{data.numbers.boarders.toLocaleString()}</b>
          {data.policy.mode === 'REPORTED_ONCE' && <> · Reported this period: <b>{data.numbers.reported.toLocaleString()}</b> ({data.period.label})</>}
        </span>
        <button onClick={save} disabled={saving || !dirty} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
          {saving ? 'Saving…' : 'Save policy'}
        </button>
      </div>

      {data.policy.effectiveFrom && (
        <p className="text-xs text-gray-500 dark:text-gray-400">Current policy in effect since {data.policy.effectiveFrom}. Earlier days keep the behaviour they had at the time.</p>
      )}

      {data.history.length > 0 && (
        <details className="text-xs text-gray-600 dark:text-gray-400">
          <summary className="cursor-pointer font-medium text-gray-700 dark:text-gray-300">Who changed this, and when</summary>
          <ul className="mt-2 space-y-1">
            {data.history.map((h, i) => (
              <li key={i}>{new Date(h.at).toLocaleString()} — {h.by}: {h.from ? MODE_LABEL[h.from] : 'not set'} → {h.to ? MODE_LABEL[h.to] : '—'}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
