/**
 * Device Intelligence (Phase 7 of the Intelligence Program).
 *
 * Every biometric device becomes self-monitored: a Device Reputation Score
 * composed from four measured reliabilities —
 *
 *   clock   — RTC health: clock-anomaly days (device_clock_health, 30d)
 *   upload  — how promptly punches reach the server (ingest lag) + gap days
 *   heartbeat — how consistently the device is seen online
 *   activity  — is it actually being used (punch volume vs learned normal)
 *
 * scoreDevice() is PURE and unit-tested. The loader feeds it evidence the
 * pipeline already records; nothing is written. Devices that repeatedly
 * drift or go silent are flagged for maintenance (RTC battery, network).
 */

export type Band = 'excellent' | 'good' | 'fair' | 'poor';

export interface DeviceSignals {
  known: boolean;
  isOnline: boolean;
  minutesSinceLastSeen: number | null;   // heartbeat age
  clockAnomalyDays: number;               // days flagged 'anomaly' in last 30
  clockTrackedDays: number;               // days with any clock-health record
  avgClockConfidence: number | null;      // mean device_clock_health.confidence (0..100)
  medianIngestLagMin: number | null;      // typical punch_at→ingested_at lag
  gapDays30: number;                       // school days in last 30 with 0 punches
  activeDays30: number;                    // school days in last 30 with punches
  firmware: string | null;
}

export interface SubScore { score: number; label: string; }
export interface DeviceReputation {
  overall: number;
  band: Band;
  clock: SubScore;
  upload: SubScore;
  heartbeat: SubScore;
  activity: SubScore;
  recommendation: string | null;
  headline: string;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
export const bandOf = (s: number): Band => (s >= 90 ? 'excellent' : s >= 75 ? 'good' : s >= 55 ? 'fair' : 'poor');
const sub = (score: number, label: string): SubScore => ({ score: clamp(score), label });

function clockScore(s: DeviceSignals): SubScore {
  if (s.clockTrackedDays === 0) return sub(85, 'No clock history yet');
  const anomalyRate = s.clockAnomalyDays / s.clockTrackedDays;
  const base = 100 - anomalyRate * 100;
  // A low average confidence pulls it further down even without hard anomalies.
  const conf = s.avgClockConfidence == null ? base : Math.min(base, s.avgClockConfidence + 10);
  if (s.clockAnomalyDays >= 3) return sub(Math.min(conf, 45), `${s.clockAnomalyDays} clock-drift days in 30`);
  if (s.clockAnomalyDays > 0) return sub(conf, `${s.clockAnomalyDays} clock-drift day(s) in 30`);
  return sub(conf, 'Clock steady');
}

function uploadScore(s: DeviceSignals): SubScore {
  const lag = s.medianIngestLagMin;
  let score = 100;
  let note = 'Punches arrive promptly';
  if (lag != null) {
    if (lag > 240) { score = 55; note = `Typically ${Math.round(lag / 60)}h late (heavy store-and-forward)`; }
    else if (lag > 60) { score = 75; note = `Typically ${lag} min late`; }
    else if (lag > 15) { score = 90; note = 'Minor upload delay'; }
  }
  // Gap days hurt upload reliability directly.
  if (s.gapDays30 > 0) {
    const penalty = Math.min(45, s.gapDays30 * 9);
    score = Math.min(score, 100 - penalty);
    note = `${s.gapDays30} day(s) with no uploads in 30`;
  }
  return sub(score, note);
}

function heartbeatScore(s: DeviceSignals): SubScore {
  if (s.minutesSinceLastSeen == null) return sub(50, 'Never checked in');
  const m = s.minutesSinceLastSeen;
  if (s.isOnline && m <= 15) return sub(100, 'Online, fresh heartbeat');
  if (m <= 60) return sub(88, 'Seen within the hour');
  if (m <= 24 * 60) return sub(65, `Last seen ${Math.round(m / 60)}h ago`);
  return sub(30, `Silent ${Math.round(m / 1440)}d`);
}

function activityScore(s: DeviceSignals): SubScore {
  const totalDays = s.activeDays30 + s.gapDays30;
  if (totalDays === 0) return sub(80, 'No recent expectation set');
  const useRate = s.activeDays30 / totalDays;
  if (useRate >= 0.9) return sub(100, 'In steady daily use');
  if (useRate >= 0.6) return sub(80, 'Used most days');
  if (useRate >= 0.3) return sub(55, 'Intermittent use');
  return sub(30, 'Rarely producing data');
}

/** PURE: four reliabilities → a weighted reputation + maintenance advice. */
export function scoreDevice(s: DeviceSignals): DeviceReputation {
  const clock = clockScore(s);
  const upload = uploadScore(s);
  const heartbeat = heartbeatScore(s);
  const activity = activityScore(s);

  const W = { clock: 0.3, upload: 0.3, heartbeat: 0.25, activity: 0.15 };
  const overall = clamp(clock.score * W.clock + upload.score * W.upload + heartbeat.score * W.heartbeat + activity.score * W.activity);
  const band = bandOf(overall);

  // Recommendation targets the weakest reliability, most actionable first.
  let recommendation: string | null = null;
  if (s.clockAnomalyDays >= 3) recommendation = 'Replace the RTC coin-cell battery — the clock drifts repeatedly.';
  else if (heartbeat.score < 55) recommendation = 'Check the device power and network — it is going silent.';
  else if (upload.score < 60) recommendation = 'Uploads are unreliable — verify the ADMS/push settings or pull over LAN.';
  else if (activity.score < 55) recommendation = 'Device is barely used — confirm it is still deployed where expected.';
  else if (band === 'poor' || band === 'fair') recommendation = 'Monitor this device; reliability is below the fleet standard.';

  const headline = band === 'excellent' ? 'Reliable'
    : band === 'good' ? 'Healthy'
      : band === 'fair' ? 'Needs attention'
        : 'Maintenance required';

  return { overall, band, clock, upload, heartbeat, activity, recommendation, headline };
}
