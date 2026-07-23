/**
 * Attendance Intelligence Engine — per-record confidence scoring (Phase 3).
 *
 * Every attendance punch gets five sub-confidences and one overall score, so
 * an operator can trust (or distrust) a single row at a glance instead of
 * assuming the pipeline was perfect:
 *
 *   identity  — is this the right person?      (match state, score, provisional)
 *   device    — is the source device healthy?  (known SN, online, gate role)
 *   time      — is the timestamp believable?    (time_source, skew, clock health)
 *   policy    — was a real rule applied?        (rule/shift resolved vs fallback)
 *   attendance— overall: does the derived verdict hold together?
 *
 * scoreRecord() is PURE and fully unit-tested — no DB, no clock. The loaders
 * feed it evidence the pipeline already recorded (Digital Twin, Time
 * Intelligence, engine verdicts); nothing new is written.
 */

export type Band = 'high' | 'medium' | 'low';

export interface ConfidenceInput {
  // identity
  matched: number | boolean;
  personId: number | null;
  isProvisional: number | boolean;
  resolutionScore: number | null;      // 0..100 when the matcher set it
  resolutionPath: string | null;       // 'enrollment' | 'directory' | 'provisional' | …
  // device
  deviceSn: string | null;
  deviceKnown: boolean;                 // SN exists in devices table
  deviceOnline: number | boolean | null;
  // time
  timeSource: string | null;           // 'device' | 'server' | …
  clockSkewSeconds: number | null;
  clockConfidence: number | null;      // device_clock_health.confidence for the day (0..100), null = unknown
  wasCorrected: boolean;               // a time correction was applied to this batch/day
  // policy / verdict
  hasVerdict: boolean;                  // an attendance_records row exists
  ruleId: number | null;               // rule/shift resolved (null = fallback count only)
  derivedEvent: string | null;         // engine stamped this punch
}

export interface Confidence { score: number; band: Band; reason: string; }
export interface RecordConfidence {
  overall: Confidence;
  identity: Confidence;
  device: Confidence;
  time: Confidence;
  policy: Confidence;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
export const bandOf = (score: number): Band => (score >= 85 ? 'high' : score >= 60 ? 'medium' : 'low');
const c = (score: number, reason: string): Confidence => ({ score: clamp(score), band: bandOf(clamp(score)), reason });

function identityConfidence(i: ConfidenceInput): Confidence {
  const matched = Number(i.matched) === 1 && i.personId != null;
  if (!matched) return c(10, 'Unmatched — no confirmed person for this PIN');
  if (Number(i.isProvisional)) return c(55, 'Provisional identity — auto-linked, not yet confirmed');
  if (i.resolutionScore != null) {
    // A real matcher score maps directly (≥90 auto-tier, 60-89 review).
    const s = Number(i.resolutionScore);
    return c(Math.max(60, s), `Matched via ${i.resolutionPath || 'matcher'} (score ${s})`);
  }
  if (i.resolutionPath === 'enrollment' || i.resolutionPath == null) return c(97, 'Confirmed biometric enrollment');
  return c(88, `Matched via ${i.resolutionPath}`);
}

function deviceConfidence(i: ConfidenceInput): Confidence {
  if (!i.deviceSn) return c(40, 'No device serial recorded on this punch');
  if (!i.deviceKnown) return c(50, `Device ${i.deviceSn} is not registered`);
  if (i.deviceOnline === 0 || i.deviceOnline === false) return c(80, 'Known device, currently offline (backlog upload is normal)');
  return c(96, 'Known, healthy device');
}

function timeConfidence(i: ConfidenceInput): Confidence {
  // The clock-health verdict for the day is the strongest signal when present.
  if (i.clockConfidence != null) {
    const cc = Number(i.clockConfidence);
    if (i.wasCorrected) return c(Math.max(cc, 90), 'Timestamp corrected and re-verified');
    if (cc < 60) return c(cc, 'Device clock flagged as drifting for this day');
    if (cc < 85) return c(cc, 'Device clock under review for this day');
    return c(cc, 'Device clock verified for this day');
  }
  const skew = i.clockSkewSeconds == null ? null : Math.abs(Number(i.clockSkewSeconds));
  if (i.wasCorrected) return c(90, 'Timestamp corrected');
  if (skew != null && skew > 3600) return c(30, `Large clock skew (${Math.round(skew / 60)} min)`);
  if (skew != null && skew > 300) return c(65, `Moderate clock skew (${Math.round(skew / 60)} min)`);
  if (i.timeSource === 'server') return c(88, 'Server-assigned time (device time not trusted)');
  return c(90, 'Device time within tolerance');
}

function policyConfidence(i: ConfidenceInput): Confidence {
  if (!i.hasVerdict) return c(45, 'No day verdict yet — not evaluated');
  if (i.ruleId == null) return c(70, 'Evaluated on raw presence (no specific rule/shift matched)');
  if (Number(i.ruleId) < 0) return c(95, 'Evaluated against the staff shift');
  return c(96, `Evaluated against rule #${i.ruleId}`);
}

/** PURE: five sub-scores + a weighted overall. Weights favor identity + time,
 *  the two failure modes that actually corrupt attendance meaning. */
export function scoreRecord(i: ConfidenceInput): RecordConfidence {
  const identity = identityConfidence(i);
  const device = deviceConfidence(i);
  const time = timeConfidence(i);
  const policy = policyConfidence(i);

  const W = { identity: 0.4, time: 0.3, device: 0.15, policy: 0.15 };
  let overallScore =
    identity.score * W.identity + time.score * W.time + device.score * W.device + policy.score * W.policy;
  // Identity and time are gates, not just weights: a healthy device + rule
  // can't rescue a record whose subject or timestamp is untrustworthy. Cap
  // the overall near the weaker of the two so a wrong-person or wrong-clock
  // punch can never read as "trusted".
  overallScore = Math.min(overallScore, Math.min(identity.score, time.score) + 25);

  // The overall reason names the weakest meaningful contributor.
  const weakest = [identity, time, device, policy].sort((a, b) => a.score - b.score)[0];
  const overall = c(
    overallScore,
    bandOf(clamp(overallScore)) === 'high' ? 'All checks strong' : `Lowered by: ${weakest.reason.toLowerCase()}`,
  );
  return { overall, identity, device, time, policy };
}
