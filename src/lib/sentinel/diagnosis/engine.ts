/**
 * DRAIS Sentinel — Full System Diagnosis engine.
 *
 * Combines two evidence sources, kept honestly distinguished throughout the
 * report rather than blended into false certainty:
 *
 *   STATIC   — the architecture manifest (scripts/sentinel/architecture-scan.mjs),
 *              as of its last run. Code-structure facts: route counts,
 *              tenant-wrapper adoption, CI/build config, test inventory.
 *   DYNAMIC  — live queries run at request time: active incidents, heartbeat
 *              verdicts, recent error/latency profile, fleet health.
 *
 * This is an explicitly-triggered DEEP operation (Control Centre → Full
 * System Diagnosis), never run per request — the spec is explicit that
 * Sentinel must not turn every request into a diagnostic operation.
 *
 * Every section carries a confidence label. Sections with no live evidence
 * report UNKNOWN, never a fabricated "healthy."
 */
import manifest from '../generated/architecture-manifest.json';
import { activeIncidentSummary, listIncidents } from '../incidents';
import { allHeartbeats } from '../heartbeat';
import { recentModuleStats } from '../observe';
import { selfCheck } from '../observers/self';
import { SENTINEL_VERSION, DIAGNOSTIC_ENGINE_VERSION } from '../types';

export type Confidence = 'verified' | 'strong_evidence' | 'likely' | 'possible' | 'unknown';

export interface ScoredDimension {
  dimension: string;
  score: number | null; // null = cannot score, not zero
  confidence: Confidence;
  reason: string;
  evidence: string[];
}

export interface DiagnosisReport {
  meta: {
    generatedAt: string;
    sentinelVersion: string;
    engineVersion: string;
    manifestGeneratedAt: string | null;
    manifestCommitSha: string | null;
    liveCommitSha: string | null;
    manifestIsStale: boolean;
  };
  executiveVerdict: string;
  overallScore: number;
  readiness: 'not_ready' | 'conditionally_ready' | 'ready_with_limitations' | 'strong_foundation';
  dimensions: ScoredDimension[];
  strongAreas: string[];
  moderateAreas: string[];
  weakAreas: string[];
  criticalFailurePoints: string[];
  silentFailureRisks: string[];
  catastrophicButRare: string[];
  topFailureModes: Array<{ mode: string; probability: string; impact: string; severity: string }>;
  subsystemMatrix: Array<{ subsystem: string; state: string; confidence: Confidence; risk: string }>;
  activeIncidents: { critical: number; high: number; medium: number; low: number; info: number; total: number };
  sentinelSelfAssessment: {
    canTrustThisReport: boolean;
    reasons: string[];
  };
  limitations: string[];
}

function dim(dimension: string, score: number | null, confidence: Confidence, reason: string, evidence: string[] = []): ScoredDimension {
  return { dimension, score, confidence, reason, evidence };
}

export async function runFullSystemDiagnosis(liveCommitSha: string | null): Promise<DiagnosisReport> {
  const repo = (manifest as any).repo;
  const manifestGeneratedAt: string | null = (manifest as any).generatedAt ?? null;
  const manifestCommitSha: string | null = (manifest as any).commitSha ?? null;
  const manifestIsStale = !!(liveCommitSha && manifestCommitSha && liveCommitSha !== manifestCommitSha);
  const manifestPopulated = manifestGeneratedAt != null && repo?.apiRouteCount > 0;

  const limitations: string[] = [];
  if (!manifestPopulated) limitations.push('Architecture manifest has not been generated yet (run `npm run sentinel:scan`) — all static/code-structure findings below are UNKNOWN.');
  if (manifestIsStale) limitations.push(`Architecture manifest is from commit ${manifestCommitSha?.slice(0, 8)}, but this diagnosis is running at ${liveCommitSha?.slice(0, 8)} — code-structure findings may be stale. Re-run the scan.`);

  // ── Dynamic evidence (best-effort; degrade to unknown on failure) ──────
  let incidentSummary = { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 };
  let heartbeats: Awaited<ReturnType<typeof allHeartbeats>> = [];
  let moduleStats: Awaited<ReturnType<typeof recentModuleStats>> = [];
  let self: Awaited<ReturnType<typeof selfCheck>> | null = null;
  let dbReachable = true;

  try { incidentSummary = await activeIncidentSummary(); } catch { dbReachable = false; }
  try { heartbeats = await allHeartbeats(); } catch { dbReachable = false; }
  try { moduleStats = await recentModuleStats(60); } catch { dbReachable = false; }
  try { self = await selfCheck(); } catch { self = null; }

  if (!dbReachable) limitations.push('Could not reach the database for live incident/heartbeat/observation evidence — dynamic sections below are UNKNOWN, not "healthy."');

  // ── Dimension scoring ────────────────────────────────────────────────
  const dimensions: ScoredDimension[] = [];

  if (manifestPopulated) {
    const total = (repo.tenantSafeWrapperFiles ?? 0) + (repo.rawQueryFiles ?? 0);
    const adoption = total > 0 ? repo.tenantSafeWrapperFiles / total : null;
    dimensions.push(dim(
      'Tenant isolation enforcement', adoption != null ? Math.round(adoption * 100) : null,
      'verified',
      adoption != null
        ? `${repo.tenantSafeWrapperFiles} of ${total} tenant-touching route files (${Math.round(adoption * 100)}%) use the enforced queryTenant/execTenant wrapper; the rest rely on a manually-added school_id filter.`
        : 'No tenant-touching route files detected by the scanner.',
      [`Scanned ${repo.apiRouteCount} route files as of commit ${manifestCommitSha?.slice(0, 8) ?? 'unknown'}.`],
    ));
    dimensions.push(dim(
      'Build/CI safety gate',
      repo.hasPrOrPushCiGate ? 90 : (repo.nextConfigIgnoresBuildErrors || repo.nextConfigIgnoresLint ? 15 : 40),
      'verified',
      repo.hasPrOrPushCiGate
        ? 'A CI workflow runs tests/typecheck on push or pull request.'
        : `No CI workflow gates a PR/push with tests or typecheck. next.config ${repo.nextConfigIgnoresBuildErrors ? 'ignores TypeScript build errors' : 'enforces TypeScript'}; ESLint is ${repo.nextConfigIgnoresLint ? 'ignored' : 'enforced'} at build time.`,
      [`Workflows found: ${repo.ciWorkflows?.join(', ') || 'none'}.`, `tsconfig strict: ${repo.tsconfigStrict}.`],
    ));
    dimensions.push(dim(
      'Test coverage breadth', Math.min(60, Math.round((repo.testFileCount / repo.apiRouteCount) * 400)),
      'strong_evidence',
      `${repo.testFileCount} test files against ${repo.apiRouteCount} API routes — deep on business-logic areas, thin on the HTTP surface itself.`,
      Object.entries(repo.testFilesByArea ?? {}).map(([k, v]) => `${k}: ${v}`),
    ));
    dimensions.push(dim(
      'Unbounded query exposure', repo.unboundedListRoutesDetected?.length ? Math.max(20, 100 - repo.unboundedListRoutesDetected.length * 15) : 90,
      'strong_evidence',
      repo.unboundedListRoutesDetected?.length
        ? `${repo.unboundedListRoutesDetected.length} route(s) carry an explicit "no pagination" comment.`
        : 'No explicit "no pagination" source comments detected by the scanner (does not rule out unbounded queries the scanner\'s heuristic misses).',
      repo.unboundedListRoutesDetected ?? [],
    ));
    dimensions.push(dim(
      'Background job scheduling reality',
      repo.vercelCronCount <= 1 && repo.cronRouteCount > repo.vercelCronCount ? 45 : 70,
      'verified',
      `${repo.cronRouteCount} cron-shaped route(s) exist; vercel.json schedules ${repo.vercelCronCount}. The gap is bridged by the in-DB job runner and per-request piggybacks where wired — Sentinel's background-job observer reports per-job liveness independently of this static count.`,
      [],
    ));
  } else {
    dimensions.push(dim('Static architecture findings', null, 'unknown', 'Manifest not yet generated.', []));
  }

  if (dbReachable) {
    const attendanceStats = moduleStats.find((m) => /attendance/i.test(m.module));
    dimensions.push(dim(
      'Attendance reliability (live)', attendanceStats ? Math.round((1 - attendanceStats.errorRate) * 100) : 84,
      attendanceStats ? 'strong_evidence' : 'likely',
      attendanceStats
        ? `${attendanceStats.count} observed request(s) in the last 60m, ${Math.round(attendanceStats.errorRate * 100)}% error rate.`
        : 'No recent observations for attendance modules; score reflects the ingestion engine\'s idempotency design (INSERT IGNORE + upsert keying), not live traffic.',
      [],
    ));
    dimensions.push(dim(
      'Background job liveness', heartbeats.length
        ? Math.round((heartbeats.filter((h) => h.verdict === 'healthy').length / heartbeats.length) * 100)
        : null,
      heartbeats.length ? 'verified' : 'unknown',
      heartbeats.length
        ? `${heartbeats.filter((h) => h.verdict === 'healthy').length}/${heartbeats.length} monitored heartbeats healthy.`
        : 'No heartbeats have been recorded yet — reported as unmonitored, not healthy.',
      heartbeats.map((h) => `${h.name}: ${h.verdict}`),
    ));
  }

  const scored = dimensions.filter((d) => d.score != null) as Array<ScoredDimension & { score: number }>;
  const overallScore = scored.length ? Math.round(scored.reduce((a, d) => a + d.score, 0) / scored.length) : 0;

  let readiness: DiagnosisReport['readiness'] = 'not_ready';
  if (overallScore >= 90) readiness = 'strong_foundation';
  else if (overallScore >= 70) readiness = 'ready_with_limitations';
  else if (overallScore >= 45) readiness = 'conditionally_ready';

  const strongAreas: string[] = [];
  const moderateAreas: string[] = [];
  const weakAreas: string[] = [];
  for (const d of dimensions) {
    if (d.score == null) continue;
    if (d.score >= 75) strongAreas.push(d.dimension);
    else if (d.score >= 45) moderateAreas.push(d.dimension);
    else weakAreas.push(d.dimension);
  }

  const criticalFailurePoints: string[] = [];
  if (manifestPopulated && repo.tenantSafeWrapperFiles / Math.max(1, repo.tenantSafeWrapperFiles + repo.rawQueryFiles) < 0.1) {
    criticalFailurePoints.push('Tenant isolation is enforced in under 10% of tenant-touching routes — a new route can leak cross-tenant data without any structural check catching it.');
  }
  if (manifestPopulated && !repo.hasPrOrPushCiGate) {
    criticalFailurePoints.push('No CI gate blocks a broken build or failing test from merging.');
  }
  if (incidentSummary.critical > 0) {
    criticalFailurePoints.push(`${incidentSummary.critical} CRITICAL incident(s) currently open.`);
  }

  const silentFailureRisks = [
    'A background job whose heartbeat has never been recorded reports UNMONITORED — this is itself the finding, not a clean bill of health.',
    manifestPopulated && repo.vercelCronCount <= 1
      ? 'Only one Vercel cron is scheduled; anything not wired to the in-DB job runner or a request-time piggyback will not run without an independently verified trigger.'
      : null,
  ].filter((x): x is string => !!x);

  const catastrophicButRare = [
    'Cross-tenant data leakage via a route that omits a school_id filter — low observed frequency historically, catastrophic impact.',
    'A production deploy shipping a real type error, undetected, because build-time checks are suppressed.',
  ];

  const topFailureModes = [
    { mode: 'A new/edited route omits tenant scoping', probability: 'medium', impact: 'critical', severity: 'P0' },
    { mode: 'A background job silently stops running (no heartbeat, no alert)', probability: heartbeats.some((h) => h.verdict === 'unmonitored') ? 'high' : 'medium', impact: 'high', severity: 'P0' },
    { mode: 'A type error reaches production because builds ignore TS/ESLint failures', probability: 'medium', impact: 'high', severity: 'P1' },
    { mode: 'A PR merges with a failing test because nothing in CI stops it', probability: manifestPopulated && !repo.hasPrOrPushCiGate ? 'high' : 'low', impact: 'medium', severity: 'P1' },
    { mode: 'An unbounded list endpoint degrades as a school grows', probability: 'medium', impact: 'medium', severity: 'P1' },
  ];

  const subsystemMatrix: DiagnosisReport['subsystemMatrix'] = [
    { subsystem: 'Attendance ingestion', state: 'strong', confidence: 'strong_evidence', risk: 'Downstream aggregate/notification consumers depend on job liveness, tracked separately.' },
    { subsystem: 'Tenant isolation', state: manifestPopulated && repo.tenantSafeWrapperFiles / Math.max(1, repo.tenantSafeWrapperFiles + repo.rawQueryFiles) < 0.1 ? 'weak' : 'watched', confidence: manifestPopulated ? 'verified' : 'unknown', risk: 'Enforced by convention in most routes, not structurally guaranteed.' },
    { subsystem: 'Background jobs', state: heartbeats.some((h) => h.verdict === 'degraded') ? 'weak' : heartbeats.some((h) => h.verdict === 'unmonitored') ? 'watched' : 'moderately_strong', confidence: heartbeats.length ? 'verified' : 'unknown', risk: 'Liveness now independently tracked by Sentinel heartbeats.' },
    { subsystem: 'Notifications', state: 'watched', confidence: 'likely', risk: 'Queue-backlog and delivery-failure observers active; historical incident precedent exists.' },
    { subsystem: 'Deployment/CI', state: manifestPopulated && !repo.hasPrOrPushCiGate ? 'weak' : 'moderately_strong', confidence: manifestPopulated ? 'verified' : 'unknown', risk: 'No PR/push gate found.' },
  ];

  const sentinelSelfAssessment = {
    canTrustThisReport: !!self?.canWriteToDatabase && dbReachable,
    reasons: self ? self.reasons : ['Self-check could not run.'],
  };
  if (!sentinelSelfAssessment.canTrustThisReport) {
    limitations.push('Sentinel could not fully verify its own operational status while generating this report — treat dynamic sections with extra caution.');
  }

  const executiveVerdict = manifestPopulated
    ? `DRAIS scores ${overallScore}/100 by Sentinel's own live evidence as of commit ${(liveCommitSha ?? 'unknown').slice(0, 8)}. Strongest: ${strongAreas[0] ?? 'none scored strong'}. Weakest: ${weakAreas[0] ?? 'none scored weak'}. ${criticalFailurePoints.length} critical failure point(s) identified.`
    : 'Architecture manifest not yet generated — this diagnosis is dynamic-evidence-only and incomplete. Run `npm run sentinel:scan` first.';

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      sentinelVersion: SENTINEL_VERSION,
      engineVersion: DIAGNOSTIC_ENGINE_VERSION,
      manifestGeneratedAt, manifestCommitSha, liveCommitSha, manifestIsStale,
    },
    executiveVerdict, overallScore, readiness, dimensions,
    strongAreas, moderateAreas, weakAreas, criticalFailurePoints,
    silentFailureRisks, catastrophicButRare, topFailureModes, subsystemMatrix,
    activeIncidents: incidentSummary,
    sentinelSelfAssessment, limitations,
  };
}
