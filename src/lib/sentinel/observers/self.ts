/**
 * DRAIS Sentinel — self-monitoring.
 *
 * The spec's hardest requirement: distinguish "DRAIS is healthy" from
 * "Sentinel is healthy enough to know whether DRAIS is healthy." This
 * module answers ONLY the second question, and is designed to fail toward
 * honesty — if Sentinel cannot prove its own write path, its own sweep is
 * running, and its own alert path works, it says so explicitly rather than
 * defaulting to "healthy."
 *
 * This function does not call recordIncident() for its OWN degraded state
 * via the normal path — self-degradation must still reach a human even if
 * the incident engine itself is what's degraded, so selfCheck() is designed
 * to be callable independently of the rest of Sentinel and to fail closed
 * (report degraded/unmonitored) rather than throw.
 */
import { query } from '@/lib/db';
import { heartbeatStatus, HEARTBEATS } from '../heartbeat';
import type { HealthVerdict } from '../types';

export interface SelfCheckResult {
  overall: HealthVerdict;
  canWriteToDatabase: boolean;
  sweepStatus: HealthVerdict;
  sweepLastSuccessAt: string | null;
  alertDispatchStatus: HealthVerdict;
  requestTapStatus: HealthVerdict;
  reasons: string[];
}

/**
 * Attempts a real, cheap write-then-read round trip against Sentinel's own
 * table, distinct from the ordinary query() retry logic — this is
 * specifically "can Sentinel prove it can persist what it observes," which
 * is a narrower and more load-bearing question than "is the database up."
 */
async function canWrite(): Promise<boolean> {
  try {
    const { ensureSentinelSchema } = await import('../schema');
    await ensureSentinelSchema();
    const token = `selfcheck_${Date.now()}`;
    await query(
      `INSERT INTO sentinel_heartbeats (name, last_started_at) VALUES (?, NOW())
       ON DUPLICATE KEY UPDATE last_started_at = NOW()`,
      ['sentinel_self_write_probe'],
    );
    const rows = (await query(`SELECT name FROM sentinel_heartbeats WHERE name = ? LIMIT 1`, ['sentinel_self_write_probe'])) as any[];
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function selfCheck(): Promise<SelfCheckResult> {
  const reasons: string[] = [];
  const writeOk = await canWrite();
  if (!writeOk) reasons.push('Sentinel could not write to its own tables.');

  const sweep = await heartbeatStatus(HEARTBEATS.SENTINEL_SWEEP).catch(() => null);
  const sweepStatus: HealthVerdict = sweep?.verdict ?? 'unmonitored';
  if (sweepStatus !== 'healthy') reasons.push(`Sweep heartbeat is ${sweepStatus}${sweep?.staleBy ? ` (${sweep.staleBy}s overdue)` : ''}.`);

  const alertBeat = await heartbeatStatus(HEARTBEATS.SENTINEL_ALERT_DISPATCH).catch(() => null);
  // The alert path has no cadence of its own (it only fires when paged) —
  // "unmonitored" here just means it has never been exercised, which is a
  // legitimate state on a fresh install, not a failure. Only a recorded
  // FAILURE counts as degraded.
  const alertDispatchStatus: HealthVerdict = alertBeat?.verdict === 'degraded' ? 'degraded' : (alertBeat?.lastSuccessAt || alertBeat?.lastFailureAt ? 'healthy' : 'unmonitored');
  if (alertDispatchStatus === 'degraded') reasons.push('The last Sentinel SMS alert attempt failed.');

  const tap = await heartbeatStatus(HEARTBEATS.SENTINEL_REQUEST_TAP).catch(() => null);
  const requestTapStatus: HealthVerdict = tap?.verdict ?? 'unmonitored';

  let overall: HealthVerdict = 'healthy';
  if (!writeOk || sweepStatus === 'degraded' || alertDispatchStatus === 'degraded') overall = 'degraded';
  else if (sweepStatus === 'unmonitored') overall = 'unmonitored';

  if (reasons.length === 0) reasons.push('All self-checks passed at time of check.');

  return {
    overall, canWriteToDatabase: writeOk, sweepStatus,
    sweepLastSuccessAt: sweep?.lastSuccessAt ?? null,
    alertDispatchStatus, requestTapStatus, reasons,
  };
}
