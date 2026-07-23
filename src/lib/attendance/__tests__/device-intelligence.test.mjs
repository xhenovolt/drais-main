// Device Intelligence — pure reputation scoring.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreDevice, bandOf } from '@/lib/attendance/device-intelligence';

const healthy = {
  known: true, isOnline: true, minutesSinceLastSeen: 4,
  clockAnomalyDays: 0, clockTrackedDays: 20, avgClockConfidence: 98,
  medianIngestLagMin: 2, gapDays30: 0, activeDays30: 22, firmware: 'Ver 6.60',
};
const s = (over = {}) => scoreDevice({ ...healthy, ...over });

describe('bands', () => {
  it('thresholds', () => {
    assert.equal(bandOf(95), 'excellent');
    assert.equal(bandOf(80), 'good');
    assert.equal(bandOf(60), 'fair');
    assert.equal(bandOf(40), 'poor');
  });
});

describe('healthy device', () => {
  it('scores excellent, no recommendation', () => {
    const r = s();
    assert.equal(r.band, 'excellent');
    assert.ok(r.overall >= 90);
    assert.equal(r.recommendation, null);
  });
});

describe('RTC failure', () => {
  it('repeated clock drift → RTC battery advice + poor clock', () => {
    const r = s({ clockAnomalyDays: 6, avgClockConfidence: 20 });
    assert.ok(r.clock.score <= 45);
    assert.match(r.recommendation, /RTC|battery/i);
  });
});

describe('heartbeat', () => {
  it('silent for days → low heartbeat + network advice', () => {
    const r = s({ isOnline: false, minutesSinceLastSeen: 3 * 1440 });
    assert.ok(r.heartbeat.score <= 40);
    assert.match(r.recommendation, /power|network|silent/i);
  });
  it('never checked in → 50', () => {
    assert.equal(s({ minutesSinceLastSeen: null }).heartbeat.score, 50);
  });
});

describe('upload reliability', () => {
  it('gap days tank upload + advice', () => {
    const r = s({ gapDays30: 4, activeDays30: 18 });
    assert.ok(r.upload.score < 70);
  });
  it('heavy store-and-forward lag lowers upload but is not fatal', () => {
    const r = s({ medianIngestLagMin: 600 });
    assert.ok(r.upload.score <= 60);
    assert.ok(r.upload.score >= 40);
  });
  it('minor lag stays high', () => {
    assert.ok(s({ medianIngestLagMin: 8 }).upload.score >= 88);
  });
});

describe('activity', () => {
  it('rarely used → low activity + advice', () => {
    const r = s({ activeDays30: 2, gapDays30: 20, isOnline: true, minutesSinceLastSeen: 4, medianIngestLagMin: 2 });
    assert.ok(r.activity.score <= 40);
  });
});

describe('weakest-link recommendation priority', () => {
  it('clock beats heartbeat when both bad', () => {
    const r = s({ clockAnomalyDays: 5, isOnline: false, minutesSinceLastSeen: 5000 });
    assert.match(r.recommendation, /RTC|battery/i);
  });
});
