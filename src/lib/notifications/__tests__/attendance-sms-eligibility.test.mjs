// Nakifuma regression: parents received absent / "arrived safely" SMS for
// learners who were never on the biometric system, and for historical dates
// re-finalised by the 7-day self-healing sweep. These tests pin the platform
// rule that prevents it (see attendance-sms-eligibility.ts).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateAttendanceSmsEligibility, parseAttendanceDedupKey, schoolLocalDate,
  MAX_ATTENDANCE_SMS_AGE_DAYS,
} from '@/lib/notifications/attendance-sms-eligibility.ts';

const TODAY = '2026-09-23';
const enrolledAndCaptured = { hasActiveEnrollment: true, hasCaptureEvidence: true, hasEverPunched: false };
const enrolledPunched = { hasActiveEnrollment: true, hasCaptureEvidence: false, hasEverPunched: true };
const enrolledNoEvidence = { hasActiveEnrollment: true, hasCaptureEvidence: false, hasEverPunched: false };
const notEnrolled = { hasActiveEnrollment: false, hasCaptureEvidence: false, hasEverPunched: false };

const input = (over) => ({
  status: 'absent', attendanceDate: TODAY, todayLocal: TODAY, firstInAt: null,
  isPolicyDerived: false, evidence: enrolledAndCaptured, ...over,
});
const reason = (v) => (v.eligible ? null : v.reason);

describe('attendance SMS eligibility', () => {
  it('non-enrolled learner: absent SMS is suppressed', () => {
    assert.equal(reason(evaluateAttendanceSmsEligibility(input({ evidence: notEnrolled }))), 'not_biometrically_enrolled');
  });

  it('non-enrolled learner with a stray punch-less "present" is suppressed (no punch evidence)', () => {
    assert.equal(reason(evaluateAttendanceSmsEligibility(input({ status: 'present', evidence: notEnrolled }))), 'no_punch_evidence');
  });

  it('enrolled learner on the device with no punch today: absent SMS is allowed', () => {
    assert.equal(evaluateAttendanceSmsEligibility(input({ evidence: enrolledAndCaptured })).eligible, true);
  });

  it('enrolled learner without device evidence and no history: absent SMS is suppressed', () => {
    assert.equal(reason(evaluateAttendanceSmsEligibility(input({ evidence: enrolledNoEvidence }))), 'no_device_evidence');
  });

  it('enrolled learner who has punched before (no capture stamp) is treated as on the device', () => {
    assert.equal(evaluateAttendanceSmsEligibility(input({ evidence: enrolledPunched })).eligible, true);
  });

  it('valid punch: arrival SMS is allowed', () => {
    const v = evaluateAttendanceSmsEligibility(input({ status: 'present', firstInAt: '2026-09-23T05:10:00Z', evidence: notEnrolled }));
    assert.equal(v.eligible, true);
  });

  it('valid punch: late SMS is allowed', () => {
    const v = evaluateAttendanceSmsEligibility(input({ status: 'late', firstInAt: '2026-09-23T06:10:00Z' }));
    assert.equal(v.eligible, true);
  });

  it('enrolment revoked after queueing (evidence reloaded at send time): absent SMS is suppressed', () => {
    assert.equal(reason(evaluateAttendanceSmsEligibility(input({ evidence: notEnrolled }))), 'not_biometrically_enrolled');
  });

  it('pending_capture / suspended enrolment is not "active": suppressed', () => {
    assert.equal(reason(evaluateAttendanceSmsEligibility(input({ evidence: { hasActiveEnrollment: false, hasCaptureEvidence: true, hasEverPunched: true } }))), 'not_biometrically_enrolled');
  });

  it('policy-derived verdicts never notify', () => {
    assert.equal(reason(evaluateAttendanceSmsEligibility(input({ isPolicyDerived: true }))), 'policy_derived_verdict');
  });

  it('stale catch-up verdicts (older than the freshness window) are suppressed', () => {
    assert.equal(MAX_ATTENDANCE_SMS_AGE_DAYS, 1);
    assert.equal(reason(evaluateAttendanceSmsEligibility(input({ attendanceDate: '2026-09-21' }))), 'stale_attendance_date');
    assert.equal(reason(evaluateAttendanceSmsEligibility(input({ attendanceDate: '2026-09-17', status: 'present', firstInAt: '2026-09-17T05:00:00Z' }))), 'stale_attendance_date');
  });

  it('yesterday (end-of-day finalisation) is still inside the window', () => {
    assert.equal(evaluateAttendanceSmsEligibility(input({ attendanceDate: '2026-09-22' })).eligible, true);
  });

  it('future-dated verdicts are suppressed', () => {
    assert.equal(reason(evaluateAttendanceSmsEligibility(input({ attendanceDate: '2026-09-24' }))), 'future_date');
  });

  it('malformed dates fail closed', () => {
    assert.equal(reason(evaluateAttendanceSmsEligibility(input({ attendanceDate: 'nope' }))), 'invalid_date');
  });
});

describe('parseAttendanceDedupKey', () => {
  it('parses the fanout dedup key format', () => {
    assert.deepEqual(parseAttendanceDedupKey('150002:9917:attendance.record.upserted:2026-09-21:absent'),
      { policyId: 150002, personId: 9917, attendanceDate: '2026-09-21', status: 'absent' });
    assert.deepEqual(parseAttendanceDedupKey('1:2:attendance.record.upserted:2026-09-21:half_day')?.status, 'half_day');
  });

  it('general school messages (other key shapes / no key) are not treated as attendance messages', () => {
    assert.equal(parseAttendanceDedupKey(null), null);
    assert.equal(parseAttendanceDedupKey(''), null);
    assert.equal(parseAttendanceDedupKey('passout:55:gate'), null);
    assert.equal(parseAttendanceDedupKey('fees:12:reminder:2026-09-01'), null);
  });
});

describe('schoolLocalDate', () => {
  it('applies the school UTC offset across midnight', () => {
    assert.equal(schoolLocalDate(new Date('2026-09-22T21:30:00Z'), 180), '2026-09-23');
    assert.equal(schoolLocalDate(new Date('2026-09-22T20:30:00Z'), 180), '2026-09-22');
  });
});
