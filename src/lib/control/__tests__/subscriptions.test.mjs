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

import { billingCycleDays, nextEndDate, installmentAmount } from '@/lib/control/subscriptions';

describe('billing helpers', () => {
  it('cycle → days', () => {
    assert.equal(billingCycleDays('monthly'), 30);
    assert.equal(billingCycleDays('termly'), 122);
    assert.equal(billingCycleDays('annual'), 365);
    assert.equal(billingCycleDays('one_time'), 0);
  });
  it('nextEndDate adds the cycle; one_time → null', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    assert.equal(nextEndDate('annual', from), '2027-01-01');
    assert.equal(nextEndDate('monthly', from), '2026-01-31');
    assert.equal(nextEndDate('one_time', from), null);
  });
  it('installmentAmount splits and rounds up', () => {
    assert.equal(installmentAmount(1200000, 3), 400000);
    assert.equal(installmentAmount(1000, 3), 334);   // ceil
    assert.equal(installmentAmount(500, 1), 500);
    assert.equal(installmentAmount(500, 0), 500);     // guard: min 1
  });
});

import { invoiceAmounts } from '@/lib/control/subscriptions';

describe('invoiceAmounts (installation + subscription)', () => {
  it('first invoice includes the one-time installation fee', () => {
    assert.deepEqual(invoiceAmounts(800000, 1200000, true), { installation: 800000, subscription: 1200000, total: 2000000 });
  });
  it('later invoices bill subscription only', () => {
    assert.deepEqual(invoiceAmounts(800000, 1200000, false), { installation: 0, subscription: 1200000, total: 1200000 });
  });
  it('handles zero installation / free plan', () => {
    assert.deepEqual(invoiceAmounts(0, 0, true), { installation: 0, subscription: 0, total: 0 });
    assert.deepEqual(invoiceAmounts(0, 500000, true), { installation: 0, subscription: 500000, total: 500000 });
  });
});
