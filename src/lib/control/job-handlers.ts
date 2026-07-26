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
}
