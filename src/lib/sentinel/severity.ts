/**
 * DRAIS Sentinel — escalation rules (PURE, unit-tested).
 *
 * Anti-noise is a first-class requirement: a flood of the same failure must
 * become ONE incident whose severity climbs with persistence and scope, not
 * one alert per event. These functions contain every rule that decides that
 * climb, kept pure so the chaos suite can assert exact outputs without a
 * database.
 */
import type { Severity } from './types';
import { severityRank, maxSeverity } from './types';

export { severityRank, maxSeverity };

/**
 * Escalate a base severity by how long/persistently a problem has recurred.
 * Mirrors the spec's LOW → MEDIUM → HIGH → CRITICAL ladder without ever
 * *downgrading* what an observer already assessed as more severe than the
 * persistence alone would justify (e.g. a tenant-isolation drift starts at
 * `critical` and stays there regardless of occurrence count).
 *
 *   occurrences 1        → base severity, unchanged
 *   occurrences 2–4       → floor at 'low'
 *   occurrences 5–19      → floor at 'medium'
 *   occurrences 20–99     → floor at 'high'
 *   occurrences 100+      → floor at 'critical'
 */
export function escalateByPersistence(base: Severity, occurrenceCount: number): Severity {
  let floor: Severity = 'info';
  if (occurrenceCount >= 100) floor = 'critical';
  else if (occurrenceCount >= 20) floor = 'high';
  else if (occurrenceCount >= 5) floor = 'medium';
  else if (occurrenceCount >= 2) floor = 'low';
  return maxSeverity(base, floor);
}

/**
 * Escalate by scope — the same problem hitting many schools simultaneously
 * is structurally worse than one school seeing it repeatedly (it points at
 * the platform, not a single school's data/config).
 */
export function escalateByScope(base: Severity, affectedSchoolCount: number): Severity {
  let floor: Severity = 'info';
  if (affectedSchoolCount >= 10) floor = 'critical';
  else if (affectedSchoolCount >= 5) floor = 'high';
  else if (affectedSchoolCount >= 2) floor = 'medium';
  return maxSeverity(base, floor);
}

/**
 * Whether a severity crossing warrants firing the independent SMS alert.
 * Deliberately conservative — the spec is explicit that INFO/LOW must never
 * page anyone, or Sentinel becomes noise and gets ignored. MEDIUM does not
 * page either; it is visible in Control Centre but does not wake anyone up.
 */
export function requiresSmsAlert(severity: Severity): boolean {
  return severity === 'high' || severity === 'critical';
}

/**
 * Re-notification backoff: once a HIGH/CRITICAL incident has paged once,
 * don't page again for the same still-open incident within this window
 * unless it has escalated further (handled by the caller comparing severity
 * to the severity recorded at last notify). Keeps a persistent problem from
 * re-paging every sweep tick.
 */
export const RENOTIFY_COOLDOWN_SECONDS = 30 * 60;
