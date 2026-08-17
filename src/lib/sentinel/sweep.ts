/**
 * DRAIS Sentinel — periodic sweep.
 *
 * The ONLY thing in Sentinel that runs on a schedule rather than at the
 * moment of observation. Registered as a `platform_jobs` handler type
 * (see wiring in job-handlers.ts) — reuses the EXISTING in-DB job runner
 * (Phase 18) exactly like `dunning` and `platform_health` already do. No
 * new cron, no new scheduling mechanism.
 *
 * What belongs here vs. the real-time path (observe.ts / incidents.ts
 * called directly from a route): anything that requires scanning ACROSS
 * schools or across time (fleet health, job staleness, notification
 * backlog trend, security-pattern bursts) — a single request can't see
 * that. A single request's own anomaly (the JIPRA-type timestamp check,
 * a runtime tenant leak) is detected and alerted INLINE, at request time,
 * never waiting for this sweep — see the wiring notes in
 * observers/attendance-timestamp.ts and observers/tenant-isolation.ts.
 */
import { recordIncident } from './incidents';
import { observeBackgroundJobs } from './observers/background-jobs';
import { observeNotifications } from './observers/notifications';
import { observeSecurity } from './observers/security';
import { observeFleet } from './observers/fleet';
import { observeAcademics } from './observers/academics';
import { observeApiHealth } from './observers/api-health';
import { observeTenantIsolationStatic } from './observers/tenant-isolation';
import { beatStart, beatSuccess, beatFailure, HEARTBEATS } from './heartbeat';
import { pruneObservations } from './observe';

export interface SweepResult {
  observationsGenerated: number;
  incidentsRecorded: number;
  alertsSent: number;
  observationsPruned: number;
}

export async function runSentinelSweep(): Promise<SweepResult> {
  await beatStart(HEARTBEATS.SENTINEL_SWEEP, 26 * 3600); // expect at least daily
  try {
    const [bgJobs, notifications, security, fleet, academics, apiHealth] = await Promise.all([
      observeBackgroundJobs(),
      observeNotifications(),
      observeSecurity(),
      observeFleet(),
      observeAcademics(),
      observeApiHealth(),
    ]);
    const staticFindings = observeTenantIsolationStatic();

    const all = [...bgJobs, ...notifications, ...security, ...fleet, ...academics, ...apiHealth, ...staticFindings];
    let incidentsRecorded = 0;
    let alertsSent = 0;
    for (const o of all) {
      const result = await recordIncident(o);
      if (result) {
        incidentsRecorded++;
        if (result.alerted) alertsSent++;
      }
    }

    const pruned = await pruneObservations(7).catch(() => 0);

    await beatSuccess(HEARTBEATS.SENTINEL_SWEEP);
    return { observationsGenerated: all.length, incidentsRecorded, alertsSent, observationsPruned: pruned };
  } catch (err: any) {
    await beatFailure(HEARTBEATS.SENTINEL_SWEEP, String(err?.message || err));
    throw err;
  }
}
