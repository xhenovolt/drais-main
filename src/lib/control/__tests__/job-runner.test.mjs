// Control job runner — pure scheduling maths (Phase 18).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeBackoffSeconds, isDue } from '@/lib/control/job-runner';

describe('computeBackoffSeconds', () => {
  it('doubles each attempt from 60s', () => {
    assert.equal(computeBackoffSeconds(1), 60);
    assert.equal(computeBackoffSeconds(2), 120);
    assert.equal(computeBackoffSeconds(3), 240);
    assert.equal(computeBackoffSeconds(4), 480);
  });
  it('caps at one hour', () => {
    assert.equal(computeBackoffSeconds(20), 3600);
  });
  it('treats <1 attempt as 1', () => {
    assert.equal(computeBackoffSeconds(0), 60);
    assert.equal(computeBackoffSeconds(-3), 60);
  });
});

describe('isDue', () => {
  it('due when run_after <= now', () => {
    assert.equal(isDue(1000, 1000), true);
    assert.equal(isDue(999, 1000), true);
  });
  it('not due when scheduled in the future', () => {
    assert.equal(isDue(2000, 1000), false);
  });
});
