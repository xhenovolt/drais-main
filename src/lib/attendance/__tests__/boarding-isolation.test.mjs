// Tenant isolation + wiring guards for the boarding policy, breakdown and decision pipeline (no DB in CI).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

describe('boarding policy is per school and server-authorised', () => {
  const route = read('app/api/attendance/boarding-policy/route.ts');
  const lib = read('lib/attendance/boarding-policy.ts');
  const mig = read('../database/migrations/tidb/054_boarding_policy_and_sms_diagnostics.mjs');

  it('the policy table is keyed by school (one school can never change another)', () => {
    assert.match(mig, /school_id\s+BIGINT NOT NULL PRIMARY KEY/);
    assert.match(lib, /WHERE school_id = \?/);
    assert.match(lib, /ON DUPLICATE KEY UPDATE/);
  });
  it('the route takes the school from the session, never from the request', () => {
    assert.match(route, /getSessionSchoolId\(req\)/);
    assert.doesNotMatch(route, /searchParams\.get\(['"]school|body\??\.school_?[iI]d/);
  });
  it('reading needs attendance access; changing needs an administrator', () => {
    assert.match(route, /write\s*\n?\s*\? await canAny\(base, \['attendance\.boarding_policy\.manage'\], \['admin'\]\)/);
    assert.match(route, /Only a school administrator can change/);
  });
  it('every change is audited with before and after, and history is protected', () => {
    assert.match(lib, /action: 'BOARDING_POLICY_CHANGED'/);
    assert.match(lib, /previous_mode/);
    assert.match(lib, /effective_from/);
  });
  it('the reported-to-school template lives in notification_policies (one place for templates), scoped to the school', () => {
    assert.match(route, /WHERE school_id = \? AND event_type = \?/);
    assert.match(route, /UPDATE notification_policies SET template_body = \?, is_active = \? WHERE id = \? AND school_id = \?/);
  });
});

describe('breakdown route', () => {
  const route = read('app/api/attendance/breakdown/route.ts');
  const lib = read('lib/attendance/breakdown.ts');
  it('school comes from the session; one aggregate query, school-pinned', () => {
    assert.match(route, /getSessionSchoolId\(req\)/);
    assert.match(lib, /WHERE s\.school_id = \?/);
    assert.match(lib, /ar\.school_id = s\.school_id/);
    assert.match(lib, /br\.school_id = s\.school_id/);
    assert.equal((lib.match(/await query\(/g) ?? []).length, 1, 'exactly one database query');
  });
  it('never drops learners with unknown gender', () => {
    assert.match(lib, /ELSE 'unknown'/);
  });
});

describe('logs filters are school-pinned', () => {
  const src = read('app/api/attendance/history/route.ts');
  it('residence and stream filters bind the session school', () => {
    assert.match(src, /s\.school_id = \? AND e\.status = 'active' AND e\.stream_id = \?/);
    assert.match(src, /s\.school_id = \?\s*\n\s*AND COALESCE\(NULLIF\(s\.residency_status, ''\), 'day'\) = \?/);
  });
});

describe('the decision pipeline is wired end to end', () => {
  const fan = read('lib/notifications/fanout.ts');
  const eng = read('lib/attendance/engine.ts');
  it('the engine records the report and hands the facts to the fanout', () => {
    assert.match(eng, /recordBoardingReport\(/);
    assert.match(eng, /boardingReport,\s*\n\s*\};/);
    assert.match(eng, /modeForDate\(bp, dateStr\)/);
  });
  it('fanout asks the central decision, stores it, and only enqueues on SEND', () => {
    assert.match(fan, /decideAttendanceNotification\(/);
    assert.match(fan, /recordDecision\(event, decision\)/);
    assert.ok(fan.indexOf("decision.decision === 'DO_NOT_SEND'") < fan.indexOf('enqueue(policy, event, r, body, decision, decisionId'));
  });
  it('a boarder reporting once never also triggers the daily late/arrival policies', () => {
    assert.match(fan, /decision\.notificationType === 'BOARDING_REPORTED' \? 'attendance\.boarding\.reported' : 'attendance\.record\.upserted'/);
  });
  it('outbox rows carry the decision link and type', () => {
    assert.match(fan, /notification_type, attendance_date, subject_student_id, decision_id/);
  });
});
