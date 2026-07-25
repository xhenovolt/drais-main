// Subscription plan engine — pure limit maths (P5).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { usageAgainst, checkCanAdd, LIMIT_KEYS } from '@/lib/control/subscriptions';

describe('usageAgainst', () => {
  it('computes pct + over per resource', () => {
    const lines = usageAgainst({ learners: 300, devices: 2 }, { learners: 150, devices: 3 });
    const learners = lines.find(l => l.key === 'learners');
    const devices = lines.find(l => l.key === 'devices');
    assert.equal(learners.pct, 50);
    assert.equal(learners.over, false);
    assert.equal(devices.over, true); // 3 > 2
    assert.equal(devices.pct, 100);   // clamped
  });

  it('treats null/0 limit as unlimited', () => {
    const lines = usageAgainst({ learners: null, staff: 0 }, { learners: 99999, staff: 500 });
    assert.equal(lines.find(l => l.key === 'learners').unlimited, true);
    assert.equal(lines.find(l => l.key === 'learners').over, false);
    assert.equal(lines.find(l => l.key === 'staff').unlimited, true);
  });

  it('returns a line for every limit key', () => {
    assert.equal(usageAgainst({}, {}).length, LIMIT_KEYS.length);
  });
});

describe('checkCanAdd', () => {
  it('blocks when the addition would exceed the limit', () => {
    assert.equal(checkCanAdd({ devices: 2 }, 'devices', 2, 1).allowed, false);
    assert.match(checkCanAdd({ devices: 2 }, 'devices', 2, 1).reason, /limit reached/i);
  });
  it('allows up to the limit', () => {
    assert.equal(checkCanAdd({ devices: 2 }, 'devices', 1, 1).allowed, true);
  });
  it('unlimited plan always allows', () => {
    assert.equal(checkCanAdd({ learners: null }, 'learners', 100000, 50).allowed, true);
    assert.equal(checkCanAdd({}, 'staff', 999, 10).allowed, true);
  });
});
