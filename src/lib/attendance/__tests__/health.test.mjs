// Attendance Health Center — pure rollup semantics.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeOverallHealth } from '@/lib/attendance/health';

const c = (key, score, weight = 1, recommendation = null, status) => ({
  key, label: key, score, weight, detail: '',
  recommendation, status: status ?? (score >= 90 ? 'healthy' : score >= 70 ? 'degraded' : 'critical'),
});

describe('computeOverallHealth', () => {
  it('perfect checks → 100 healthy, no recommendations', () => {
    const r = computeOverallHealth([c('a', 100), c('b', 100, 2)]);
    assert.equal(r.score, 100);
    assert.equal(r.status, 'healthy');
    assert.deepEqual(r.recommendations, []);
  });

  it('weighted average respects weights', () => {
    const r = computeOverallHealth([c('a', 100, 3), c('b', 0, 1)]);
    assert.equal(r.score, 75);
    assert.equal(r.status, 'degraded');
  });

  it('critical below 70', () => {
    const r = computeOverallHealth([c('a', 40), c('b', 60)]);
    assert.equal(r.status, 'critical');
  });

  it('unknown checks are excluded from the score', () => {
    const r = computeOverallHealth([c('a', 100), c('x', 0, 5, null, 'unknown')]);
    assert.equal(r.score, 100);
  });

  it('recommendations ordered worst-first, healthy checks excluded', () => {
    const r = computeOverallHealth([
      c('ok', 95, 1, 'should not appear'),
      c('bad', 20, 1, 'fix the device'),
      c('meh', 75, 1, 'check the queue'),
    ]);
    assert.deepEqual(r.recommendations, ['fix the device', 'check the queue']);
  });

  it('empty check list does not divide by zero', () => {
    const r = computeOverallHealth([]);
    assert.equal(Number.isFinite(r.score), true);
  });
});
