// Regression tests for decidePunchTime — the device-clock trust decision.
// Added after a live incident: CORRECT_BY_DRIFT trusted a device clock
// reading arbitrarily far "behind" real time as legitimate offline backlog,
// with no upper bound. Within a single short ingest batch from ONE device,
// some punches read a plausible few-hours-behind while others read ~14 hours
// behind — both were blindly trusted as "high confidence", because only the
// "ahead" (future) direction was ever distrusted. Half a school's morning
// showed arrival times hours later than reality before anyone noticed.
//
// Run with: npx tsx --test src/lib/attendance/__tests__/device-clock.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decidePunchTime, measureBatchOffsetSeconds } from '../device-clock.ts';

const basePolicy = (overrides = {}) => ({
  schoolId: 1,
  timezone: 'Africa/Kampala',
  offsetMinutes: 180, // EAT
  policy: 'CORRECT_BY_DRIFT',
  autoSyncDeviceTime: false,
  maxDriftSeconds: 120,
  correctOfflineBacklog: true,
  displayRawAndCorrected: false,
  maxOfflineBacklogSeconds: 8 * 3600, // 8h default
  ...overrides,
});

// Device wall-clock string, offsetMin, and "now" together determine skew.
// Helper: build a device string that is `deltaSeconds` away from the given
// real "now" (positive = device ahead/future, negative = device behind).
function deviceStringFor(nowMs, deltaSeconds, offsetMin = 180) {
  const trueInstantMs = nowMs + deltaSeconds * 1000;
  const wallMs = trueInstantMs + offsetMin * 60_000;
  const d = new Date(wallMs);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

const NOW = Date.parse('2026-07-28T10:00:00Z');

describe('decidePunchTime — CORRECT_BY_DRIFT', () => {
  it('trusts a device within tolerance (small skew, either direction)', () => {
    const policy = basePolicy();
    const forward = decidePunchTime(deviceStringFor(NOW, 30), null, policy, null, NOW);
    assert.equal(forward.timeConfidence, 'high');
    assert.equal(forward.corrected, false);

    const behind = decidePunchTime(deviceStringFor(NOW, -60), null, policy, null, NOW);
    assert.equal(behind.timeConfidence, 'high');
    assert.equal(behind.corrected, false);
  });

  it('trusts a plausible offline-backlog reading (a few hours behind)', () => {
    const policy = basePolicy();
    const threeHoursBehind = decidePunchTime(deviceStringFor(NOW, -3 * 3600), null, policy, null, NOW);
    assert.equal(threeHoursBehind.timeConfidence, 'high');
    assert.equal(threeHoursBehind.timeSource, 'device');
  });

  it('REGRESSION: does NOT blindly trust a device implausibly far behind (the actual incident)', () => {
    const policy = basePolicy(); // 8h cap
    const fourteenHoursBehind = decidePunchTime(deviceStringFor(NOW, -14 * 3600), null, policy, null, NOW);
    assert.equal(fourteenHoursBehind.timeConfidence, 'review');
    assert.equal(fourteenHoursBehind.needsResync, true);
    // Device time is preserved (not silently discarded), just not "high" confidence.
    assert.equal(fourteenHoursBehind.corrected, false);
  });

  it('respects a school-configured maxOfflineBacklogSeconds', () => {
    const tightPolicy = basePolicy({ maxOfflineBacklogSeconds: 3600 }); // 1h cap
    const twoHoursBehind = decidePunchTime(deviceStringFor(NOW, -2 * 3600), null, tightPolicy, null, NOW);
    assert.equal(twoHoursBehind.timeConfidence, 'review');

    const loosePolicy = basePolicy({ maxOfflineBacklogSeconds: 24 * 3600 }); // 24h cap
    const stillTrusted = decidePunchTime(deviceStringFor(NOW, -14 * 3600), null, loosePolicy, null, NOW);
    assert.equal(stillTrusted.timeConfidence, 'high');
  });

  it('flags behind-tolerance as review (not high) when correctOfflineBacklog is off, within the cap', () => {
    const policy = basePolicy({ correctOfflineBacklog: false });
    const oneHourBehind = decidePunchTime(deviceStringFor(NOW, -3600), null, policy, null, NOW);
    assert.equal(oneHourBehind.timeConfidence, 'review');
  });

  it('unaffected: an implausibly fast (future) clock still corrects via the learned offset', () => {
    const policy = basePolicy();
    const fiveHoursFastSeconds = 5 * 3600;
    const deviceStr = deviceStringFor(NOW, fiveHoursFastSeconds);
    const result = decidePunchTime(deviceStr, fiveHoursFastSeconds, policy, null, NOW);
    assert.equal(result.timeConfidence, 'corrected');
    assert.equal(result.timeSource, 'server');
    // Recovered instant should land back near the true "now".
    assert.ok(Math.abs(result.punchInstant.getTime() - NOW) < 5000);
  });

  it('unaffected: first faulty (future) punch before an offset is known falls back to server-now', () => {
    const policy = basePolicy();
    const result = decidePunchTime(deviceStringFor(NOW, 5 * 3600), null, policy, null, NOW);
    assert.equal(result.timeConfidence, 'corrected');
    assert.equal(result.punchInstant.getTime(), NOW);
  });
});

describe('measureBatchOffsetSeconds — drift is measured fresh per batch, not memorized once', () => {
  // Reported: CORRECT_BY_DRIFT kept applying a stale ~5h correction even on
  // days the device was only actually 2-3h off — because the correction used
  // `devices.clock_offset_seconds`, a single scalar only refreshed when a
  // resync got queued (itself gated on auto_sync_device_time, off by
  // default). A device's real drift moves (RTC crawl, reset, battery swap);
  // this batch-median measurement is meant to replace that stale scalar with
  // today's own ground truth.
  it('measures the median skew directly from a batch of device timestamps', () => {
    const checkTimes = [0, 1, 2, 3, 4].map((i) => deviceStringFor(NOW, 2 * 3600 + i)); // ~2h ahead
    const measured = measureBatchOffsetSeconds(checkTimes, 180, NOW);
    assert.ok(Math.abs(measured - 2 * 3600) <= 5, `expected ~2h, got ${measured}s`);
  });

  it('is robust to a few noisy outliers via the median', () => {
    const checkTimes = [
      deviceStringFor(NOW, 3 * 3600), deviceStringFor(NOW, 3 * 3600 + 2), deviceStringFor(NOW, 3 * 3600 - 1),
      deviceStringFor(NOW, 3 * 3600 + 1), deviceStringFor(NOW, 30 * 3600), // one wild outlier
    ];
    const measured = measureBatchOffsetSeconds(checkTimes, 180, NOW);
    assert.ok(Math.abs(measured - 3 * 3600) <= 5, `outlier should not skew the median, got ${measured}s`);
  });

  it('refuses to guess from too small a batch (fewer than 3 records)', () => {
    const checkTimes = [deviceStringFor(NOW, 3600), deviceStringFor(NOW, 3600 + 2)];
    assert.equal(measureBatchOffsetSeconds(checkTimes, 180, NOW), null);
  });

  it('ignores unparseable entries and still measures from the rest', () => {
    const checkTimes = ['not-a-date', deviceStringFor(NOW, 3600), deviceStringFor(NOW, 3600 + 1), deviceStringFor(NOW, 3600 - 1), null, undefined];
    const measured = measureBatchOffsetSeconds(checkTimes, 180, NOW);
    assert.ok(Math.abs(measured - 3600) <= 5, `expected ~1h, got ${measured}s`);
  });

  it("today's batch-measured drift (not yesterday's stale stored offset) is what gets applied", () => {
    // Yesterday the device was 5h fast and that offset got persisted. Today
    // it has settled to 2h fast. Correction must reflect TODAY's batch, not
    // the persisted 5h value.
    const staleStoredOffsetSeconds = 5 * 3600;
    const todaysCheckTimes = [0, 1, 2, 3].map((i) => deviceStringFor(NOW, 2 * 3600 + i));
    const todaysMeasured = measureBatchOffsetSeconds(todaysCheckTimes, 180, NOW);
    assert.notEqual(todaysMeasured, staleStoredOffsetSeconds);

    const policy = basePolicy();
    const usingStale = decidePunchTime(deviceStringFor(NOW, 2 * 3600), staleStoredOffsetSeconds, policy, null, NOW);
    const usingFresh = decidePunchTime(deviceStringFor(NOW, 2 * 3600), todaysMeasured, policy, null, NOW);
    // The stale 5h correction overshoots real "now"; the fresh measurement lands on it.
    assert.ok(Math.abs(usingFresh.punchInstant.getTime() - NOW) < 5000);
    assert.ok(Math.abs(usingStale.punchInstant.getTime() - NOW) > 3600 * 2500);
  });
});

describe('decidePunchTime — other policies unaffected by the CORRECT_BY_DRIFT fix', () => {
  it('TRUST_DEVICE_TIME always trusts verbatim, any skew', () => {
    const policy = basePolicy({ policy: 'TRUST_DEVICE_TIME' });
    const result = decidePunchTime(deviceStringFor(NOW, -20 * 3600), null, policy, null, NOW);
    assert.equal(result.timeConfidence, 'high');
    assert.equal(result.needsResync, false);
  });

  it('TRUST_SERVER_RECEIVE_TIME always stamps server-now', () => {
    const policy = basePolicy({ policy: 'TRUST_SERVER_RECEIVE_TIME' });
    const result = decidePunchTime(deviceStringFor(NOW, -20 * 3600), null, policy, null, NOW);
    assert.equal(result.timeSource, 'server');
    assert.equal(result.punchInstant.getTime(), NOW);
  });

  it('MANUAL_REVIEW_IF_DRIFT flags any drift beyond maxDriftSeconds', () => {
    const policy = basePolicy({ policy: 'MANUAL_REVIEW_IF_DRIFT' });
    const result = decidePunchTime(deviceStringFor(NOW, -20 * 3600), null, policy, null, NOW);
    assert.equal(result.timeConfidence, 'review');
  });
});
