// Historical-analysis helpers ("Analyze historical data…" button) — pure
// clustering/summarizing logic behind analyzeDeviceHistory. Reported ask:
// "can we still add a button to ensure DRAIS can also help analyse the
// already stored data too" — these two functions are the core algorithm;
// analyzeDeviceHistory itself just reads attendance_raw_events and calls them.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clusterSkewBands, summarizeDayBands } from '@/lib/attendance/time-intelligence/engine.ts';

describe('clusterSkewBands — groups a day\'s skew readings into distinct clock states', () => {
  it('a smoothly-drifting day (all readings close together) is one band', () => {
    const bands = clusterSkewBands([379, 840, 1290, 1403, 1564, 1677, 1917, 2000]);
    assert.equal(bands.length, 1);
    assert.equal(bands[0].count, 8);
  });

  it('splits into two bands when a genuine jump exceeds the gap threshold', () => {
    // Reported live on JIPRA: skew held at -17992s for hours, then jumped
    // to +21600s and held there — two distinct clock states, not noise.
    const bands = clusterSkewBands([-17992, -17992, -17992, 21600, 21600, 21600, 21600, 21600]);
    assert.equal(bands.length, 2);
    // Sorted largest-count-first.
    assert.equal(bands[0].count, 5);
    assert.equal(bands[0].skewSeconds, 21600);
    assert.equal(bands[1].count, 3);
    assert.equal(bands[1].skewSeconds, -17992);
  });

  it('small noise within the gap threshold stays one band', () => {
    const bands = clusterSkewBands([17991, 17992, 17994, 17997, 17998]); // City Parents-style tight spread
    assert.equal(bands.length, 1);
  });

  it('empty input returns no bands', () => {
    assert.deepEqual(clusterSkewBands([]), []);
  });

  it('a custom gap threshold changes what counts as a jump', () => {
    // Same data, tighter threshold now splits it.
    const bands = clusterSkewBands([100, 200, 2000], 500);
    assert.equal(bands.length, 2);
  });
});

describe('summarizeDayBands — stable/unstable verdict + suggested correction', () => {
  it('one band → stable, no suggestion needed', () => {
    const { stable, suggestedDriftHours } = summarizeDayBands([{ skewSeconds: 17992, count: 10 }], 10);
    assert.equal(stable, true);
    assert.equal(suggestedDriftHours, null);
  });

  it('a clear majority band → unstable, suggests its rounded hours', () => {
    const bands = [{ skewSeconds: 21600, count: 7 }, { skewSeconds: -17992, count: 3 }];
    const { stable, suggestedDriftHours } = summarizeDayBands(bands, 10);
    assert.equal(stable, false);
    assert.equal(suggestedDriftHours, 6); // 21600s = 6h
  });

  it('three-way split with no majority → unstable but NO suggestion (ambiguous, needs a human)', () => {
    const bands = [{ skewSeconds: 21600, count: 4 }, { skewSeconds: -17992, count: 3 }, { skewSeconds: 0, count: 3 }];
    const { stable, suggestedDriftHours } = summarizeDayBands(bands, 10);
    assert.equal(stable, false);
    assert.equal(suggestedDriftHours, null); // largest band (4) is under half of 10
  });

  it('majority band exactly at the 50% boundary is still suggested (>=, not >)', () => {
    const bands = [{ skewSeconds: 3600, count: 5 }, { skewSeconds: 7200, count: 5 }];
    const { suggestedDriftHours } = summarizeDayBands(bands, 10);
    assert.equal(suggestedDriftHours, 1); // first band (largest count, tie broken by input order) wins
  });
});
