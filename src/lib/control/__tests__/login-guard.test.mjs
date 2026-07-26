// Control login brute-force guard — pure throttle decision (Phase 8).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { throttleDecision } from '@/lib/control/login-guard';

describe('throttleDecision', () => {
  it('allows under the threshold and reports remaining', () => {
    const d = throttleDecision(0, 0);
    assert.equal(d.blocked, false);
    assert.equal(d.remaining, 5);
    assert.equal(throttleDecision(4, 0).remaining, 1);
  });

  it('blocks at the threshold with a base cooldown', () => {
    const d = throttleDecision(5, 0); // just failed the 5th time
    assert.equal(d.blocked, true);
    assert.equal(d.retryAfterSec, 30); // base
  });

  it('backs off exponentially with more failures', () => {
    assert.equal(throttleDecision(6, 0).retryAfterSec, 60);
    assert.equal(throttleDecision(7, 0).retryAfterSec, 120);
    assert.equal(throttleDecision(8, 0).retryAfterSec, 240);
  });

  it('caps the cooldown at maxSec', () => {
    assert.equal(throttleDecision(20, 0).retryAfterSec, 900); // capped
  });

  it('the wait shrinks as time passes and unblocks after cooldown', () => {
    assert.equal(throttleDecision(5, 10).retryAfterSec, 20); // 30 - 10
    assert.equal(throttleDecision(5, 30).blocked, false);    // cooldown elapsed
    assert.equal(throttleDecision(5, 45).blocked, false);
  });

  it('honours custom options', () => {
    const d = throttleDecision(3, 0, { threshold: 3, baseSec: 10, maxSec: 100 });
    assert.equal(d.blocked, true);
    assert.equal(d.retryAfterSec, 10);
  });
});
