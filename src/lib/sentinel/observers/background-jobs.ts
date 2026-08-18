/**
 * DRAIS Sentinel — background-job observer.
 *
 * Reads sentinel_heartbeats (beaten from job-runner.ts, see the wiring in
 * that file) plus the existing platform_jobs queue depth. Distinguishes the
 * three states the spec is explicit about:
 *
 *   UNMONITORED — no heartbeat row exists at all. Sentinel has never seen
 *                 this job run; it must not claim "healthy."
 *   DEGRADED    — a heartbeat exists but is stale/failing.
 *   HEALTHY     — a heartbeat exists and is current.
 *
 * Runs from the periodic sweep (sweep.ts), not per-request.
 */
import { query } from '@/lib/db';
import { allHeartbeats } from '../heartbeat';
import type { Observation } from '../types';

/** Every job DRAIS expects to run periodically, with its cadence. Extend
 * this list as new job types register with the job-runner — Sentinel can
 * only report on what it's told to expect (see the UNMONITORED verdict). */
export const EXPECTED_JOBS: Array<{ heartbeatName: string; label: string; expectedIntervalSeconds: number }> = [
  { heartbeatName: 'job_dunning', label: 'Billing dunning sweep', expectedIntervalSeconds: 26 * 3600 },
  { heartbeatName: 'job_platform_health', label: 'Platform health snapshot', expectedIntervalSeconds: 26 * 3600 },
  // job-runner.ts writes every job's heartbeat as `job_${job.type}` (see
  // its beatStart/beatSuccess/beatFailure calls) — this entry named the
  // job-runner's OWN job type ('notification_drain') instead of the
  // heartbeat name it actually gets beaten under ('job_notification_drain'),
  // so this observer reported UNMONITORED for a job that had, in fact,
  // already run successfully. Found 2026-08-18 while investigating why
  // this and two other jobs were flagged despite platform_jobs showing
  // real completed runs.
  { heartbeatName: 'job_notification_drain', label: 'Notification outbox drain', expectedIntervalSeconds: 6 * 3600 },
  { heartbeatName: 'sentinel_core_sweep', label: 'Sentinel sweep', expectedIntervalSeconds: 26 * 3600 },
];

export async function observeBackgroundJobs(): Promise<Observation[]> {
  const beats = await allHeartbeats();
  const byName = new Map(beats.map((b) => [b.name, b]));
  const observations: Observation[] = [];

  for (const job of EXPECTED_JOBS) {
    const beat = byName.get(job.heartbeatName);
    if (!beat || beat.verdict === 'unmonitored') {
      observations.push({
        kind: 'background_job_unmonitored',
        observer: 'background_jobs',
        schoolId: null,
        module: job.label,
        severity: 'medium',
        confidence: 90,
        probableCause: 'This job has never reported a heartbeat to Sentinel — either it has not run yet, or it is not wired to beat().',
        userImpact: 'No user-visible symptom yet, but Sentinel cannot currently prove this background process is working.',
        technicalImpact: 'Sentinel has no evidence for this job. This is reported as UNMONITORED, not HEALTHY — absence of evidence is not evidence of health.',
        evidence: [{ label: 'Expected cadence', value: `${Math.round(job.expectedIntervalSeconds / 3600)}h` }],
        recommendedAction: 'Confirm this job is wired to beatStart/beatSuccess and has actually been triggered at least once.',
        autoRemediationSafe: false,
        notifyRequired: false,
        dedupKey: `background_job_unmonitored::global::${job.heartbeatName}`,
      });
      continue;
    }
    if (beat.verdict === 'degraded') {
      const stale = beat.staleBy != null && beat.staleBy > 0;
      observations.push({
        kind: stale ? 'background_job_stale' : 'background_job_failing',
        observer: 'background_jobs',
        schoolId: null,
        module: job.label,
        severity: stale ? 'high' : 'high',
        confidence: 85,
        probableCause: stale
          ? 'This job has not reported success within its expected cadence — it may have stopped being triggered, or be failing silently upstream of its own handler.'
          : `This job is failing on execution: ${beat.consecutiveFailures} consecutive failure(s).`,
        userImpact: stale
          ? 'Data this job maintains (billing state, health snapshots, queued notifications) may be stale without any visible warning.'
          : 'This job is not completing its work; whatever it maintains is not being updated.',
        technicalImpact: stale
          ? `Last success ${beat.lastSuccessAt ?? 'never'}, ${beat.staleBy}s overdue.`
          : `Last error: ${beat.lastFailureAt ? new Date(beat.lastFailureAt).toISOString() : 'unknown'}.`,
        evidence: [
          { label: 'Last success', value: beat.lastSuccessAt ?? 'never' },
          { label: 'Consecutive failures', value: beat.consecutiveFailures },
          ...(beat.staleBy != null ? [{ label: 'Overdue by', value: `${beat.staleBy}s` }] : []),
        ],
        recommendedAction: 'Check the job-runner trigger path (the single daily cron fan-out) and this job\'s handler for errors.',
        autoRemediationSafe: false,
        notifyRequired: true,
        dedupKey: `${stale ? 'background_job_stale' : 'background_job_failing'}::global::${job.heartbeatName}`,
      });
    }
  }

  // Queue depth sanity check — a growing platform_jobs backlog even without
  // a specific job's heartbeat failing is itself a signal (retries piling up).
  const backlog = (await query(
    `SELECT COUNT(*) n FROM platform_jobs WHERE status IN ('pending','failed') AND run_after <= NOW()`,
  ).catch(() => [{ n: 0 }])) as Array<{ n: number }>;
  const n = Number(backlog[0]?.n ?? 0);
  if (n >= 20) {
    observations.push({
      kind: 'background_job_failing',
      observer: 'background_jobs',
      schoolId: null,
      module: 'Platform job queue',
      severity: n >= 100 ? 'high' : 'medium',
      confidence: 80,
      probableCause: 'Due jobs are accumulating faster than the runner is draining them.',
      userImpact: 'Delayed background effects (dunning notices, health snapshots) across the platform.',
      technicalImpact: `${n} job(s) due or failed and not yet retried.`,
      evidence: [{ label: 'Backlog size', value: n }],
      recommendedAction: 'Manually trigger the job runner (/api/control-center/jobs) and inspect failing job types.',
      autoRemediationSafe: false,
      notifyRequired: n >= 100,
      dedupKey: 'background_job_failing::global::platform_jobs_backlog',
    });
  }

  return observations;
}
