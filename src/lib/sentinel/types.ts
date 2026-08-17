/**
 * DRAIS Sentinel — shared types (v1).
 *
 * Sentinel is the internal reliability/anomaly-detection layer. This file is
 * the contract every observer, the incident engine, and the diagnosis engine
 * share. Keep it small — Sentinel's own design principle is "smallest
 * coherent schema," and types drift the same way tables do if left open.
 */

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export const SEVERITY_RANK: Record<Severity, number> = {
  info: 1, low: 2, medium: 3, high: 4, critical: 5,
};

/** PURE. Higher rank = more severe. Used for sort + escalation comparisons. */
export function severityRank(s: Severity): number { return SEVERITY_RANK[s]; }

/** PURE. The more severe of two severities. */
export function maxSeverity(a: Severity, b: Severity): Severity {
  return severityRank(a) >= severityRank(b) ? a : b;
}

export type IncidentStatus = 'open' | 'acknowledged' | 'resolved' | 'suppressed';

/** Confidence is a plain 0-100 integer, never hidden behind fake precision. */
export type Confidence = number;

/**
 * Every distinct *kind* of problem Sentinel can recognise. This is the
 * dedup grain: (kind, scope, school_id, module) identifies "the same
 * problem," so a flood of the same failure becomes ONE incident with an
 * occurrence count, not one incident per event.
 */
export type IncidentKind =
  | 'attendance_timestamp_anomaly'
  | 'attendance_no_punches'
  | 'attendance_aggregate_stale'
  | 'background_job_stale'
  | 'background_job_unmonitored'
  | 'background_job_failing'
  | 'notification_queue_backlog'
  | 'notification_delivery_failing'
  | 'device_offline'
  | 'device_clock_drift'
  | 'tenant_isolation_drift'
  | 'auth_bruteforce_pattern'
  | 'auth_privilege_anomaly'
  | 'api_error_rate_anomaly'
  | 'api_latency_anomaly'
  | 'academic_generation_failure'
  | 'academic_results_import_failure'
  | 'sentinel_self_degraded'
  | 'sentinel_alert_path_degraded';

export type ObserverName =
  | 'attendance' | 'background_jobs' | 'notifications' | 'devices'
  | 'tenant_isolation' | 'security' | 'fleet' | 'self' | 'route' | 'academics';

export interface EvidenceItem {
  label: string;
  value: string | number | boolean | null;
}

/** What an observer hands to the incident engine. Not yet an incident. */
export interface Observation {
  kind: IncidentKind;
  observer: ObserverName;
  /** null = platform-wide (global), not tied to one school. */
  schoolId: number | null;
  /** Human-readable module/route name, e.g. "Attendance Logs". */
  module: string;
  severity: Severity;
  confidence: Confidence;
  probableCause: string;
  userImpact: string;
  technicalImpact: string;
  evidence: EvidenceItem[];
  recommendedAction: string;
  autoRemediationSafe: boolean;
  notifyRequired: boolean;
  /** Explicit dedup grain override. Default derived from kind+scope+module. */
  dedupKey?: string;
}

export interface Incident {
  id: number;
  dedupKey: string;
  kind: IncidentKind;
  observer: ObserverName;
  scope: 'global' | 'school';
  schoolId: number | null;
  schoolName: string | null;
  module: string;
  severity: Severity;
  confidence: Confidence;
  status: IncidentStatus;
  firstDetectedAt: string;
  lastDetectedAt: string;
  occurrenceCount: number;
  probableCause: string;
  userImpact: string;
  technicalImpact: string;
  evidence: EvidenceItem[];
  recommendedAction: string;
  autoRemediationSafe: boolean;
  notifyRequired: boolean;
  notifiedAt: string | null;
  acknowledgedBy: number | null;
  acknowledgedAt: string | null;
  resolvedBy: number | null;
  resolvedAt: string | null;
  suppressedReason: string | null;
}

/** The only three states Sentinel is allowed to report for a monitored fact. */
export type HealthVerdict = 'healthy' | 'degraded' | 'unmonitored';

export interface HeartbeatStatus {
  name: string;
  verdict: HealthVerdict;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  consecutiveFailures: number;
  expectedIntervalSeconds: number | null;
  staleBy: number | null; // seconds overdue, if degraded/stale
}

export const SENTINEL_VERSION = '1.0.0';
export const DIAGNOSTIC_ENGINE_VERSION = '1.0.0';
