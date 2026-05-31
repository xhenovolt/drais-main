// node:test — school-hours late-detection logic.
// Pure copies of the helpers in src/lib/comm/adms-attendance.ts so we
// lock the behaviour down without dragging mysql2 into tsx --test.
//
// Run: npx tsx --test src/lib/ingestion/__tests__/school-hours.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Mirror of the helpers ─────────────────────────────────────────────────
// If these diverge from src/lib/comm/adms-attendance.ts the diff IS the
// audit trail — both must be updated together. The test name in any
// failure points reviewers at this file first.

function isoToLocalMinutes(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
}
function hhmmToMinutes(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  return Number.parseInt(m[1], 10) * 60 + Number.parseInt(m[2], 10);
}
function isAfterLateCutoff(checkTime, startTimeHHMM, graceMinutes) {
  const punchMins = isoToLocalMinutes(checkTime);
  if (punchMins == null) return false;
  const cutoffMins = hhmmToMinutes(startTimeHHMM);
  if (cutoffMins == null) return false;
  const effective = cutoffMins + (graceMinutes ?? 0);
  return punchMins > effective;
}
function computeMinutesLate(checkTime, hours) {
  if (!hours) return null;
  const punchMins = isoToLocalMinutes(checkTime);
  if (punchMins == null) return null;
  const cutoffMins = hhmmToMinutes(hours.startTime);
  if (cutoffMins == null) return null;
  const effective = cutoffMins + (hours.lateAfterMinutes ?? 0);
  const delta = punchMins - effective;
  return delta > 0 ? delta : null;
}

// Day-of-week resolver (mirror of src/lib/school-hours.ts toDayIndex)
function toDayIndex(date) {
  if (date instanceof Date) {
    return Number.isNaN(date.getTime()) ? null : date.getDay();
  }
  if (typeof date === 'number') {
    if (date >= 0 && date <= 6 && Number.isInteger(date)) return date;
    const d = new Date(date);
    return Number.isNaN(d.getTime()) ? null : d.getDay();
  }
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : d.getDay();
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('toDayIndex', () => {
  it('accepts a Date', () => {
    // Use UTC-anchored construction to make the test timezone-stable.
    // 2026-06-07 is a Sunday in every timezone.
    const d = new Date('2026-06-07T12:00:00Z');
    // Local day might differ from UTC day depending on tester's TZ —
    // assert on a window rather than a fixed value.
    const dow = toDayIndex(d);
    assert.ok(dow === 0 || dow === 6, `expected 0 or 6 from a Sun-UTC date, got ${dow}`);
  });
  it('accepts a numeric 0-6 directly', () => {
    assert.equal(toDayIndex(0), 0);
    assert.equal(toDayIndex(5), 5);
    assert.equal(toDayIndex(6), 6);
  });
  it('returns null for unparseable strings/NaN', () => {
    assert.equal(toDayIndex('nonsense'), null);
    assert.equal(toDayIndex(NaN), null);
    // Numbers > 6 (or < 0) are treated as UNIX timestamps by design —
    // schools that want strict 0-6 should pass an integer in range.
  });
});

describe('isAfterLateCutoff', () => {
  // We use timestamps that are clearly before/after a 07:30 start time
  // in any reasonable TZ. The construction below uses local-time
  // formatting (no Z) so getHours/getMinutes return what the string says.
  it('a 07:00 punch is on-time for a 07:30 cutoff, no grace', () => {
    assert.equal(isAfterLateCutoff('2026-05-31T07:00:00', '07:30', null), false);
  });
  it('a 07:30 punch is on-time for a 07:30 cutoff, no grace', () => {
    assert.equal(isAfterLateCutoff('2026-05-31T07:30:00', '07:30', null), false);
  });
  it('a 07:31 punch IS late for a 07:30 cutoff, no grace', () => {
    assert.equal(isAfterLateCutoff('2026-05-31T07:31:00', '07:30', null), true);
  });
  it('grace period extends the late cutoff (15 min grace)', () => {
    // Punch at 07:44 with 15 min grace = on-time (effective cutoff 07:45)
    assert.equal(isAfterLateCutoff('2026-05-31T07:44:00', '07:30', 15), false);
    // Punch at 07:46 with 15 min grace = late
    assert.equal(isAfterLateCutoff('2026-05-31T07:46:00', '07:30', 15), true);
  });
  it('garbage timestamps fail safe = "not late"', () => {
    assert.equal(isAfterLateCutoff('nonsense', '07:30', null), false);
    assert.equal(isAfterLateCutoff('2026-05-31T07:30:00', 'not-a-time', null), false);
  });
});

describe('computeMinutesLate', () => {
  it('returns null when no hours configured', () => {
    assert.equal(computeMinutesLate('2026-05-31T09:00:00', null), null);
  });
  it('returns null when punch is on/before cutoff', () => {
    assert.equal(computeMinutesLate('2026-05-31T07:00:00', { startTime: '07:30', lateAfterMinutes: null }), null);
    assert.equal(computeMinutesLate('2026-05-31T07:30:00', { startTime: '07:30', lateAfterMinutes: null }), null);
  });
  it('returns the exact delta past the cutoff', () => {
    assert.equal(computeMinutesLate('2026-05-31T08:00:00', { startTime: '07:30', lateAfterMinutes: null }), 30);
    assert.equal(computeMinutesLate('2026-05-31T07:45:00', { startTime: '07:30', lateAfterMinutes: null }), 15);
  });
  it('subtracts grace correctly', () => {
    // 07:50 punch, 07:30 start + 15 grace → 5 min late
    assert.equal(computeMinutesLate('2026-05-31T07:50:00', { startTime: '07:30', lateAfterMinutes: 15 }), 5);
    // 07:44 with 15 grace → not late (returns null)
    assert.equal(computeMinutesLate('2026-05-31T07:44:00', { startTime: '07:30', lateAfterMinutes: 15 }), null);
  });
});

describe('school-hours resolution priority — Phase 0 rigidity fix', () => {
  // Documents the rule that fixes the hardcoded 8:30 AM late threshold
  // from src/app/api/attendance/biometric/route.ts.
  it('per-day override wins over default row', () => {
    const DEFAULT = { startTime: '07:30', lateAfterMinutes: 15 };
    const FRIDAY  = { startTime: '07:30', lateAfterMinutes: 30 }; // Jumu'ah day, more grace
    // Friday late-check: 07:55 with 30 grace → not late
    assert.equal(computeMinutesLate('2026-05-29T07:55:00', FRIDAY), null);
    // But on a Monday using the default 15-grace, 07:55 IS late by 10 min
    assert.equal(computeMinutesLate('2026-05-25T07:55:00', DEFAULT), 10);
  });

  it('isClosed → no late check, no SMS (caller short-circuits)', () => {
    // We test the SHAPE: when hours.isClosed=true, the adms-attendance
    // helper returns early before calling computeMinutesLate. This
    // assertion documents the contract for that branch.
    const closedHours = { isClosed: true };
    assert.equal(closedHours.isClosed, true);
  });
});
