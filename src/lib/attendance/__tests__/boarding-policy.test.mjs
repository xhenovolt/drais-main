// Boarding policy, reporting periods and the central attendance-SMS decision (scenarios A-D of the spec).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveReportingPeriod, modeForDate, sanitizeBoardingPolicy, DEFAULT_BOARDING_POLICY } from '@/lib/attendance/boarding-policy.ts';
import { decideAttendanceNotification } from '@/lib/attendance/notification-decision.ts';
import { buildDedupKey } from '@/lib/notifications/fanout.ts';
import { parseAttendanceDedupKey } from '@/lib/notifications/attendance-sms-eligibility.ts';

const ok = { eligible: true };
const base = {
  status: 'present', attendanceDate: '2026-09-25', firstInAt: '2026-09-25T04:42:00Z', isPolicyDerived: false, policyDerivedReason: null,
  residence: 'day', boardingMode: null, boardingReport: null, reportedSmsEnabled: true, eligibility: ok, ruleId: 7,
};
const d = (o) => decideAttendanceNotification({ ...base, ...o });
const P1 = { periodKey: 'term:5', periodLabel: 'Term 3', isNew: true };

describe('scenario A — day scholar', () => {
  it('no punch -> ABSENT under the normal daily rule', () => {
    const r = d({ status: 'absent', firstInAt: null });
    assert.equal(r.decision, 'SEND'); assert.equal(r.notificationType, 'ABSENT'); assert.equal(r.reasonCode, 'daily_rule');
  });
  it('late punch -> LATE_ARRIVAL; on time -> ARRIVAL_ON_TIME', () => {
    assert.equal(d({ status: 'late' }).notificationType, 'LATE_ARRIVAL');
    assert.equal(d({ status: 'present' }).notificationType, 'ARRIVAL_ON_TIME');
  });
  it('safety gates still apply (stale date suppressed, with the reason recorded)', () => {
    const r = d({ status: 'absent', firstInAt: null, eligibility: { eligible: false, reason: 'stale_attendance_date' } });
    assert.equal(r.decision, 'DO_NOT_SEND'); assert.equal(r.reasonCode, 'stale_attendance_date');
  });
});

describe('scenario B — boarding on DAILY_PUNCH behaves like a day scholar', () => {
  it('no punch -> ABSENT; the explanation says so', () => {
    const r = d({ residence: 'boarding', boardingMode: 'DAILY_PUNCH', status: 'absent', firstInAt: null });
    assert.equal(r.decision, 'SEND'); assert.equal(r.notificationType, 'ABSENT');
    assert.match(r.explanation.join(' '), /Daily punch/);
  });
});

describe('scenario C — boarding on REPORTED_ONCE, first valid punch', () => {
  it('sends BOARDING_REPORTED (never a late/arrival message), even if the punch was late', () => {
    for (const status of ['present', 'late']) {
      const r = d({ residence: 'boarding', boardingMode: 'REPORTED_ONCE', status, boardingReport: P1 });
      assert.equal(r.decision, 'SEND'); assert.equal(r.notificationType, 'BOARDING_REPORTED');
      assert.equal(r.reasonCode, 'first_report_this_period');
      assert.match(r.explanation.join(' '), /not a late or absence message/);
    }
  });
  it('respects the school switch that turns this SMS off', () => {
    const r = d({ residence: 'boarding', boardingMode: 'REPORTED_ONCE', boardingReport: P1, reportedSmsEnabled: false });
    assert.equal(r.decision, 'DO_NOT_SEND'); assert.equal(r.reasonCode, 'reported_sms_disabled');
  });
});

describe('scenario D — boarder punches again in the same period', () => {
  it('DO_NOT_SEND, reason recorded', () => {
    const r = d({ residence: 'boarding', boardingMode: 'REPORTED_ONCE', boardingReport: { ...P1, isNew: false } });
    assert.equal(r.decision, 'DO_NOT_SEND'); assert.equal(r.reasonCode, 'already_reported_this_period');
    assert.match(r.explanation.join(' '), /already reported during Term 3/);
  });
  it('boarders are not sent daily absence messages under REPORTED_ONCE', () => {
    const r = d({ residence: 'boarding', boardingMode: 'REPORTED_ONCE', status: 'absent', firstInAt: null });
    assert.equal(r.decision, 'DO_NOT_SEND'); assert.equal(r.reasonCode, 'boarding_reported_once_no_daily_absence');
  });
  it('policy-derived verdicts never notify', () => {
    const r = d({ residence: 'boarding', boardingMode: 'REPORTED_ONCE', isPolicyDerived: true, policyDerivedReason: 'boarding_reported_once', status: 'present' });
    assert.equal(r.decision, 'DO_NOT_SEND'); assert.equal(r.reasonCode, 'policy_derived_verdict');
  });
  it('a day scholar is unaffected by another school\'s boarding policy', () => {
    const r = d({ residence: 'day', boardingMode: null, status: 'late' });
    assert.equal(r.notificationType, 'LATE_ARRIVAL');
  });
});

describe('idempotency keys', () => {
  const ev = { personId: 9, attendanceDate: '2026-09-25', status: 'present', boardingReport: P1 };
  it('BOARDING_REPORTED is keyed by reporting period, not by day or punch', () => {
    const a = buildDedupKey(3, ev, 'BOARDING_REPORTED', 0, '0700111222');
    const b = buildDedupKey(3, { ...ev, attendanceDate: '2026-09-26' }, 'BOARDING_REPORTED', 0, '0700111222');
    assert.equal(a, b); assert.equal(a, '3:9:boarding.reported:term:5');
  });
  it('a new period is a new logical event', () => {
    assert.notEqual(buildDedupKey(3, ev, 'BOARDING_REPORTED', 0, 'x'), buildDedupKey(3, { ...ev, boardingReport: { ...P1, periodKey: 'term:6' } }, 'BOARDING_REPORTED', 0, 'x'));
  });
  it('recipient #1 keeps the historical key; further guardians get their own (all guardians are texted)', () => {
    const first = buildDedupKey(3, ev, 'LATE_ARRIVAL', 0, '0700111222');
    assert.equal(first, '3:9:attendance.record.upserted:2026-09-25:present');
    const second = buildDedupKey(3, ev, 'LATE_ARRIVAL', 1, '0700333444');
    assert.notEqual(first, second);
    assert.equal(parseAttendanceDedupKey(second)?.personId, 9, 'send-time revalidation still understands suffixed keys');
  });
  it('keys fit the 120-char column', () => {
    assert.ok(buildDedupKey(999999, ev, 'LATE_ARRIVAL', 4, '0700333444').length <= 120);
  });
});

describe('reporting periods', () => {
  const T = { id: 5, start: '2026-09-01', end: '2026-12-05', name: 'Term 3' };
  it('TERM: everyone in the term shares one key; outside any term falls back to a 90-day window (never per-day)', () => {
    const a = resolveReportingPeriod({ reportingPeriod: 'TERM', periodDays: null }, '2026-09-25', T);
    const b = resolveReportingPeriod({ reportingPeriod: 'TERM', periodDays: null }, '2026-11-20', T);
    assert.equal(a.key, b.key); assert.equal(a.key, 'term:5');
    const f1 = resolveReportingPeriod({ reportingPeriod: 'TERM', periodDays: null }, '2026-09-25', null);
    const f2 = resolveReportingPeriod({ reportingPeriod: 'TERM', periodDays: null }, '2026-09-26', null);
    assert.equal(f1.key, f2.key); assert.equal(f1.kind, 'FALLBACK');
  });
  it('WEEK: Monday-Sunday, rolls over on Monday', () => {
    const w = (dt) => resolveReportingPeriod({ reportingPeriod: 'WEEK', periodDays: null }, dt, null);
    assert.equal(w('2026-09-21').key, w('2026-09-27').key);
    assert.notEqual(w('2026-09-27').key, w('2026-09-28').key);
    assert.equal(w('2026-09-24').start, '2026-09-21');
  });
  it('CUSTOM_DAYS: N-day windows', () => {
    const c = (dt) => resolveReportingPeriod({ reportingPeriod: 'CUSTOM_DAYS', periodDays: 14 }, dt, null);
    assert.equal(c('2026-09-25').key, c('2026-09-26').key);
    assert.equal(new Date(c('2026-09-25').end) - new Date(c('2026-09-25').start), 13 * 86400000);
  });
});

describe('policy safety', () => {
  it('defaults to DAILY_PUNCH so existing schools see no change', () => {
    assert.equal(DEFAULT_BOARDING_POLICY.mode, 'DAILY_PUNCH');
  });
  it('a policy change never rewrites history: dates before effective_from keep the old mode', () => {
    const p = { ...DEFAULT_BOARDING_POLICY, mode: 'REPORTED_ONCE', previousMode: 'DAILY_PUNCH', effectiveFrom: '2026-09-25' };
    assert.equal(modeForDate(p, '2026-09-24'), 'DAILY_PUNCH');
    assert.equal(modeForDate(p, '2026-09-25'), 'REPORTED_ONCE');
  });
  it('sanitising rejects junk and keeps sane values', () => {
    const p = sanitizeBoardingPolicy({ mode: 'EVIL', reportingPeriod: 'CUSTOM_DAYS', periodDays: 9999, reportedSmsEnabled: 0 });
    assert.equal(p.mode, 'DAILY_PUNCH'); assert.equal(p.periodDays, 365); assert.equal(p.reportedSmsEnabled, false);
  });
});
