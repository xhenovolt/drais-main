/**
 * Control Center — core job handlers (Phase 18 / E-14).
 *
 * Registers the platform's background job types with the runner. Called before
 * `runDueJobs` on each cron/request tick. Idempotent — safe to call repeatedly.
 * New periodic work (health snapshots, reconciliation retries, backup checks…)
 * registers a handler here and enqueues a `platform_jobs` row — never a new cron.
 */
import { registerJobHandler } from '@/lib/control/job-runner';

let registered = false;

export function registerCoreHandlers(): void {
  if (registered) return;
  registered = true;

  // Billing dunning — expiry warnings / suspension notices. As a job it now
  // retries with backoff if a run fails, instead of being lost for the day.
  registerJobHandler('dunning', async () => {
    const { runDunningSweep } = await import('@/lib/control/dunning');
    return runDunningSweep();
  });

  // Platform health — daily per-school score snapshot + founder alert on a
  // school newly turning critical (Phase 17).
  registerJobHandler('platform_health', async () => {
    const { runHealthSnapshotJob } = await import('@/lib/control/health-history');
    return runHealthSnapshotJob();
  });

  // Sentinel sweep — fleet-wide observers (background-job liveness,
  // notification backlog, security bursts, platform health as Sentinel
  // incidents) + self-heartbeat. Real-time, single-school anomalies are
  // detected inline at request time and never wait for this job — see
  // src/lib/sentinel/sweep.ts for the split.
  registerJobHandler('sentinel_sweep', async () => {
    const { runSentinelSweep } = await import('@/lib/sentinel/sweep');
    return runSentinelSweep();
  });

  // Notification outbox drain — guaranteed backstop. The outbox already
  // drains opportunistically on device heartbeats / passout notices /
  // attendance recovery (src/lib/notifications/drain.ts), which is fast on
  // any day with real device or portal traffic. A school with none of that
  // traffic on a given day previously had nothing pumping the queue at all
  // (readiness audit, Phase 1). This job type does not add a new Vercel
  // cron slot — it rides the existing daily fan-out in
  // src/app/api/result-deadlines/route.ts, same as dunning/platform_health.
  registerJobHandler('notification_drain', async () => {
    const { drainNotificationOutbox } = await import('@/lib/notifications/drain');
    return drainNotificationOutbox();
  });

  // Data retention sweep — readiness audit Phase 2. A genuine no-op unless
  // an operator has explicitly set retention_attendance_raw_days via
  // src/lib/control/data-retention.ts's setRetentionDays(); this code never
  // decides on its own to permanently delete production data.
  registerJobHandler('data_retention_sweep', async () => {
    const { runDataRetentionSweep } = await import('@/lib/control/data-retention');
    return runDataRetentionSweep();
  });
}
