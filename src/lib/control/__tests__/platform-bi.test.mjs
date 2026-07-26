// Platform BI — pure monthly-equivalent (Phase 24).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { monthlyEquivalent } from '@/lib/control/platform-bi';

describe('monthlyEquivalent', () => {
  it('annual price → ~1/12 per month', () => {
    // 1,200,000 / year over 365d * 30 ≈ 98,630
    assert.equal(monthlyEquivalent(1_200_000, 365), Math.round(1_200_000 * 30 / 365));
  });
  it('monthly cycle → the price itself', () => {
    assert.equal(monthlyEquivalent(200_000, 30), 200_000);
  });
  it('termly (122d) prorates to a month', () => {
    assert.equal(monthlyEquivalent(400_000, 122), Math.round(400_000 * 30 / 122));
  });
  it('one-time (0 days) does not recur', () => {
    assert.equal(monthlyEquivalent(5_000_000, 0), 0);
  });
});
