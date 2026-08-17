/**
 * DRAIS Sentinel — attendance timestamp/timezone observer.
 *
 * The flagship "JIPRA-type" detector from the spec: a route can return
 * HTTP 200 with real records and still be BROKEN from the viewer's chair —
 * timestamps consistently several hours off. Technical status healthy,
 * user experience broken.
 *
 * Reuses evidence DRAIS already computes per punch (attendance_raw_events.
 * clock_skew_seconds, written by the ingestion engine — see
 * src/lib/attendance/engine.ts and device-clock.ts) rather than re-deriving
 * timezone math. This observer's job is narrower and complementary: given
 * the exact rows a route is about to hand to a viewer, is there a
 * SUSTAINED, CONSISTENT effective offset that a device-level correction
 * hasn't already resolved? That is a genuinely different question from "is
 * this one device's clock drifting" (already covered by device-clock-health)
 * — it is "what will the human looking at this screen right now conclude."
 *
 * Runs on data the route ALREADY fetched for its response — zero extra
 * database round-trips, negligible cost. Works for any school; nothing here
 * is JIPRA-specific.
 */
import type { EvidenceItem, Observation } from '../types';

export interface SkewSample {
  clockSkewSeconds: number | null;
  timeConfidence?: string | null;
}

export interface TimestampAnomalyResult {
  anomaly: boolean;
  sampleSize: number;
  effectiveOffsetHours: number;
  consistentFraction: number;
  confidence: number;
}

const MIN_SAMPLE = 5;
const OFFSET_THRESHOLD_HOURS = 1.5;
const CONSISTENCY_THRESHOLD = 0.6;
const CONSISTENCY_WINDOW_SECONDS = 30 * 60;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * PURE. Given the skew samples already attached to the rows a route is
 * about to serve, decide whether they show a systematic timestamp anomaly
 * an unresolved correction has left visible to the viewer.
 */
export function detectTimestampAnomaly(samples: SkewSample[]): TimestampAnomalyResult {
  const skews = samples
    .map((s) => s.clockSkewSeconds)
    .filter((v): v is number => v != null && Number.isFinite(v));

  if (skews.length < MIN_SAMPLE) {
    return { anomaly: false, sampleSize: skews.length, effectiveOffsetHours: 0, consistentFraction: 0, confidence: 0 };
  }

  const med = median(skews);
  const consistent = skews.filter((v) => Math.abs(v - med) <= CONSISTENCY_WINDOW_SECONDS).length;
  const consistentFraction = consistent / skews.length;
  const effectiveOffsetHours = med / 3600;
  const anomaly = Math.abs(effectiveOffsetHours) >= OFFSET_THRESHOLD_HOURS && consistentFraction >= CONSISTENCY_THRESHOLD;

  // Confidence rises with sample size and how tight the consistency is.
  const confidence = anomaly
    ? Math.min(97, Math.round(55 + consistentFraction * 30 + Math.min(skews.length, 40) * 0.3))
    : 0;

  return { anomaly, sampleSize: skews.length, effectiveOffsetHours: Math.round(effectiveOffsetHours * 10) / 10, consistentFraction: Math.round(consistentFraction * 100) / 100, confidence };
}

/**
 * Turn a positive detection into an Observation for the incident engine.
 * `schoolName` is display-only (goes in evidence, not the dedup key), so
 * this never hardcodes a school — it works identically for any tenant.
 */
export function toObservation(
  schoolId: number, schoolName: string, module: string, result: TimestampAnomalyResult,
): Observation {
  const direction = result.effectiveOffsetHours >= 0 ? 'ahead' : 'behind';
  const evidence: EvidenceItem[] = [
    { label: 'Records sampled', value: result.sampleSize },
    { label: 'Effective offset', value: `${Math.abs(result.effectiveOffsetHours)}h ${direction}` },
    { label: 'Consistency', value: `${Math.round(result.consistentFraction * 100)}% of samples within 30 min of each other` },
  ];
  return {
    kind: 'attendance_timestamp_anomaly',
    observer: 'attendance',
    schoolId,
    module,
    severity: Math.abs(result.effectiveOffsetHours) >= 3 ? 'high' : 'medium',
    confidence: result.confidence,
    probableCause: 'Device timezone / application timezone mismatch, or an uncorrected device clock, is offsetting attendance timestamps for this school.',
    userImpact: `Administrators viewing ${module} may interpret attendance times incorrectly — records look ${Math.abs(result.effectiveOffsetHours)}h ${direction} of when the punch actually happened.`,
    technicalImpact: `${module} returns HTTP 200 with real records; the anomaly is in the data, not the route.`,
    evidence,
    recommendedAction: 'Check the device clock, its configured timezone, and whether the auto-correction sweep has run for this device since the drift started.',
    autoRemediationSafe: false,
    notifyRequired: true,
    dedupKey: `attendance_timestamp_anomaly::${schoolId}::${module}`,
  };
}
