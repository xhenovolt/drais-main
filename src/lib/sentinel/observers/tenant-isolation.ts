/**
 * DRAIS Sentinel — tenant-isolation observer.
 *
 * Two complementary signals, deliberately kept separate because they answer
 * different questions:
 *
 *   STATIC  (this file, via the architecture manifest) — "how much of the
 *   codebase goes through the enforced queryTenant() wrapper vs. raw
 *   query()?" This is a structural/architectural fact, refreshed only when
 *   the scanner re-runs (scripts/sentinel/architecture-scan.mjs), NOT on
 *   every request. It answers "is this class of bug still structurally
 *   possible," not "did it just happen."
 *
 *   RUNTIME (checkCrossTenantLeak) — a cheap, request-adjacent assertion:
 *   given a school_id a caller expected and the actual distinct school_ids
 *   present in a result set, did more than one tenant's data come back?
 *   This is the closest thing to directly observing the two incidents the
 *   codebase's own regression test says already happened (device roster,
 *   device logs). It is opt-in per call site — Sentinel cannot retrofit
 *   this into 699 routes itself; it gives call sites a one-line check.
 */
import manifest from '../generated/architecture-manifest.json';
import type { Observation } from '../types';

const ADOPTION_WARN_THRESHOLD = 0.5;   // below 50% adoption → medium
const ADOPTION_CRITICAL_THRESHOLD = 0.1; // below 10% → high (today's actual state)

export function observeTenantIsolationStatic(): Observation[] {
  const repo = (manifest as any).repo;
  if (!repo) return [];
  const total = Number(repo.rawQueryFiles ?? 0) + Number(repo.tenantSafeWrapperFiles ?? 0);
  if (total === 0) return [];
  const adoption = Number(repo.tenantSafeWrapperFiles ?? 0) / total;

  if (adoption >= ADOPTION_WARN_THRESHOLD) return [];

  const severity = adoption < ADOPTION_CRITICAL_THRESHOLD ? 'high' : 'medium';
  return [{
    kind: 'tenant_isolation_drift',
    observer: 'tenant_isolation',
    schoolId: null,
    module: 'API routes — tenant scoping',
    severity,
    confidence: 95,
    probableCause: 'The enforced tenant-safe query wrapper (queryTenant/execTenant) exists but most API routes still use the unenforced query() directly, relying on the author remembering a school_id filter.',
    userImpact: 'No symptom today, but this is the exact structural gap behind DRAIS\'s two confirmed historical cross-tenant leaks (device roster, device logs).',
    technicalImpact: `${repo.tenantSafeWrapperFiles} of ${total} tenant-touching files use the enforced wrapper (${Math.round(adoption * 100)}%).`,
    evidence: [
      { label: 'Files using queryTenant/execTenant', value: repo.tenantSafeWrapperFiles },
      { label: 'Files using raw query()', value: repo.rawQueryFiles },
      { label: 'Manifest generated', value: (manifest as any).generatedAt },
      { label: 'Commit scanned', value: (manifest as any).commitSha ?? 'unknown' },
    ],
    recommendedAction: 'Add a CI rule that fails a route file touching a tenant table without going through queryTenant/execTenant; migrate list/export/bulk routes first.',
    autoRemediationSafe: false,
    notifyRequired: false, // structural finding, not an active incident — surfaced in diagnosis, not paged
    dedupKey: 'tenant_isolation_drift::global::api_routes',
  }];
}

/**
 * RUNTIME. Call from a route that just fetched a result set on behalf of
 * ONE school: pass the schoolId the caller trusted and the distinct
 * school_ids actually present in what's about to be returned. Cheap
 * (already-fetched data, no extra query) — returns an Observation only if
 * a leak is detected.
 */
export function checkCrossTenantLeak(
  module: string, expectedSchoolId: number, actualSchoolIds: Array<number | null | undefined>,
): Observation | null {
  const foreign = new Set(actualSchoolIds.filter((id): id is number => id != null && id !== expectedSchoolId));
  if (foreign.size === 0) return null;
  return {
    kind: 'tenant_isolation_drift',
    observer: 'tenant_isolation',
    schoolId: expectedSchoolId,
    module,
    severity: 'critical',
    confidence: 99,
    probableCause: `${module} returned rows belonging to ${foreign.size} other school(s) for a request scoped to school ${expectedSchoolId}.`,
    userImpact: 'A school may be seeing another school\'s data. This is a trust-ending event if a customer notices it first.',
    technicalImpact: `Foreign school_id(s) present in response: ${[...foreign].slice(0, 5).join(', ')}${foreign.size > 5 ? '…' : ''}.`,
    evidence: [{ label: 'Expected school', value: expectedSchoolId }, { label: 'Foreign schools in response', value: foreign.size }],
    recommendedAction: 'Treat as P0. Identify and patch the missing school_id filter in this route immediately; audit recently deployed changes to it.',
    autoRemediationSafe: false,
    notifyRequired: true,
    dedupKey: `tenant_isolation_drift::${expectedSchoolId}::${module}::runtime`,
  };
}
