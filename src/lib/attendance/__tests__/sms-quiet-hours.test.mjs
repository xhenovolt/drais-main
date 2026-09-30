import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isWithinQuietHours, localHHMM } from '../sms-quiet-hours.ts';

describe('isWithinQuietHours', () => {
  it('disabled window is never active', () => {
    assert.equal(isWithinQuietHours('02:00', { enabled: false, start: '00:00', end: '05:00' }), false);
  });

  it('same-day window (no midnight wrap)', () => {
    const w = { enabled: true, start: '13:00', end: '14:00' };
    assert.equal(isWithinQuietHours('12:59', w), false);
    assert.equal(isWithinQuietHours('13:00', w), true);
    assert.equal(isWithinQuietHours('13:30', w), true);
    assert.equal(isWithinQuietHours('14:00', w), false); // end is exclusive
  });

  it('midnight-wrapping window (the boarders-at-1am case)', () => {
    const w = { enabled: true, start: '23:00', end: '05:00' };
    assert.equal(isWithinQuietHours('01:00', w), true);
    assert.equal(isWithinQuietHours('23:30', w), true);
    assert.equal(isWithinQuietHours('04:59', w), true);
    assert.equal(isWithinQuietHours('05:00', w), false);
    assert.equal(isWithinQuietHours('12:00', w), false);
    assert.equal(isWithinQuietHours('22:59', w), false);
  });

  it('start === end is treated as no window, not "all day"', () => {
    assert.equal(isWithinQuietHours('00:00', { enabled: true, start: '05:00', end: '05:00' }), false);
    assert.equal(isWithinQuietHours('12:00', { enabled: true, start: '05:00', end: '05:00' }), false);
  });

  it('malformed times fail closed (never active)', () => {
    assert.equal(isWithinQuietHours('12:00', { enabled: true, start: 'bad', end: '05:00' }), false);
  });
});

describe('localHHMM', () => {
  it('converts a real UTC instant to school-local HH:MM using the offset', () => {
    // 22:30 UTC + 180min (UTC+3) = 01:30 the next day, school-local.
    assert.equal(localHHMM(new Date('2026-09-29T22:30:00.000Z'), 180), '01:30');
  });
  it('negative offset (west of UTC)', () => {
    assert.equal(localHHMM(new Date('2026-09-29T01:00:00.000Z'), -300), '20:00');
  });
});
