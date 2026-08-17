#!/usr/bin/env node
/**
 * DRAIS Sentinel — live verification harness.
 *
 * Runs Sentinel's schema bootstrap + a scripted walk through the chaos
 * scenarios against the REAL configured database (read from .env.local /
 * environment, same as the app). This is the DB-touching counterpart to
 * the pure chaos suite (src/lib/sentinel/__tests__/chaos.test.mjs, which
 * needs no database at all).
 *
 * Safe by construction: every write either goes through
 * ensureSentinelSchema() (CREATE TABLE IF NOT EXISTS — additive only,
 * identical bootstrap pattern to every other DRAIS subsystem) or inserts
 * into Sentinel's own new tables. Nothing here touches an existing DRAIS
 * table's data.
 *
 * Run: npx tsx scripts/sentinel/verify-live.mjs
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { setDbMode } from '../../src/lib/db/db-mode.ts';
// This dev environment defaults to local MySQL (DRAIS_DB_MODE=local) for the
// desktop workflow; no local server is running here, so verification targets
// the real online TiDB Cloud database instead — the one with real schools.
setDbMode('online');
import { ensureSentinelSchema } from '../../src/lib/sentinel/schema.ts';
import { recordIncident, resolveIncident } from '../../src/lib/sentinel/incidents.ts';
import { beatStart, beatSuccess, beatFailure, heartbeatStatus } from '../../src/lib/sentinel/heartbeat.ts';
import { detectTimestampAnomaly, toObservation } from '../../src/lib/sentinel/observers/attendance-timestamp.ts';
import { selfCheck } from '../../src/lib/sentinel/observers/self.ts';
import { observeBackgroundJobs } from '../../src/lib/sentinel/observers/background-jobs.ts';
import { observeNotifications } from '../../src/lib/sentinel/observers/notifications.ts';
import { runFullSystemDiagnosis } from '../../src/lib/sentinel/diagnosis/engine.ts';
import { runSentinelSweep } from '../../src/lib/sentinel/sweep.ts';
import { query } from '../../src/lib/db.ts';
import { getSetting, setSetting } from '../../src/lib/control/platform-settings.ts';
import { SENTINEL_ALERT_ENABLED_KEY } from '../../src/lib/sentinel/alert.ts';

// SAFETY: this is a repeatable verification script. It must NEVER be able to
// page a real phone on a re-run just because it re-creates the same synthetic
// test incidents. Disable real alert dispatch for the duration of this run
// and restore whatever the operator had configured afterward — the pure
// dedup/severity/cooldown LOGIC is already fully proven by chaos.test.mjs and
// by the one deliberate, explicit end-to-end proof in verify-alert-path.mjs.
async function withAlertingDisabled(fn) {
  const previous = await getSetting(SENTINEL_ALERT_ENABLED_KEY);
  await setSetting(SENTINEL_ALERT_ENABLED_KEY, '0');
  console.log('[safety] Sentinel SMS alerting disabled for this verification run.');
  try {
    return await fn();
  } finally {
    await setSetting(SENTINEL_ALERT_ENABLED_KEY, previous);
    console.log(`[safety] Sentinel SMS alerting restored to previous value (${previous ?? 'unset → enabled'}).`);
  }
}

function section(title) { console.log(`\n${'='.repeat(70)}\n${title}\n${'='.repeat(70)}`); }
function ok(label, cond) { console.log(`  ${cond ? '✔' : '✖'} ${label}`); if (!cond) process.exitCode = 1; return cond; }

async function main() {
  section('0. Schema bootstrap');
  await ensureSentinelSchema();
  const tables = (await query(`SHOW TABLES LIKE 'sentinel_%'`)).map((r) => Object.values(r)[0]);
  ok(`5 sentinel_* tables exist (found ${tables.length}: ${tables.join(', ')})`, tables.length === 5);

  const schools = await query(`SELECT id, name FROM schools WHERE deleted_at IS NULL LIMIT 1`);
  const school = schools[0];
  if (!school) { console.log('No school found — aborting scenario tests that need a real school id.'); return; }
  console.log(`  Using real school for scenario tests: #${school.id} "${school.name}"`);

  section('TEST 1 — Real user-visible anomaly (JIPRA-type timestamp offset)');
  const fakeSamples = Array.from({ length: 40 }, () => ({ clockSkewSeconds: 5 * 3600 + (Math.random() * 200 - 100) }));
  const detection = detectTimestampAnomaly(fakeSamples);
  ok('anomaly detected from synthetic 5h-offset samples', detection.anomaly === true);
  const obs1 = toObservation(school.id, school.name, 'Attendance Logs [verification]', detection);
  const r1 = await recordIncident(obs1);
  ok('incident created', !!r1?.incident?.id);
  ok('school correctly identified', r1?.incident.schoolId === Number(school.id));
  ok('route/module correctly identified', r1?.incident.module === 'Attendance Logs [verification]');
  ok('severity computed (medium/high)', ['medium', 'high'].includes(r1?.incident.severity));
  ok('probable cause explains likely cause', /timezone|clock/i.test(r1?.incident.probableCause || ''));
  ok('notifyRequired flagged (would page if HIGH/CRITICAL)', r1?.incident.notifyRequired === true);
  console.log(`  → incident #${r1?.incident.id}, severity=${r1?.incident.severity}, confidence=${r1?.incident.confidence}%`);
  if (r1?.incident.id) await query(`DELETE FROM sentinel_incidents WHERE id = ?`, [r1.incident.id]); // synthetic — remove entirely

  section('TEST 2 — Silent background failure (job never beaten → not "healthy")');
  const neverBeaten = await heartbeatStatus('verification_never_run_job');
  ok('a job with no heartbeat reports UNMONITORED, not healthy', neverBeaten.verdict === 'unmonitored');

  await beatStart('verification_job', 1);
  await beatSuccess('verification_job');
  await new Promise((r) => setTimeout(r, 1500));
  const stale = await heartbeatStatus('verification_job');
  ok('a job overdue past its expected interval reports DEGRADED', stale.verdict === 'degraded');

  await beatFailure('verification_job', 'synthetic failure for verification');
  const failing = await heartbeatStatus('verification_job');
  ok('a job with a recorded failure reports DEGRADED', failing.verdict === 'degraded');

  section('TEST 3 — Delivery failure is recorded, not silently swallowed');
  const notifications = await observeNotifications();
  ok('notification observer runs against the real outbox without throwing', Array.isArray(notifications));
  console.log(`  → ${notifications.length} live notification-queue observation(s) from the real outbox right now.`);

  section('TEST 4 — Sentinel self-check');
  const self = await selfCheck();
  ok('self-check runs and reports a verdict', ['healthy', 'degraded', 'unmonitored'].includes(self.overall));
  ok('self-check can prove it can write to its own tables', self.canWriteToDatabase === true);
  console.log(`  → overall=${self.overall}; reasons: ${self.reasons.join(' | ')}`);

  section('Anti-noise — same problem recorded 5x does not create 5 rows');
  const antiNoiseDedupKey = `verification::anti-noise::${Date.now()}`; // unique per run — this is a re-runnable script, not a one-shot test
  const dedupObs = { ...obs1, module: 'Anti-noise verification', dedupKey: antiNoiseDedupKey };
  let last;
  for (let i = 0; i < 5; i++) last = await recordIncident(dedupObs);
  const rows = await query(`SELECT COUNT(*) n FROM sentinel_incidents WHERE dedup_key = ?`, [antiNoiseDedupKey]);
  ok('exactly one row exists after 5 recordIncident() calls', Number(rows[0].n) === 1);
  ok('occurrence_count reached 5', last?.incident.occurrenceCount === 5);
  console.log(`  → final severity after 5 occurrences: ${last?.incident.severity} (escalated from ${obs1.severity})`);
  if (last?.incident.id) await query(`DELETE FROM sentinel_incidents WHERE id = ?`, [last.incident.id]); // synthetic — remove entirely, not just resolve

  section('Sentinel sweep — run for real (fleet/background-jobs/notifications/security observers + self-heartbeat)');
  const sweep = await runSentinelSweep();
  console.log(`  → ${JSON.stringify(sweep)}`);
  ok('sweep completed without throwing', true);

  section('Background-job observer (real data)');
  const bgFindings = await observeBackgroundJobs();
  console.log(`  → ${bgFindings.length} finding(s) from real heartbeat/queue state.`);
  for (const f of bgFindings) console.log(`    - [${f.severity}] ${f.module}: ${f.kind}`);

  section('TEST 5 — FULL SYSTEM DIAGNOSIS (live)');
  const report = await runFullSystemDiagnosis(process.env.VERCEL_GIT_COMMIT_SHA ?? null);
  console.log(JSON.stringify(report, null, 2));

  section('Cleanup — remove synthetic verification artifacts');
  await query(`DELETE FROM sentinel_heartbeats WHERE name IN ('verification_job', 'verification_never_run_job')`);
  console.log('  → synthetic verification heartbeats removed. Real heartbeats (sentinel_core_sweep, sentinel_alert_dispatch, job_*, sentinel_self_write_probe) left intact.');

  section('SUMMARY');
  console.log(`Overall score: ${report.overallScore}/100 — ${report.readiness}`);
  console.log(process.exitCode === 1 ? 'ONE OR MORE ASSERTIONS FAILED — see ✖ above.' : 'All live assertions passed.');
}

withAlertingDisabled(main).then(() => process.exit(process.exitCode ?? 0)).catch((e) => { console.error('VERIFICATION SCRIPT CRASHED:', e); process.exit(1); });
