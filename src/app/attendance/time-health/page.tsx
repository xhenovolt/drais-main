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
  Clock, Loader2, AlertTriangle, CheckCircle, RefreshCw, Undo2, ShieldCheck, Brain, Wrench, History, X, Search,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useI18n } from '@/components/i18n/I18nProvider';

type TFn = (k: string, v?: any, f?: string) => string;

const fmtMin = (m: number | null | undefined) => {
  if (m == null) return '—';
  const mm = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
};
const fmtDuration = (absMin: number) => {
  const h = Math.floor(absMin / 60);
  const m = Math.round(absMin % 60);
  if (h <= 0) return `${m}m`;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
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
  const [analyze, setAnalyze] = useState<any>(null); // { device_sn }

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
            // Computed directly from the two raw numbers already on this card —
            // deliberately independent of d.status/d.confidence. A verdict can
            // (rarely) be wrong; a learner's actual arrival time next to the
            // school's own usual pattern cannot lie. Shown regardless of what
            // the server-side score says, so a gap is never hidden.
            const deviationMin = bl?.median_first_minute != null && d.first_arrival_minute != null
              ? d.first_arrival_minute - bl.median_first_minute : null;
            const deviationSignificant = deviationMin != null && Math.abs(deviationMin) > 30;
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

                {/* Evidence, not just a verdict — the actual device-reported
                    time next to DRAIS's stored time for the first/last
                    punches, so a correction is never made "blindly from the
                    UI" off a confidence score alone. */}
                <DeviceTimeEvidence deviceSn={d.device_sn} date={d.local_date} t={t} />

                {/* Always-visible arrival-gap callout — computed straight from
                    "usual" vs "today", never from d.status/d.confidence. A
                    verdict can (rarely) mis-score a day; this cannot, since it
                    only compares two numbers already shown on this card. */}
                {deviationSignificant && (
                  <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">
                      {t('attendanceIntel.timeHealth.arrivalGap', {
                        today: fmtMin(d.first_arrival_minute), usual: fmtMin(bl?.median_first_minute),
                        dir: deviationMin! > 0 ? t('attendanceIntel.timeHealth.later', 'later') : t('attendanceIntel.timeHealth.earlier', 'earlier'),
                        gap: fmtDuration(Math.abs(deviationMin!)),
                      }, "Today's first arrival ({{today}}) is {{gap}} {{dir}} than usual ({{usual}}).")}
                    </p>
                    <button
                      onClick={() => setFix({
                        device_sn: d.device_sn, date: d.local_date,
                        suggestedShift: bl?.median_first_minute != null ? bl.median_first_minute - d.first_arrival_minute : 0,
                        baselineFirst: bl?.median_first_minute ?? null, todayFirst: d.first_arrival_minute,
                      })}
                      className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium"
                    ><Wrench className="w-3.5 h-3.5" /> {t('attendanceIntel.timeHealth.correctToUsual', { time: fmtMin(bl?.median_first_minute) }, 'Correct to usual first arrival ({{time}})')}</button>
                  </div>
                )}

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

                {/* Manual override — ALWAYS available, regardless of what DRAIS's own
                    detection says. Automated "Trusted" is a best-effort read of a
                    device's own clock; it can be wrong (a device can misreport time
                    in a way that still looks self-consistent). This is the human's own
                    button — no need to wait for or trust an anomaly flag to use it. */}
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50 flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-[11px] text-gray-400">
                    {t('attendanceIntel.timeHealth.manualNote', "Don't wait for DRAIS to flag a problem — correct any device's time yourself, any time.")}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAnalyze({ device_sn: d.device_sn })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium"
                    ><History className="w-3.5 h-3.5" /> {t('attendanceIntel.timeHealth.analyzeHistory', 'Analyze historical data…')}</button>
                    <button
                      onClick={() => setFix({ device_sn: d.device_sn, date: d.local_date, suggestedShift: d.recommendedShiftMin || 0, baselineFirst: bl?.median_first_minute ?? null, todayFirst: d.first_arrival_minute })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium"
                    ><Wrench className="w-3.5 h-3.5" /> {t('attendanceIntel.timeHealth.manualCorrect', 'Correct manually…')}</button>
                  </div>
                </div>
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
      {analyze && (
        <HistoryAnalysisModal
          deviceSn={analyze.device_sn} t={t}
          onClose={() => setAnalyze(null)}
          onDone={() => { setAnalyze(null); load(); }}
        />
      )}
    </div>
  );
}

/* ── Device time vs DRAIS time — the raw evidence behind a verdict ────── */
function DeviceTimeEvidence({ deviceSn, date, t }: { deviceSn: string; date: string; t: TFn }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sample, setSample] = useState<{ first: any[]; last: any[]; total: number } | null>(null);

  const reveal = useCallback(async () => {
    setOpen((o) => !o);
    if (sample || !deviceSn || !date) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/attendance/time-health?sample=1&device_sn=${encodeURIComponent(deviceSn)}&date=${encodeURIComponent(date)}`, { cache: 'no-store' });
      const j = await r.json();
      if (j.success) setSample({ first: j.first || [], last: j.last || [], total: j.total || 0 });
    } finally { setLoading(false); }
  }, [deviceSn, date, sample]);

  const Table = ({ rows, label }: { rows: any[]; label: string }) => rows.length === 0 ? null : (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">{label}</p>
      <div className="space-y-0.5">
        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-4 gap-2 text-[11px] items-center">
            <span className="truncate text-gray-600 dark:text-gray-300">{r.name || '—'}</span>
            <span className="font-mono text-gray-800 dark:text-gray-100" title="What the device itself reported">{r.device_time}</span>
            <span className="font-mono text-gray-500" title="What DRAIS stored (may be policy-corrected)">{r.drais_time}</span>
            <span className={`font-mono ${r.skew_seconds && Math.abs(r.skew_seconds) > 300 ? 'text-rose-500' : 'text-gray-400'}`}>
              {r.skew_seconds != null ? `${r.skew_seconds > 0 ? '+' : ''}${Math.round(r.skew_seconds / 60)}m` : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="mt-2">
      <button onClick={reveal} className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
        {open ? t('attendanceIntel.timeHealth.hideEvidence', 'Hide device vs DRAIS time') : t('attendanceIntel.timeHealth.showEvidence', 'Show device vs DRAIS time (first/last punches)')}
      </button>
      {open && sample && (
        <div className="mt-2 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 space-y-2">
          <div className="grid grid-cols-4 gap-2 text-[10px] font-semibold text-gray-400 uppercase">
            <span>{t('attendanceIntel.timeHealth.person', 'Person')}</span>
            <span>{t('attendanceIntel.timeHealth.deviceTime', 'Device time')}</span>
            <span>{t('attendanceIntel.timeHealth.draisTime', 'DRAIS time')}</span>
            <span>{t('attendanceIntel.timeHealth.skew', 'Skew')}</span>
          </div>
          <Table rows={sample.first} label={t('attendanceIntel.timeHealth.firstPunches', { n: sample.first.length }, 'First {{n}}')} />
          <Table rows={sample.last} label={t('attendanceIntel.timeHealth.lastPunches', { n: sample.last.length }, 'Last {{n}}')} />
          {sample.total === 0 && <p className="text-[11px] text-gray-400">{t('attendanceIntel.timeHealth.noPunches', 'No device punches today yet.')}</p>}
        </div>
      )}
    </div>
  );
}

/* ── Analyze already-stored history for jump/band patterns ────────────── */
function HistoryAnalysisModal({ deviceSn, onClose, onDone, t }: { deviceSn: string; onClose: () => void; onDone: () => void; t: TFn }) {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<any>(null);
  const [busyDate, setBusyDate] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, any>>({});

  const run = useCallback(async () => {
    setLoading(true); setResult(null); setPreviews({});
    try {
      const r = await fetch(`/api/attendance/time-health?analyze=1&device_sn=${encodeURIComponent(deviceSn)}&days=${days}`, { cache: 'no-store' });
      const j = await r.json();
      if (j.success) setResult(j); else toast.error(j.error || t('attendanceIntel.timeHealth.analyzeFailed', 'Analysis failed'));
    } finally { setLoading(false); }
  }, [deviceSn, days]);
  useEffect(() => { run(); }, [run]);

  const previewDay = useCallback(async (date: string, driftHours: number) => {
    setBusyDate(date);
    try {
      const r = await fetch('/api/attendance/time-health', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'preview_recompute', device_sn: deviceSn, date, drift_hours: driftHours }) });
      const j = await r.json();
      if (j.success) setPreviews((p) => ({ ...p, [date]: j })); else toast.error(j.error || t('attendanceIntel.timeHealth.previewFailed', 'Preview failed'));
    } finally { setBusyDate(null); }
  }, [deviceSn]);

  const applyDay = useCallback(async (date: string, driftHours: number) => {
    setBusyDate(date);
    try {
      const r = await fetch('/api/attendance/time-health', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'apply_recompute', device_sn: deviceSn, date, drift_hours: driftHours }) });
      const j = await r.json();
      if (j.success) { toast.success(t('attendanceIntel.timeHealth.correctedToast', { affected: j.affected, days: j.reEvaluated }, 'Corrected {{affected}} punches · {{days}} day-verdicts refreshed')); await run(); }
      else toast.error(j.error || t('attendanceIntel.timeHealth.applyFailed', 'Apply failed'));
    } finally { setBusyDate(null); }
  }, [deviceSn, run]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 w-full max-w-2xl flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-1.5"><History className="w-4 h-4 text-indigo-500" /> {t('attendanceIntel.timeHealth.analyzeTitle', { sn: deviceSn }, 'Analyze historical data — {{sn}}')}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-gray-500 mt-1 flex-shrink-0">
          {t('attendanceIntel.timeHealth.analyzeHint', "Scans already-stored punches for days whose clock reading jumped mid-day (a failing-RTC signature) rather than drifted smoothly. Nothing is changed until you preview and confirm a day.")}
        </p>

        <div className="flex items-center gap-2 mt-3 flex-shrink-0">
          <span className="text-xs text-gray-500">{t('attendanceIntel.timeHealth.windowLabel', 'Window')}:</span>
          {[14, 30, 60, 90].map((n) => (
            <button key={n} onClick={() => setDays(n)} className={`px-2.5 py-1 rounded-lg text-xs font-medium ${days === n ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>{n}d</button>
          ))}
          <button onClick={run} disabled={loading} className="ml-auto flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} {t('attendanceIntel.timeHealth.rerun', 'Re-run')}
          </button>
        </div>

        <div className="mt-3 overflow-y-auto min-h-0 space-y-2">
          {loading && !result && <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin text-indigo-600 inline" /></div>}
          {result && (
            <>
              <p className="text-xs text-gray-500">
                {t('attendanceIntel.timeHealth.analyzeSummary', { stable: result.stable_days, unstable: result.unstable_days.length }, '{{stable}} day(s) look healthy · {{unstable}} day(s) flagged')}
              </p>
              {result.unstable_days.length === 0 ? (
                <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 py-4"><CheckCircle className="w-4 h-4" /> {t('attendanceIntel.timeHealth.analyzeClean', 'No jump patterns found in this window.')}</p>
              ) : result.unstable_days.map((d: any) => {
                const preview = previews[d.date];
                return (
                  <div key={d.date} className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{d.date}</span>
                      <span className="text-[11px] text-gray-500">{t('attendanceIntel.timeHealth.rowsAndBands', { rows: d.rowCount, bands: d.bands.length }, '{{rows}} punches · {{bands}} distinct readings')}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      {d.bands.map((b: any, i: number) => (
                        <span key={i} className="px-1.5 py-0.5 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300">
                          {b.skewSeconds > 0 ? '+' : ''}{Math.round(b.skewSeconds / 3600 * 10) / 10}h × {b.count}
                        </span>
                      ))}
                    </div>
                    {d.suggestedDriftHours == null ? (
                      <p className="text-[11px] text-gray-500">{t('attendanceIntel.timeHealth.analyzeAmbiguous', 'No clear majority reading — needs a manual look, not a guess.')}</p>
                    ) : preview ? (
                      <div className="text-xs space-y-1">
                        <p className="text-gray-600 dark:text-gray-300">{t('attendanceIntel.timeHealth.analyzeWillTouch', { n: preview.affected }, 'Will recompute {{n}} punch(es).')}</p>
                        <div className="flex gap-2">
                          <button onClick={() => applyDay(d.date, d.suggestedDriftHours)} disabled={busyDate === d.date || preview.affected === 0}
                            className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium disabled:opacity-50">
                            {busyDate === d.date ? <Loader2 className="w-3 h-3 animate-spin inline" /> : t('attendanceIntel.timeHealth.confirmApply', 'Confirm & apply')}
                          </button>
                          <button onClick={() => setPreviews((p) => { const n = { ...p }; delete n[d.date]; return n; })} className="px-3 py-1 rounded-lg border border-gray-300 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-300">
                            {t('attendanceIntel.timeHealth.cancel', 'Cancel')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => previewDay(d.date, d.suggestedDriftHours!)} disabled={busyDate === d.date}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-800 dark:text-amber-200 text-xs font-medium disabled:opacity-50">
                        {busyDate === d.date ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                        {t('attendanceIntel.timeHealth.previewSuggestion', { h: d.suggestedDriftHours }, 'Preview recompute at {{h}}h drift')}
                      </button>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Assisted correction: question → preview → apply ─────────────────── */
function CorrectionModal({ fix, onClose, onDone, t }: { fix: any; onClose: () => void; onDone: () => void; t: TFn }) {
  const [mode, setMode] = useState<'batch' | 'selective'>('batch');

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl p-5 w-full max-w-md flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{t('attendanceIntel.timeHealth.correctBatch', { sn: fix.device_sn }, 'Correct times — {{sn}}')}</h2>
        </div>

        {/* Scope toggle — most drift affects the whole device, but sometimes
            only a handful of people were mis-scanned (e.g. an AM/PM mixup on a
            few punches) while the rest of the batch is genuinely fine. */}
        <div className="flex gap-1 p-0.5 rounded-lg bg-gray-100 dark:bg-gray-900/50 text-sm mt-3 flex-shrink-0">
          <button onClick={() => setMode('batch')} className={`flex-1 px-3 py-1.5 rounded-md font-medium ${mode === 'batch' ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500'}`}>
            {t('attendanceIntel.timeHealth.scopeAll', 'All arrivals')}
          </button>
          <button onClick={() => setMode('selective')} className={`flex-1 px-3 py-1.5 rounded-md font-medium ${mode === 'selective' ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500'}`}>
            {t('attendanceIntel.timeHealth.scopeSelect', 'Select people…')}
          </button>
        </div>

        {/* The panel body scrolls internally — the header/toggle above and
            the Cancel/Apply buttons each panel renders at its own end stay
            reachable no matter how long the "select people" list gets
            (39+ rows is common on a genuinely bad device-day). */}
        <div className="mt-3 space-y-3 overflow-y-auto min-h-0">
          {mode === 'batch'
            ? <BatchCorrectionPanel fix={fix} t={t} onClose={onClose} onDone={onDone} />
            : <SelectivePanel fix={fix} t={t} onClose={onClose} onDone={onDone} />}
        </div>
      </div>
    </div>
  );
}

function BatchCorrectionPanel({ fix, onClose, onDone, t }: { fix: any; onClose: () => void; onDone: () => void; t: TFn }) {
  // `fix.todayFirst` (from the health sweep) is null whenever the day's
  // stats haven't captured a first-arrival minute — which is exactly the
  // case for a manual, non-anomaly-triggered open. Without SOME reference
  // point the shift can never be computed, so Preview stayed permanently
  // disabled. Fall back to the earliest punch actually on file for this
  // device+date (same source the selective panel uses) so the button works
  // regardless of what the automated sweep did or didn't detect.
  const [todayFirst, setTodayFirst] = useState<number | null>(fix.todayFirst ?? null);
  useEffect(() => {
    if (fix.todayFirst != null) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/attendance/time-health?punches=1&device_sn=${encodeURIComponent(fix.device_sn)}&date=${encodeURIComponent(fix.date)}`, { cache: 'no-store' });
        const j = await r.json();
        const first = j.success && j.punches?.length ? j.punches[0].time : null; // already sorted by punch_at ASC
        if (!cancelled && first) {
          const [h, m] = first.split(':').map(Number);
          setTodayFirst(h * 60 + m);
        }
      } catch { /* leave null — Preview stays disabled if truly no data */ }
    })();
    return () => { cancelled = true; };
  }, [fix.device_sn, fix.date, fix.todayFirst]);

  // Ask the operator the natural question; derive the shift from the answer.
  const suggested = todayFirst != null && fix.suggestedShift
    ? fmtMin(todayFirst + fix.suggestedShift) : fmtMin(fix.baselineFirst ?? todayFirst);
  const [actualFirst, setActualFirst] = useState(suggested === '—' ? '' : suggested);
  useEffect(() => {
    // Once the fallback first-arrival resolves, seed the input if the
    // operator hasn't typed anything yet.
    if (actualFirst === '' && suggested !== '—') setActualFirst(suggested);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggested]);
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const shiftMinutes = (() => {
    if (!/^\d{2}:\d{2}$/.test(actualFirst) || todayFirst == null) return fix.suggestedShift || 0;
    const [h, m] = actualFirst.split(':').map(Number);
    return h * 60 + m - todayFirst;
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
    <>
      <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
        <p>{t('attendanceIntel.timeHealth.usuallyBegin', { time: fmtMin(fix.baselineFirst) }, 'First arrivals usually begin around {{time}}.')}</p>
        <p>{t('attendanceIntel.timeHealth.todayRecorded', { time: fmtMin(todayFirst) }, "Today's first recorded arrival is {{time}}.")}</p>
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
    </>
  );
}

/** Add signed minutes to an "HH:MM" string. Returns the wrapped time-of-day
 *  plus whether the shift pushed it into the next/previous calendar day —
 *  the actual attendance_date follows automatically on apply (the engine
 *  re-evaluates both the old and new date), this is just for the preview. */
function shiftHHMM(hhmm: string, minutes: number): { time: string; dayDelta: -1 | 0 | 1 } {
  const [h, m] = hhmm.split(':').map(Number);
  const raw = h * 60 + m + minutes;
  const dayDelta = raw < 0 ? -1 : raw >= 1440 ? 1 : 0;
  const total = ((raw % 1440) + 1440) % 1440;
  return { time: `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`, dayDelta };
}

/**
 * Selective correction — pick exactly which people's punches were wrong
 * (e.g. only a few learners got mis-scanned) and shift only those, leaving
 * the rest of the device's batch untouched. Backed by the existing
 * correct_selected API action; the only new surface is this UI.
 */
type Punch = { id: number; name: string | null; time: string; bucket: 'today' | 'previous_late' };

function PunchRow({ p, selected, shiftMinutes, onToggle, t }: {
  p: Punch; selected: boolean; shiftMinutes: number; onToggle: (id: number) => void; t: TFn;
}) {
  const after = selected && shiftMinutes !== 0 ? shiftHHMM(p.time, shiftMinutes) : null;
  return (
    <label className={`flex items-center justify-between gap-2 px-2.5 py-1.5 text-sm cursor-pointer ${selected ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}`}>
      <span className="flex items-center gap-2 min-w-0">
        <input type="checkbox" checked={selected} onChange={() => onToggle(p.id)} className="accent-indigo-600 flex-shrink-0" />
        <span className="truncate">{p.name || `#${p.id}`}</span>
      </span>
      <span className="flex items-center gap-1.5 flex-shrink-0 font-mono text-xs">
        <span className={after ? 'text-rose-500 line-through' : 'text-gray-600 dark:text-gray-300'}>{p.time}</span>
        {after && (
          <span className="text-emerald-600 font-semibold">
            {after.time}
            {after.dayDelta === 1 && <span className="ml-1 text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-400">{t('attendanceIntel.timeHealth.movesToToday', '→ today')}</span>}
            {after.dayDelta === -1 && <span className="ml-1 text-[10px] font-semibold uppercase text-amber-600">{t('attendanceIntel.timeHealth.movesToPrevDay', '→ prev. day')}</span>}
          </span>
        )}
      </span>
    </label>
  );
}

function SelectivePanel({ fix, onClose, onDone, t }: { fix: any; onClose: () => void; onDone: () => void; t: TFn }) {
  const [punches, setPunches] = useState<Punch[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sign, setSign] = useState<1 | -1>(1);
  const [hh, setHh] = useState('0');
  const [mm, setMm] = useState('0');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/attendance/time-health?punches=1&device_sn=${encodeURIComponent(fix.device_sn)}&date=${encodeURIComponent(fix.date)}`, { cache: 'no-store' });
        const j = await r.json();
        if (!cancelled) setPunches(j.success ? j.punches : []);
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [fix.device_sn, fix.date]);

  const shiftMinutes = sign * ((Number(hh) || 0) * 60 + (Number(mm) || 0));

  const toggle = (id: number) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const selectAll = () => setSelected(new Set((punches || []).map((p) => p.id)));
  const selectNone = () => setSelected(new Set());

  const doApply = useCallback(async () => {
    if (!selected.size || shiftMinutes === 0) return;
    setBusy(true);
    try {
      const r = await fetch('/api/attendance/time-health', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'correct_selected', ids: [...selected], shift_minutes: shiftMinutes }),
      });
      const j = await r.json();
      if (j.success) {
        toast.success(t('attendanceIntel.timeHealth.correctedToast', { affected: j.affected, days: j.reEvaluated }, 'Corrected {{affected}} punches · {{days}} day-verdicts refreshed'));
        onDone();
      } else toast.error(j.error || t('attendanceIntel.timeHealth.applyFailed', 'Apply failed'));
    } finally { setBusy(false); }
  }, [selected, shiftMinutes, onDone, t]);

  return (
    <>
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {t('attendanceIntel.timeHealth.selectiveIntro', 'Tick the people whose time is wrong, set the correction, then apply — everyone else stays untouched.')}
      </p>

      {loading && <div className="py-6 text-center"><Loader2 className="w-5 h-5 animate-spin text-indigo-600 inline" /></div>}

      {!loading && punches && punches.length === 0 && (
        <p className="text-sm text-gray-400 py-4 text-center">{t('attendanceIntel.timeHealth.noPunchesForDay', 'No punches found for this device on this day.')}</p>
      )}

      {!loading && punches && punches.length > 0 && (
        <>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">{t('attendanceIntel.timeHealth.selectedCount', { n: selected.size, total: punches.length }, '{{n}} of {{total}} selected')}</span>
            <div className="flex gap-3">
              <button onClick={selectAll} className="text-indigo-600 dark:text-indigo-400 hover:underline">{t('attendanceIntel.timeHealth.selectAll', 'Select all')}</button>
              <button onClick={selectNone} className="text-indigo-600 dark:text-indigo-400 hover:underline">{t('attendanceIntel.timeHealth.selectNone', 'Select none')}</button>
            </div>
          </div>

          {punches.some((p) => p.bucket === 'previous_late') && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-2.5">
              <p className="text-xs text-amber-800 dark:text-amber-200 font-medium">
                {t('attendanceIntel.timeHealth.previousLateWarn', "The people below currently show as arriving late last night — that's very likely today's early arrival, mis-clocked. Tick them and shift forward to move them onto today.")}
              </p>
              <div className="mt-1.5 max-h-52 overflow-y-auto rounded-md border border-amber-200 dark:border-amber-800 divide-y divide-amber-100 dark:divide-amber-900/50 bg-white dark:bg-gray-800">
                {punches.filter((p) => p.bucket === 'previous_late').map((p) => (
                  <PunchRow key={p.id} p={p} selected={selected.has(p.id)} shiftMinutes={shiftMinutes} onToggle={toggle} t={t} />
                ))}
              </div>
            </div>
          )}

          <div>
            {punches.some((p) => p.bucket === 'previous_late') && (
              <p className="text-[11px] font-semibold text-gray-400 uppercase mb-1">{t('attendanceIntel.timeHealth.todayGroup', 'Today')}</p>
            )}
            <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/50">
              {punches.filter((p) => p.bucket === 'today').map((p) => (
                <PunchRow key={p.id} p={p} selected={selected.has(p.id)} shiftMinutes={shiftMinutes} onToggle={toggle} t={t} />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-600 dark:text-gray-300">{t('attendanceIntel.timeHealth.shiftSelectedBy', 'Shift selected by')}</span>
            <select value={sign} onChange={(e) => setSign(Number(e.target.value) as 1 | -1)} className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700">
              <option value={1}>+</option>
              <option value={-1}>−</option>
            </select>
            <input type="number" min={0} value={hh} onChange={(e) => setHh(e.target.value)} className="w-16 px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-center" />
            <span className="text-gray-500">{t('attendanceIntel.timeHealth.hoursAbbr', 'h')}</span>
            <input type="number" min={0} max={59} value={mm} onChange={(e) => setMm(e.target.value)} className="w-16 px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-center" />
            <span className="text-gray-500">{t('attendanceIntel.timeHealth.minutesAbbr', 'm')}</span>
          </div>
        </>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500">{t('attendanceIntel.timeHealth.cancel', 'Cancel')}</button>
        <button onClick={doApply} disabled={busy || !selected.size || shiftMinutes === 0} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium disabled:opacity-50">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}{t('attendanceIntel.timeHealth.applyToSelected', { n: selected.size }, 'Apply to {{n}} selected')}
        </button>
      </div>
    </>
  );
}
