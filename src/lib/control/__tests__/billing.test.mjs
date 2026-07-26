// Control billing ledger — pure money maths (Phase 11).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { outstanding, deriveInvoiceStatus, computePeriod } from '@/lib/control/billing';

describe('outstanding', () => {
  it('is amount minus paid, floored at 0', () => {
    assert.equal(outstanding(1000, 300), 700);
    assert.equal(outstanding(1000, 1000), 0);
    assert.equal(outstanding(1000, 1500), 0);
  });
});

describe('deriveInvoiceStatus', () => {
  const now = new Date('2026-06-15T12:00:00Z');
  it('void wins over everything', () => {
    assert.equal(deriveInvoiceStatus({ amount: 1000, paid: 0, dueDate: '2026-01-01', voided: true, now }), 'void');
  });
  it('fully paid → paid', () => {
    assert.equal(deriveInvoiceStatus({ amount: 1000, paid: 1000, dueDate: '2026-01-01', now }), 'paid');
  });
  it('a free (0) invoice is paid', () => {
    assert.equal(deriveInvoiceStatus({ amount: 0, paid: 0, dueDate: null, now }), 'paid');
  });
  it('past due + unpaid → overdue', () => {
    assert.equal(deriveInvoiceStatus({ amount: 1000, paid: 200, dueDate: '2026-06-01', now }), 'overdue');
  });
  it('not yet due + unpaid → issued', () => {
    assert.equal(deriveInvoiceStatus({ amount: 1000, paid: 0, dueDate: '2026-12-01', now }), 'issued');
  });
});

describe('computePeriod', () => {
  it('adds the cycle days to the start', () => {
    assert.deepEqual(computePeriod(365, '2026-01-01'), { start: '2026-01-01', end: '2027-01-01' });
    assert.deepEqual(computePeriod(30, '2026-01-01'), { start: '2026-01-01', end: '2026-01-31' });
  });
  it('one_time (0 days) → no end', () => {
    assert.deepEqual(computePeriod(0, '2026-01-01'), { start: '2026-01-01', end: null });
  });
});
