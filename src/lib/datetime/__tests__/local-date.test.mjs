import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toLocalDateStr, schoolLocalToday } from '../local-date.ts';

describe('toLocalDateStr — local calendar components, never UTC', () => {
  it('returns the LOCAL date even when UTC has already rolled over', () => {
    // A Date whose local components are 2026-07-27 must format as 2026-07-27,
    // regardless of what toISOString() (UTC) would say.
    const d = new Date(2026, 6, 27, 1, 30); // local 2026-07-27 01:30
    assert.equal(toLocalDateStr(d), '2026-07-27');
  });
  it('zero-pads month and day', () => {
    assert.equal(toLocalDateStr(new Date(2026, 0, 5)), '2026-01-05');
  });
});

describe('schoolLocalToday — offset applied before reading the date', () => {
  it('EAT (+180) rolls a late-UTC instant forward to the correct local day', () => {
    // 2026-07-26T22:00:00Z is 2026-07-27 01:00 in EAT → local day is the 27th.
    const instant = new Date('2026-07-26T22:00:00Z');
    assert.equal(schoolLocalToday(180, instant), '2026-07-27');
  });
  it('UTC (offset 0) reads the UTC day', () => {
    const instant = new Date('2026-07-26T22:00:00Z');
    assert.equal(schoolLocalToday(0, instant), '2026-07-26');
  });
  it('defaults to the EAT offset', () => {
    const instant = new Date('2026-07-26T22:00:00Z');
    assert.equal(schoolLocalToday(undefined, instant), '2026-07-27');
  });
});
