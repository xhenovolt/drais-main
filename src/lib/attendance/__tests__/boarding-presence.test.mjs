// Boarding continuous-presence policy (DRAIS Phase 4) — pure validity-window
// logic. The DB-backed lookup/write helpers (getBoardingPresenceState,
// setBoardingPresence) aren't covered here since they need a live database;
// this covers the part that decides whether a checked-in student still
// counts as policy-present for a given day, which is where the actual
// business rule lives.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isWithinValidityWindow } from '@/lib/attendance/boarding-presence';

const checkedIn = (sinceDate) => ({ status: 'checked_in', sinceDate, expectedReturnDate: null, reason: null });
const onLeave = (sinceDate) => ({ status: 'on_leave', sinceDate, expectedReturnDate: null, reason: 'Family visit' });

describe('isWithinValidityWindow', () => {
  it('on_leave is never policy-present, regardless of validity window', () => {
    assert.equal(isWithinValidityWindow(onLeave('2026-09-01'), new Date('2026-09-02'), null), false);
    assert.equal(isWithinValidityWindow(onLeave('2026-09-01'), new Date('2026-09-02'), 30), false);
  });

  it('checked_in with no validity window (null) stays present indefinitely', () => {
    assert.equal(isWithinValidityWindow(checkedIn('2026-01-01'), new Date('2026-09-22'), null), true);
    assert.equal(isWithinValidityWindow(checkedIn('2026-01-01'), new Date('2026-09-22'), undefined), true);
  });

  it('checked_in stays present through the exact edge of a finite window', () => {
    const state = checkedIn('2026-09-01');
    // 0 days elapsed = still valid (same day check-in).
    assert.equal(isWithinValidityWindow(state, new Date('2026-09-01'), 7), true);
    // Exactly at the boundary (7 days later) = still valid ("within" is inclusive).
    assert.equal(isWithinValidityWindow(state, new Date('2026-09-08'), 7), true);
    // One day past the boundary = lapsed, needs fresh evidence.
    assert.equal(isWithinValidityWindow(state, new Date('2026-09-09'), 7), false);
  });

  it('a date before since_date is never valid (clock/data anomaly guard)', () => {
    assert.equal(isWithinValidityWindow(checkedIn('2026-09-10'), new Date('2026-09-05'), 30), false);
  });
});
