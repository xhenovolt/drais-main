/**
 * DRAIS Sentinel — incident transition logic (PURE, unit-tested).
 *
 * Extracted out of incidents.ts specifically so the chaos suite can assert
 * exact behaviour for "10,000 identical failures", "a resolved incident
 * recurring at higher severity", "a resolved incident recurring at the SAME
 * severity" etc. WITHOUT a database — matching this codebase's existing
 * convention of keeping business rules pure and I/O thin (healthScore,
 * severityRank, computeBackoffSeconds, isDue all follow this shape).
 */
import { escalateByPersistence, severityRank } from './severity';
import type { IncidentStatus, Severity } from './types';

export interface ExistingIncidentFacts {
  occurrenceCount: number;
  status: IncidentStatus;
  severity: Severity;
}

export interface TransitionResult {
  isNew: boolean;
  occurrenceCount: number;
  severity: Severity;
  status: IncidentStatus;
  /** true = this occurrence reopened a resolved/suppressed incident */
  reopened: boolean;
  /** true = only the occurrence count/timestamp should update — no reopen, no re-alert */
  silentRecurrence: boolean;
}

/**
 * PURE. The entire "is this the same problem, and what should happen to it"
 * decision. `incomingSeverity` is what the observer assessed THIS occurrence
 * as, before persistence-based escalation.
 */
export function decideTransition(existing: ExistingIncidentFacts | null, incomingSeverity: Severity): TransitionResult {
  if (!existing) {
    return { isNew: true, occurrenceCount: 1, severity: incomingSeverity, status: 'open', reopened: false, silentRecurrence: false };
  }

  const occurrenceCount = existing.occurrenceCount + 1;
  const severity = escalateByPersistence(incomingSeverity, occurrenceCount);

  if (existing.status === 'resolved' || existing.status === 'suppressed') {
    const reopens = severityRank(severity) > severityRank(existing.severity);
    if (!reopens) {
      return { isNew: false, occurrenceCount, severity: existing.severity, status: existing.status, reopened: false, silentRecurrence: true };
    }
    return { isNew: false, occurrenceCount, severity, status: 'open', reopened: true, silentRecurrence: false };
  }

  return { isNew: false, occurrenceCount, severity, status: existing.status, reopened: false, silentRecurrence: false };
}
