// Scenario E — gender × residence statistics must reconcile, and mismatches must be surfaced.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildBreakdown, reconcile } from '@/lib/attendance/breakdown.ts';

const r = (residence, gender, bucket, n, reported = 0) => ({ residence, gender, bucket, reported, n });
const ctx = { date: '2026-09-25', boardingMode: 'DAILY_PUNCH', reportingPeriod: null };

const rows = [
  r('boarding', 'female', 'present', 30), r('boarding', 'female', 'awaiting', 10),
  r('boarding', 'male', 'present', 25), r('boarding', 'male', 'absent', 5),
  r('day', 'female', 'present', 60), r('day', 'female', 'late', 6), r('day', 'female', 'absent', 14),
  r('day', 'male', 'present', 50), r('day', 'male', 'absent', 20),
  r('day', 'unknown', 'present', 40), r('day', 'unknown', 'awaiting', 40),
];

describe('breakdown', () => {
  const b = buildBreakdown(rows, ctx);
  it('counts every learner: Total = Boarding + Day and Girls + Boys + Not recorded = Total', () => {
    assert.equal(b.overall.total, 300);
    assert.equal(b.residence.boarding.total + b.residence.day.total, 300);
    assert.equal(b.gender.female.total + b.gender.male.total + b.gender.unknown.total, 300);
  });
  it('unknown gender is accounted for, not silently dropped', () => {
    assert.equal(b.gender.unknown.total, 80);
  });
  it('gender × residence cells are correct', () => {
    assert.equal(b.cells.female.boarding.total, 40);
    assert.equal(b.cells.female.day.presentToday, 66);
    assert.equal(b.cells.male.day.absent, 20);
    assert.equal(b.cells.male.boarding.presentToday, 25);
  });
  it('present today includes late but late is also shown separately', () => {
    assert.equal(b.residence.day.late, 6);
    assert.equal(b.residence.day.presentToday, 60 + 6 + 50 + 40);
  });
  it('every equation holds', () => {
    assert.deepEqual(b.reconciliation, { ok: true, issues: [] });
  });
  it('reported (period fact) is counted apart from present today (punch today)', () => {
    const x = buildBreakdown([
      r('boarding', 'female', 'reportedNotRequired', 8, 1), r('boarding', 'female', 'present', 2, 1), r('boarding', 'female', 'notReported', 5, 0),
    ], { ...ctx, boardingMode: 'REPORTED_ONCE', reportingPeriod: 'Term 3' });
    assert.equal(x.residence.boarding.reported, 10);
    assert.equal(x.residence.boarding.presentToday, 2);
    assert.equal(x.residence.boarding.total - x.residence.boarding.reported, 5);
    assert.equal(x.reconciliation.ok, true);
  });
  it('a broken breakdown is reported, not hidden', () => {
    const broken = { ...b };
    delete broken.reconciliation;
    const bad = { ...broken, residence: { ...b.residence, day: { ...b.residence.day, total: b.residence.day.total + 3 } } };
    const res = reconcile(bad);
    assert.equal(res.ok, false);
    assert.match(res.issues.join(' '), /does not equal total learners/);
  });
  it('boarders "reported earlier" cannot exceed boarders who reported', () => {
    const bad = buildBreakdown([r('boarding', 'male', 'reportedNotRequired', 4, 0)], { ...ctx, boardingMode: 'REPORTED_ONCE' });
    assert.equal(bad.reconciliation.ok, false);
  });
});
