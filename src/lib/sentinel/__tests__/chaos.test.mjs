/**
 * DRAIS Sentinel — chaos / verification suite.
 *
 * Simulates the failure scenarios from the Sentinel spec against Sentinel's
 * own PURE decision logic (severity escalation, incident transitions,
 * heartbeat verdicts, timestamp-anomaly detection). No database — matching
 * this repo's existing test convention (node:test, no DB harness) and
 * proving the RULES are correct independent of any particular DB state.
 *
 * Run: npx tsx --test src/lib/sentinel/__tests__/*.test.mjs
 * Wired as: npm run test:sentinel
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  escalateByScope, requiresSmsAlert, maxSeverity, severityRank,
} from '@/lib/sentinel/severity.ts';
import { decideTransition } from '@/lib/sentinel/incident-transition.ts';
import { evaluateHeartbeat } from '@/lib/sentinel/heartbeat.ts';
import { detectTimestampAnomaly, toObservation } from '@/lib/sentinel/observers/attendance-timestamp.ts';
import { checkCrossTenantLeak } from '@/lib/sentinel/observers/tenant-isolation.ts';

// ── Scenario 1: real user-visible anomaly (JIPRA-type) ──────────────────
describe('Scenario 1 — attendance timestamps consistently 5h off (route returns 200, data is wrong)', () => {
  it('detects a consistent multi-hour offset as an anomaly', () => {
    const samples = Array.from({ length: 40 }, () => ({ clockSkewSeconds: 5 * 3600 + (Math.random() * 300 - 150) }));
    const result = detectTimestampAnomaly(samples);
    assert.equal(result.anomaly, true);
    assert.ok(Math.abs(result.effectiveOffsetHours - 5) < 0.3);
    assert.ok(result.confidence >= 70);
  });

  it('does NOT flag normal, near-zero skew as an anomaly', () => {
    const samples = Array.from({ length: 40 }, () => ({ clockSkewSeconds: Math.random() * 60 - 30 }));
    assert.equal(detectTimestampAnomaly(samples).anomaly, false);
  });

  it('does NOT flag inconsistent/scattered skew (random noise, not a systematic mismatch)', () => {
    const samples = Array.from({ length: 40 }, (_, i) => ({ clockSkewSeconds: (i % 2 === 0 ? 1 : -1) * (i * 900) }));
    assert.equal(detectTimestampAnomaly(samples).anomaly, false);
  });

  it('refuses to judge on too little evidence (insufficient sample, not "healthy")', () => {
    const result = detectTimestampAnomaly([{ clockSkewSeconds: 18000 }, { clockSkewSeconds: 18000 }]);
    assert.equal(result.anomaly, false);
    assert.equal(result.confidence, 0);
  });

  it('produces a generic, non-hardcoded, explainable observation for ANY school', () => {
    const result = detectTimestampAnomaly(Array.from({ length: 20 }, () => ({ clockSkewSeconds: 5 * 3600 })));
    const schoolA = toObservation(42, 'Not JIPRA Academy', 'Attendance Logs', result);
    const schoolB = toObservation(99, 'A Totally Different School', 'Attendance Logs', result);
    assert.equal(schoolA.schoolId, 42);
    assert.equal(schoolB.schoolId, 99);
    assert.equal(schoolA.kind, 'attendance_timestamp_anomaly');
    assert.equal(schoolA.notifyRequired, true);
    // Identical detection logic must produce identical text regardless of
    // which school it's for — proof the observer contains no per-school
    // branching or hardcoded identity anywhere in its logic.
    assert.equal(schoolA.userImpact, schoolB.userImpact);
    assert.equal(schoolA.probableCause, schoolB.probableCause);
    assert.ok(!schoolA.probableCause.includes('JIPRA'), 'observer logic must not hardcode any school name');
    // Dedup key must still be per-school so two schools never collide into one incident.
    assert.notEqual(schoolA.dedupKey, schoolB.dedupKey);
  });
});

// ── Scenario 2: silent background failure ────────────────────────────────
describe('Scenario 2 — a background job stops running (or never ran)', () => {
  it('a job with NO heartbeat row is UNMONITORED, never "healthy"', () => {
    const v = evaluateHeartbeat('job_x', null, Date.now());
    assert.equal(v.verdict, 'unmonitored');
  });

  it('a job overdue past its expected interval is DEGRADED', () => {
    const now = Date.now();
    const lastSuccess = new Date(now - 30 * 3600 * 1000); // 30h ago
    const v = evaluateHeartbeat('job_x', { last_success_at: lastSuccess.toISOString(), last_failure_at: null, consecutive_failures: 0, expected_interval_seconds: 26 * 3600 }, now);
    assert.equal(v.verdict, 'degraded');
    assert.ok(v.staleBy > 0);
  });

  it('a job within its expected interval is HEALTHY', () => {
    const now = Date.now();
    const lastSuccess = new Date(now - 2 * 3600 * 1000);
    const v = evaluateHeartbeat('job_x', { last_success_at: lastSuccess.toISOString(), last_failure_at: null, consecutive_failures: 0, expected_interval_seconds: 26 * 3600 }, now);
    assert.equal(v.verdict, 'healthy');
  });

  it('a job actively failing (never recovered) is DEGRADED regardless of cadence', () => {
    const now = Date.now();
    const v = evaluateHeartbeat('job_x', { last_success_at: null, last_failure_at: new Date(now).toISOString(), consecutive_failures: 3, expected_interval_seconds: null }, now);
    assert.equal(v.verdict, 'degraded');
  });
});

// ── Scenario 3: notification/alert-path failure must not disappear ──────
describe('Scenario 3 — Sentinel\'s own alert dispatch failing', () => {
  it('a failed alert-dispatch heartbeat reports degraded, not silence', () => {
    const now = Date.now();
    const v = evaluateHeartbeat('sentinel_alert_dispatch', { last_success_at: null, last_failure_at: new Date(now).toISOString(), consecutive_failures: 1, expected_interval_seconds: null }, now);
    assert.equal(v.verdict, 'degraded');
  });
});

// ── Anti-noise / deduplication ────────────────────────────────────────────
describe('Anti-noise — 10,000 identical failures become ONE incident, not 10,000', () => {
  it('a brand-new problem starts at its base severity with occurrence 1', () => {
    const t = decideTransition(null, 'low');
    assert.deepEqual(t, { isNew: true, occurrenceCount: 1, severity: 'low', status: 'open', reopened: false, silentRecurrence: false });
  });

  it('escalates LOW → MEDIUM → HIGH → CRITICAL purely by persistence, one incident throughout', () => {
    let existing = null;
    const severities = [];
    for (let i = 0; i < 150; i++) {
      const t = decideTransition(existing, 'low');
      existing = { occurrenceCount: t.occurrenceCount, status: t.status, severity: t.severity };
      severities.push(t.severity);
    }
    assert.equal(existing.occurrenceCount, 150, 'occurrence count tracks every recurrence, not a new row per event');
    assert.equal(severities[0], 'low');
    assert.ok(severities.includes('medium'));
    assert.ok(severities.includes('high'));
    assert.equal(severities[severities.length - 1], 'critical');
  });

  it('never DOWNGRADES an observer-assessed severity below what persistence alone implies', () => {
    const t = decideTransition({ occurrenceCount: 1, status: 'open', severity: 'high' }, 'info');
    // occurrence 2 -> persistence floor is 'low', but the base observation this
    // time was 'info' — escalateByPersistence takes the max of base and floor,
    // so severity should be at least 'low', never silently dropped to 'info'
    // while the incident is still actively recurring.
    assert.notEqual(t.severity, 'info');
  });
});

describe('Anti-noise — a resolved/suppressed incident does not silently reopen or re-page', () => {
  it('recurrence at the SAME or lower severity after resolution stays resolved (silent)', () => {
    const t = decideTransition({ occurrenceCount: 5, status: 'resolved', severity: 'medium' }, 'low');
    assert.equal(t.status, 'resolved');
    assert.equal(t.silentRecurrence, true);
    assert.equal(t.reopened, false);
  });

  it('recurrence at a STRICTLY higher severity reopens the incident', () => {
    const t = decideTransition({ occurrenceCount: 5, status: 'resolved', severity: 'low' }, 'critical');
    assert.equal(t.status, 'open');
    assert.equal(t.reopened, true);
    assert.equal(t.silentRecurrence, false);
  });

  it('a suppressed incident behaves the same way as a resolved one', () => {
    const same = decideTransition({ occurrenceCount: 3, status: 'suppressed', severity: 'high' }, 'high');
    assert.equal(same.status, 'suppressed');
    const worse = decideTransition({ occurrenceCount: 3, status: 'suppressed', severity: 'low' }, 'critical');
    assert.equal(worse.status, 'open');
  });
});

// ── Severity / escalation rules ───────────────────────────────────────────
describe('Severity escalation rules', () => {
  it('never pages on INFO or LOW', () => {
    assert.equal(requiresSmsAlert('info'), false);
    assert.equal(requiresSmsAlert('low'), false);
  });
  it('MEDIUM is visible but does not page', () => {
    assert.equal(requiresSmsAlert('medium'), false);
  });
  it('HIGH and CRITICAL page', () => {
    assert.equal(requiresSmsAlert('high'), true);
    assert.equal(requiresSmsAlert('critical'), true);
  });
  it('scope escalation: the same problem hitting many schools outranks one school repeating it', () => {
    assert.equal(escalateByScope('info', 10), 'critical');
    assert.equal(escalateByScope('info', 1), 'info');
  });
  it('maxSeverity/severityRank are consistent and total-ordered', () => {
    const order = ['info', 'low', 'medium', 'high', 'critical'];
    for (let i = 0; i < order.length - 1; i++) {
      assert.ok(severityRank(order[i]) < severityRank(order[i + 1]));
      assert.equal(maxSeverity(order[i], order[i + 1]), order[i + 1]);
    }
  });
});

// ── Duplicate anomaly events arriving concurrently ────────────────────────
describe('Scenario 16 — duplicate anomaly events arriving in quick succession', () => {
  it('two observations for the same dedup grain compound occurrence count, not identity', () => {
    let existing = null;
    for (let i = 0; i < 3; i++) {
      const t = decideTransition(existing, 'medium');
      existing = { occurrenceCount: t.occurrenceCount, status: t.status, severity: t.severity };
    }
    assert.equal(existing.occurrenceCount, 3);
  });
});

// ── Tenant isolation runtime check ────────────────────────────────────────
describe('Runtime tenant-isolation leak check', () => {
  it('flags foreign school_ids present in a response scoped to one school', () => {
    const obs = checkCrossTenantLeak('Device Logs', 10, [10, 10, 11, 10]);
    assert.ok(obs);
    assert.equal(obs.severity, 'critical');
    assert.equal(obs.notifyRequired, true);
    assert.match(obs.technicalImpact, /11/);
  });

  it('does not flag a clean, correctly-scoped response', () => {
    const obs = checkCrossTenantLeak('Device Logs', 10, [10, 10, 10]);
    assert.equal(obs, null);
  });

  it('tolerates nulls in the id list (unmatched/provisional rows) without false-flagging', () => {
    const obs = checkCrossTenantLeak('Device Logs', 10, [10, null, undefined, 10]);
    assert.equal(obs, null);
  });
});

// ── Multiple schools experiencing the same failure simultaneously ────────
describe('Scenario 14 — multiple schools hit by the same class of failure', () => {
  it('scope-based escalation would push a platform-wide pattern to CRITICAL even if each single school looks MEDIUM', () => {
    const perSchoolSeverity = 'medium';
    const escalated = escalateByScope(perSchoolSeverity, 7);
    assert.equal(escalated, 'high');
    assert.equal(escalateByScope(perSchoolSeverity, 12), 'critical');
  });
});
