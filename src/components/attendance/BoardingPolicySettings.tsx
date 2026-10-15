'use client';
/**
 * Boarding attendance policy (school-level). Written for school administrators: no developer terms.
 * Changing it applies from today only — past attendance is never rewritten — and every change is recorded
 * with who, when, and what it was before.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { showToast } from '@/lib/toast';
import { useI18n } from '@/components/i18n/I18nProvider';

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

/** The server builds the period label in English ("Week of 2026-10-12", …); rebuild it in the interface language. A term name is the school's own text. */
function periodLabel(t: (k: string, v?: any) => string, label: string): string {
  let m = /^Week of (.+)$/.exec(label);
  if (m) return t('attendancePages.settingsPanels.boarding.label.week', { date: m[1] });
  m = /^90-day period from (.+) \(no term set up\)$/.exec(label);
  if (m) return t('attendancePages.settingsPanels.boarding.label.fallback', { date: m[1] });
  m = /^(\d+)-day period from (.+)$/.exec(label);
  if (m) return t('attendancePages.settingsPanels.boarding.label.days', { n: m[1], date: m[2] });
  return label;
}

export default function BoardingPolicySettings() {
  const { t, rich, lang, formatDate, formatNumber, digits } = useI18n();
  const modeLabel = (m: Mode) => t(`attendancePages.settingsPanels.boarding.mode.${m}`);
  const by = (who: string) => who === 'System' ? t('attendancePages.settingsPanels.boarding.by.system') : /^User #(\d+)$/.test(who) ? t('attendancePages.settingsPanels.boarding.by.user', { id: who.slice(6) }) : who;
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
    if (mode !== data.policy.mode && !confirm(t('attendancePages.settingsPanels.boarding.confirmChange', { mode: modeLabel(mode), today: data.today }))) return;
    setSaving(true);
    try {
      const r = await fetch('/api/attendance/boarding-policy', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, reportingPeriod: period, periodDays: period === 'CUSTOM_DAYS' ? Number(days) : null, reportedSmsEnabled: smsOn, smsTemplate: template }),
      });
      const j = await r.json();
      if (!r.ok) { showToast('error', lang === 'ar' ? t('attendancePages.settingsPanels.boarding.couldNotSave') : (j.error || t('attendancePages.settingsPanels.boarding.couldNotSave'))); return; }
      showToast('success', j.changed ? t('attendancePages.settingsPanels.boarding.savedFrom', { date: j.appliesFrom ?? t('attendancePages.settingsPanels.boarding.today') }) : t('attendancePages.settingsPanels.boarding.saved'));
      await load();
    } catch { showToast('error', t('attendancePages.settingsPanels.boarding.couldNotSave')); }
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
    <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4" aria-label={t('attendancePages.settingsPanels.boarding.aria')}>
      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">{t('attendancePages.settingsPanels.boarding.title')}</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {rich('attendancePages.settingsPanels.boarding.intro', { boarding: <b>{t('attendancePages.settingsPanels.boarding.boardingWord')}</b> })}
        </p>
      </div>

      {data.numbers.boarders === 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
          {rich('attendancePages.settingsPanels.boarding.noBoarders', { residence: <b>{t('attendancePages.settingsPanels.boarding.residenceWord')}</b> })}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {card('DAILY_PUNCH', t('attendancePages.settingsPanels.boarding.dailyTitle'), t('attendancePages.settingsPanels.boarding.dailyBody'))}
        {card('REPORTED_ONCE', t('attendancePages.settingsPanels.boarding.onceTitle'), t('attendancePages.settingsPanels.boarding.onceBody'))}
      </div>

      {mode === 'REPORTED_ONCE' && (
        <div className="space-y-4 rounded-lg bg-gray-50 dark:bg-gray-900/40 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="font-medium text-gray-800 dark:text-gray-200">{t('attendancePages.settingsPanels.boarding.periodLabel')}</span>
              <select value={period} onChange={(e) => setPeriod(e.target.value as Period)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
                <option value="TERM">{t('attendancePages.settingsPanels.boarding.period.TERM')}</option>
                <option value="WEEK">{t('attendancePages.settingsPanels.boarding.period.WEEK')}</option>
                <option value="CUSTOM_DAYS">{t('attendancePages.settingsPanels.boarding.period.CUSTOM_DAYS')}</option>
              </select>
              <span className="text-xs text-gray-500 dark:text-gray-400">{t('attendancePages.settingsPanels.boarding.periodHelp', { label: periodLabel(t, data.period.label) })}</span>
            </label>
            {period === 'CUSTOM_DAYS' && (
              <label className="block text-sm">
                <span className="font-medium text-gray-800 dark:text-gray-200">{t('attendancePages.settingsPanels.boarding.daysLabel')}</span>
                <input type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
              </label>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-900 dark:text-white">
            <input type="checkbox" checked={smsOn} onChange={(e) => setSmsOn(e.target.checked)} />
            {t('attendancePages.settingsPanels.boarding.smsToggle')}
          </label>
          {smsOn && (
            <div>
              <label className="text-sm font-medium text-gray-800 dark:text-gray-200" htmlFor="reported-template">{t('attendancePages.settingsPanels.boarding.message')}</label>
              <textarea id="reported-template" rows={3} maxLength={480} value={template} onChange={(e) => setTemplate(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {rich('attendancePages.settingsPanels.boarding.templateHelp', { name: <span dir="ltr">{'{name}'}</span>, school: <span dir="ltr">{'{school}'}</span>, date: <span dir="ltr">{'{date}'}</span>, time: <span dir="ltr">{'{time}'}</span>, reported: <i>{t('attendancePages.settingsPanels.boarding.reportedWord')}</i> })}
              </p>
              <button type="button" onClick={() => setTemplate(data.sms.defaultTemplate)} className="text-xs text-indigo-600 dark:text-indigo-400 underline mt-1">{t('attendancePages.settingsPanels.boarding.useStandard')}</button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-600 dark:text-gray-400">
        <span>
          {rich('attendancePages.settingsPanels.boarding.boardersCount', { n: <b>{formatNumber(data.numbers.boarders)}</b> })}
          {data.policy.mode === 'REPORTED_ONCE' && rich('attendancePages.settingsPanels.boarding.reportedCount', { n: <b>{formatNumber(data.numbers.reported)}</b> }, { label: periodLabel(t, data.period.label) })}
        </span>
        <button onClick={save} disabled={saving || !dirty} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
          {saving ? t('attendancePages.settingsPanels.boarding.saving') : t('attendancePages.settingsPanels.boarding.savePolicy')}
        </button>
      </div>

      {data.policy.effectiveFrom && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{t('attendancePages.settingsPanels.boarding.inEffect', { date: digits(data.policy.effectiveFrom) })}</p>
      )}

      {data.history.length > 0 && (
        <details className="text-xs text-gray-600 dark:text-gray-400">
          <summary className="cursor-pointer font-medium text-gray-700 dark:text-gray-300">{t('attendancePages.settingsPanels.boarding.historyTitle')}</summary>
          <ul className="mt-2 space-y-1">
            {data.history.map((h, i) => (
              <li key={i}>{lang === 'ar' ? formatDate(h.at, 'datetime') : new Date(h.at).toLocaleString()} — {by(h.by)}: {h.from ? modeLabel(h.from) : t('attendancePages.settingsPanels.boarding.notSet')} {lang === 'ar' ? '←' : '→'} {h.to ? modeLabel(h.to) : '—'}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
