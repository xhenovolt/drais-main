// Control health scoring — pure (Phase 17).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { healthScore } from '@/lib/control/health-history';

describe('healthScore', () => {
  it('a clean school scores 100', () => {
    assert.equal(healthScore([]), 100);
  });
  it('critical bites hardest (−40)', () => {
    assert.equal(healthScore([{ severity: 'critical' }]), 60);
    assert.equal(healthScore([{ severity: 'critical' }, { severity: 'critical' }]), 20);
  });
  it('warning −15, info −5', () => {
    assert.equal(healthScore([{ severity: 'warning' }]), 85);
    assert.equal(healthScore([{ severity: 'info' }]), 95);
    assert.equal(healthScore([{ severity: 'warning' }, { severity: 'info' }]), 80);
  });
  it('floors at 0, never negative', () => {
    assert.equal(healthScore(Array(10).fill({ severity: 'critical' })), 0);
  });
});
