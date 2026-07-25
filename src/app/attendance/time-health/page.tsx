'use client';

/**
 * Attendance Time Health (Phase 8) — the Time Intelligence Engine cockpit.
 *
 * Shows every device's clock confidence for today, the school's learned
 * attendance fingerprint, drift history, and the assisted-correction flow:
 * "what time did the first arrivals actually begin?" → preview → apply →
 * undo. Original device timestamps are never overwritten.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Clock, Loader2, AlertTriangle, CheckCircle, RefreshCw, Undo2, ShieldCheck, Brain,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useI18n } from '@/components/i18n/I18nProvider';

type TFn = (k: string, v?: any, f?: string) => string;

const fmtMin = (m: number | null | undefined) => {
  if (m == null) return '—';
  const mm = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
};
const CAUSE_LABEL: Record<string, string> = {
  normal: 'Clock normal',
  clock_drift_hours: 'Clock off by whole hours',
  timezone_mismatch_or_drift: 'Timezone / clock drift',
  clock_running_fast: 'Clock running fast',
  clock_running_slow: 'Clock running slow',
  future_timestamps: 'Future timestamps (clock fast)',
  midnight_rollover: 'Midnight rollover / clock reset',
  rtc_failure: 'RTC battery failure suspected',
  insufficient_history: 'Still learning this school',
  no_punches: 'No punches yet today',
  // policy-aware causes
  auto_resolved: 'Drift auto-corrected by policy',
  auto_correct_incomplete: 'Auto-correction incomplete',
  trusted_by_policy: 'Trusted per policy (uncorrected by design)',
  manual_review_flagged: 'Flagged for manual review',
};
// Maps a device cause to its i18n key (CAUSE_LABEL stays the English fallback).
const CAUSE_KEY: Record<string, string> = {
  normal: 'causeNormal', clock_drift_hours: 'causeDriftHours', timezone_mismatch_or_drift: 'causeTzDrift',
  clock_running_fast: 'causeFast', clock_running_slow: 'causeSlow', future_timestamps: 'causeFuture',
  midnight_rollover: 'causeMidnight', rtc_failure: 'causeRtc', insufficient_history: 'causeLearning', no_punches: 'causeNoPunches',
  auto_resolved: 'causeAutoResolved', auto_correct_incomplete: 'causeAutoIncomplete',
  trusted_by_policy: 'causeTrustedByPolicy', manual_review_flagged: 'causeManualReview',
};
// Active-policy → i18n key + English fallback for the header chip.
const POLICY_LABEL: Record<string, { key: string; en: string }> = {
  CORRECT_BY_DRIFT: { key: 'policyCorrectByDrift', en: 'Correct by drift' },
  TRUST_DEVICE_TIME: { key: 'policyTrustDevice', en: 'Trust device time' },
  MANUAL_REVIEW_IF_DRIFT: { key: 'policyManualReview', en: 'Manual review if drift' },
};

export default function TimeHealthPage() {
  const { t } = useI18n();
  const causeLabel = (c: string) => { const k = CAUSE_KEY[c]; return k ? t(`attendanceIntel.timeHealth.${k}`, CAUSE_LABEL[c] || c) : (CAUSE_LABEL[c] || c); };
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [fix, setFix] = useState<any>(null); // { device_sn, date, suggestedShift, baselineFirst, todayFirst }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/attendance/time-health', { cache: 'no-store' });
      setData(await r.json());
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const undo = useCallback(async (id: number) => {
    const r = await fetch('/api/attendance/time-health', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'undo', correction_id: id }) });
    const j = await r.json();
    if (j.success) { toast.success(t('attendanceIntel.timeHealth.restoredToast', { n: j.restored }, 'Restored {{n}} punches')); load(); } else toast.error(j.error || t('attendanceIntel.timeHealth.failed', 'Failed'));
  }, [load]);

  const baselineFor = (sn: string) => (data?.baselines || []).find((b: any) => b.device_sn === sn);
  const historyFor = (sn: string) => (data?.history || []).find((h: any) => h.device_sn === sn);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><Clock className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('attendanceIntel.timeHealth.title', 'Attendance Time Health')}</h1>
            <p className="text-sm text-gray-500">{t('attendanceIntel.timeHealth.subtitle', "DRAIS checks every batch against this school's learned arrival pattern — drift is caught before wrong times are trusted.")}</p>
            {data?.policy && POLICY_LABEL[data.policy] && (
              <p className="text-[11px] text-gray-400 mt-1">
                {t('attendanceIntel.timeHealth.policyLabel', 'Time policy')}:{' '}
                <span className="font-medium text-indigo-600 dark:text-indigo-400">{t(`attendanceIntel.timeHealth.${POLICY_LABEL[data.policy].key}`, POLICY_LABEL[data.policy].en)}</span>
              </p>
            )}
          </div>
        </div>
        <button onClick={load} aria-label={t('attendanceIntel.timeHealth.recheck', 'Re-check')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> {t('attendanceIntel.timeHealth.recheck', 'Re-check')}</button>
      </div>

      {loading && !data && <div className="py-16 text-center"><Loader2 className="w-7 h-7 animate-spin text-indigo-600 inline" /></div>}

      {/* Today's device verdicts */}
      {data?.today && (
        <div className="space-y-3">
          {data.today.length === 0 && <p className="text-sm text-gray-400 py-6 text-center">{t('attendanceIntel.timeHealth.noPunches', 'No device punches today yet.')}</p>}
          {data.today.map((d: any) => {
            const bl = baselineFor(d.device_sn);
            const hist = historyFor(d.device_sn);
            const bad = d.status === 'anomaly';
            const review = d.status === 'review';
            const resolved = !!d.resolvedByPolicy; // real device drift the policy already realigned
            return (
              <div key={d.device_sn} className={`rounded-xl border bg-white dark:bg-gray-800 p-4 ${bad ? 'border-rose-300 dark:border-rose-800 ring-1 ring-rose-300 dark:ring-rose-800' : resolved ? 'border-emerald-200 dark:border-emerald-800' : 'border-gray-200 dark:border-gray-700'}`}>
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    {bad ? <AlertTriangle className="w-5 h-5 text-rose-500" /> : review ? <Clock className="w-5 h-5 text-amber-500" /> : resolved ? <ShieldCheck className="w-5 h-5 text-emerald-500" /> : <CheckCircle className="w-5 h-5 text-emerald-500" />}
                    <span className="font-mono text-sm font-semibold text-gray-800 dark:text-gray-100">{d.device_sn}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded font-semibold uppercase ${bad ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' : review ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'}`}>
                      {bad ? t('attendanceIntel.timeHealth.anomaly', 'Anomaly') : review ? t('attendanceIntel.timeHealth.review', 'Review') : resolved ? t('attendanceIntel.timeHealth.resolvedBadge', 'Auto-resolved') : t('attendanceIntel.timeHealth.trusted', 'Trusted')}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl font-bold ${d.confidence >= 80 ? 'text-emerald-600' : d.confidence >= 40 ? 'text-amber-600' : 'text-rose-600'}`}>{d.confidence}%</div>
                    <div className="text-[11px] text-gray-400">{t('attendanceIntel.timeHealth.timeConfidence', 'time confidence')}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-3 text-sm">
                  <div><div className="text-[11px] text-gray-400">{t('attendanceIntel.timeHealth.usualFirst', 'Usual first arrival')}</div><div className="font-semibold text-gray-800 dark:text-gray-100">{fmtMin(bl?.median_first_minute)} <span className="text-[11px] font-normal text-gray-400">({t('attendanceIntel.timeHealth.samplesD', { n: bl?.sample_days ?? 0 }, '{{n}}d')})</span></div></div>
                  <div><div className="text-[11px] text-gray-400">{t('attendanceIntel.timeHealth.todayFirst', "Today's first arrival")}</div><div className="font-semibold text-gray-800 dark:text-gray-100">{fmtMin(d.first_arrival_minute ?? null)}</div></div>
                  {/* Raw device-clock drift — what the CLOCK did, independent of the policy. */}
                  <div><div className="text-[11px] text-gray-400">{t('attendanceIntel.timeHealth.rawDrift', 'Device clock drift')}</div><div className={`font-semibold ${d.rawDriftMin ? (resolved ? 'text-emerald-600' : 'text-amber-600') : 'text-gray-800 dark:text-gray-100'}`}>{d.rawDriftMin ? `${d.rawDriftMin > 0 ? '+' : ''}${Math.round(d.rawDriftMin / 60 * 10) / 10}h` : t('attendanceIntel.timeHealth.none', 'none')}</div></div>
                  {/* Residual — what remains in the stored punches after the policy. */}
                  <div><div className="text-[11px] text-gray-400">{t('attendanceIntel.timeHealth.estimatedOffset', 'Estimated offset')}</div><div className={`font-semibold ${d.offsetEstimateMin ? 'text-rose-600' : 'text-gray-800 dark:text-gray-100'}`}>{d.offsetEstimateMin ? `${d.offsetEstimateMin > 0 ? '+' : ''}${Math.round(d.offsetEstimateMin / 60 * 10) / 10}h` : t('attendanceIntel.timeHealth.none', 'none')}</div></div>
                  <div><div className="text-[11px] text-gray-400">{t('attendanceIntel.timeHealth.drift30', '30-day drift (avg/max)')}</div><div className="font-semibold text-gray-800 dark:text-gray-100">{hist ? `${hist.avg_drift_min}m / ${hist.max_drift_min}m` : '—'}</div></div>
                </div>

                <p className="text-xs text-gray-500 mt-2">{causeLabel(d.likelyCause)}: {d.detail}</p>

                {bad && d.recommendedShiftMin !== 0 && (
                  <div className="mt-3 p-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800">
                    <p className="text-sm text-rose-800 dark:text-rose-200 font-medium">
                      {t('attendanceIntel.timeHealth.wrongTimestamps', { conf: d.driftConfidence }, "⚠ The system believes today's timestamps are wrong ({{conf}}% drift confidence). No corrections have been applied.")}
                    </p>
                    <p className="text-xs text-rose-700 dark:text-rose-300 mt-1">
                      {t('attendanceIntel.timeHealth.suggestedShift', { h: `${d.recommendedShiftMin > 0 ? '+' : ''}${Math.round(d.recommendedShiftMin / 60 * 10) / 10}` }, 'Suggested: shift the whole batch {{h}} hours. Also correct the clock on the device itself so tomorrow doesn’t repeat this.')}
                    </p>
                    <button
                      onClick={() => setFix({ device_sn: d.device_sn, date: d.local_date, suggestedShift: d.recommendedShiftMin, baselineFirst: bl?.median_first_minute ?? null, todayFirst: d.first_arrival_minute })}
                      className="mt-2 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium"
                    >{t('attendanceIntel.timeHealth.reviewCorrect', 'Review & correct…')}</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Learned fingerprint + correction audit */}
      {data?.corrections?.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-indigo-500" /> {t('attendanceIntel.timeHealth.correctionHistory', 'Correction history (undoable)')}</p>
          <div className="space-y-1.5">
            {data.corrections.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between text-xs">
                <span className="text-gray-600 dark:text-gray-300">
                  <span className="font-mono">{c.device_sn}</span> · {String(c.local_date).slice(0, 10)} · {t('attendanceIntel.timeHealth.histLine', { shift: `${c.shift_minutes > 0 ? '+' : ''}${c.shift_minutes}`, rows: c.affected_rows }, 'shifted {{shift}} min · {{rows}} punches')}
                  {c.applied_by_name ? ` · ${t('attendanceIntel.timeHealth.byName', { name: c.applied_by_name }, 'by {{name}}')}` : ''}
                  {c.undone_at ? <span className="text-gray-400"> · {t('attendanceIntel.timeHealth.undone', 'undone')}</span> : ''}
                </span>
                {!c.undone_at && (
                  <button onClick={() => undo(c.id)} className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline"><Undo2 className="w-3.5 h-3.5" /> {t('attendanceIntel.timeHealth.undo', 'Undo')}</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
        <Brain className="w-3.5 h-3.5" /> {t('attendanceIntel.timeHealth.baselineNote', "Baselines are learned from up to 90 days of this school's own history and sharpen after every confirmed correction. Original device timestamps are always preserved.")}
      </p>

      {fix && <CorrectionModal fix={fix} t={t} onClose={() => setFix(null)} onDone={() => { setFix(null); load(); }} />}
    </div>
  );
}

/* ── Assisted correction: question → preview → apply ─────────────────── */
function CorrectionModal({ fix, onClose, onDone, t }: { fix: any; onClose: () => void; onDone: () => void; t: TFn }) {
  // Ask the operator the natural question; derive the shift from the answer.
  const suggested = fix.todayFirst != null && fix.suggestedShift
    ? fmtMin(fix.todayFirst + fix.suggestedShift) : fmtMin(fix.baselineFirst);
  const [actualFirst, setActualFirst] = useState(suggested === '—' ? '' : suggested);
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const shiftMinutes = (() => {
    if (!/^\d{2}:\d{2}$/.test(actualFirst) || fix.todayFirst == null) return fix.suggestedShift || 0;
    const [h, m] = actualFirst.split(':').map(Number);
    return h * 60 + m - fix.todayFirst;
  })();

  const doPreview = useCallback(async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/attendance/time-health', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'preview', device_sn: fix.device_sn, date: fix.date, shift_minutes: shiftMinutes }) });
      const j = await r.json();
      if (j.success) setPreview(j); else toast.error(j.error || t('attendanceIntel.timeHealth.previewFailed', 'Preview failed'));
    } finally { setBusy(false); }
  }, [fix, shiftMinutes]);

  const doApply = useCallback(async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/attendance/time-health', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'apply', device_sn: fix.device_sn, date: fix.date, shift_minutes: shiftMinutes }) });
      const j = await r.json();
      if (j.success) { toast.success(t('attendanceIntel.timeHealth.correctedToast', { affected: j.affected, days: j.reEvaluated }, 'Corrected {{affected}} punches · {{days}} day-verdicts refreshed')); onDone(); }
      else toast.error(j.error || t('attendanceIntel.timeHealth.applyFailed', 'Apply failed'));
    } finally { setBusy(false); }
  }, [fix, shiftMinutes, onDone]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">{t('attendanceIntel.timeHealth.correctBatch', { sn: fix.device_sn }, 'Correct batch times — {{sn}}')}</h2>
        <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
          <p>{t('attendanceIntel.timeHealth.usuallyBegin', { time: fmtMin(fix.baselineFirst) }, 'First arrivals usually begin around {{time}}.')}</p>
          <p>{t('attendanceIntel.timeHealth.todayRecorded', { time: fmtMin(fix.todayFirst) }, "Today's first recorded arrival is {{time}}.")}</p>
        </div>
        <label className="block text-sm text-gray-700 dark:text-gray-200">
          {t('attendanceIntel.timeHealth.whatTime', 'What time did the first arrivals actually begin today?')}
          <input type="time" aria-label={t('attendanceIntel.timeHealth.whatTime', 'What time did the first arrivals actually begin today?')} value={actualFirst} onChange={(e) => { setActualFirst(e.target.value); setPreview(null); }}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
        </label>
        <p className="text-xs text-gray-500">{t('attendanceIntel.timeHealth.correctionShift', { desc: `${shiftMinutes > 0 ? '+' : ''}${Math.floor(Math.abs(shiftMinutes) / 60)}h ${Math.abs(shiftMinutes) % 60}m ${shiftMinutes < 0 ? t('attendanceIntel.timeHealth.shiftBack', 'back') : t('attendanceIntel.timeHealth.shiftForward', 'forward')}` }, 'Correction: shift the entire batch {{desc}}.')}</p>

        {preview && (
          <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 text-xs">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-500"><tr><th className="px-2 py-1.5 text-left">{t('attendanceIntel.timeHealth.person', 'Person')}</th><th className="px-2 py-1.5">{t('attendanceIntel.timeHealth.before', 'Before')}</th><th className="px-2 py-1.5">{t('attendanceIntel.timeHealth.after', 'After')}</th></tr></thead>
              <tbody>
                {preview.sample.map((r: any) => (
                  <tr key={r.id} className="border-t border-gray-100 dark:border-gray-700/50">
                    <td className="px-2 py-1 truncate max-w-[160px]">{r.name || `#${r.id}`}</td>
                    <td className="px-2 py-1 text-center text-rose-500 line-through">{r.before}</td>
                    <td className="px-2 py-1 text-center font-semibold text-emerald-600">{r.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-2 py-1.5 text-gray-400">{t('attendanceIntel.timeHealth.punchesCorrected', { n: preview.affected }, '{{n}} punches will be corrected. Undo is available afterwards.')}</p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500">{t('attendanceIntel.timeHealth.cancel', 'Cancel')}</button>
          {!preview
            ? <button onClick={doPreview} disabled={busy || shiftMinutes === 0} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{busy && <Loader2 className="w-4 h-4 animate-spin" />}{t('attendanceIntel.timeHealth.preview', 'Preview')}</button>
            : <button onClick={doApply} disabled={busy} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium disabled:opacity-50">{busy && <Loader2 className="w-4 h-4 animate-spin" />}{t('attendanceIntel.timeHealth.applyCorrection', 'Apply correction')}</button>}
        </div>
      </div>
    </div>
  );
}
