// Historical repair — pure range planner (Phase E).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planRange } from '@/lib/attendance/historical-repair';

describe('planRange', () => {
  it('valid range → ok with day count', () => {
    const p = planRange('2026-07-15', '2026-07-23');
    assert.equal(p.ok, true);
    assert.equal(p.days, 9);
    assert.equal(p.from, '2026-07-15');
    assert.equal(p.to, '2026-07-23');
  });

  it('single day → 1', () => {
    assert.equal(planRange('2026-07-20', '2026-07-20').days, 1);
  });

  it('reversed dates are tolerated (swapped)', () => {
    const p = planRange('2026-07-23', '2026-07-15');
    assert.equal(p.ok, true);
    assert.equal(p.from, '2026-07-15');
  });

  it('rejects malformed dates', () => {
    assert.equal(planRange('2026/07/15', '2026-07-23').ok, false);
    assert.equal(planRange('yesterday', 'today').ok, false);
  });

  it('rejects a future start', () => {
    const future = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    assert.equal(planRange(future, future).ok, false);
  });

  it('caps oversized ranges', () => {
    const p = planRange('2026-01-01', '2026-12-31');
    assert.equal(p.ok, false);
    assert.match(p.reason, /too large/i);
  });

  it('allows exactly the max window', () => {
    // 92-day inclusive window
    const from = '2026-04-01', to = '2026-07-01'; // 92 days
    const p = planRange(from, to);
    assert.equal(p.days, 92);
    assert.equal(p.ok, true);
  });
});
