// Control dunning — pure stage decision (Phase 14).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dunningStage } from '@/lib/control/dunning';

describe('dunningStage', () => {
  it('past due → expired', () => {
    assert.equal(dunningStage(-1), 'expired');
    assert.equal(dunningStage(-30), 'expired');
  });
  it('today / tomorrow → expiring_1', () => {
    assert.equal(dunningStage(0), 'expiring_1');
    assert.equal(dunningStage(1), 'expiring_1');
  });
  it('within a week → expiring_7', () => {
    assert.equal(dunningStage(2), 'expiring_7');
    assert.equal(dunningStage(7), 'expiring_7');
  });
  it('further out or unknown → none', () => {
    assert.equal(dunningStage(8), 'none');
    assert.equal(dunningStage(365), 'none');
    assert.equal(dunningStage(null), 'none');
  });
});
