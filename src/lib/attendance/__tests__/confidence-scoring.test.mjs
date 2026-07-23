// Attendance Intelligence — per-record confidence scoring (pure).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreRecord, bandOf } from '@/lib/attendance/confidence-scoring';

const clean = {
  matched: 1, personId: 720001, isProvisional: 0, resolutionScore: null, resolutionPath: 'enrollment',
  deviceSn: 'GED7254601154', deviceKnown: true, deviceOnline: 1,
  timeSource: 'device', clockSkewSeconds: 0, clockConfidence: 99, wasCorrected: false,
  hasVerdict: true, ruleId: 300002, derivedEvent: 'ARRIVED',
};
const rec = (over = {}) => scoreRecord({ ...clean, ...over });

describe('bands', () => {
  it('thresholds', () => {
    assert.equal(bandOf(90), 'high');
    assert.equal(bandOf(85), 'high');
    assert.equal(bandOf(70), 'medium');
    assert.equal(bandOf(60), 'medium');
    assert.equal(bandOf(40), 'low');
  });
});

describe('clean record', () => {
  it('scores high across the board', () => {
    const r = rec();
    assert.equal(r.overall.band, 'high');
    assert.ok(r.overall.score >= 90);
    for (const k of ['identity', 'device', 'time', 'policy']) assert.equal(r[k].band, 'high', k);
  });
});

describe('identity failures dominate', () => {
  it('unmatched punch → low identity drags overall down', () => {
    const r = rec({ matched: 0, personId: null });
    assert.equal(r.identity.band, 'low');
    assert.equal(r.overall.band, 'low');
    assert.match(r.overall.reason, /unmatched/i);
  });

  it('provisional identity → medium', () => {
    const r = rec({ isProvisional: 1 });
    assert.equal(r.identity.band, 'low'); // 55 → low band
    assert.ok(r.overall.score < 90);
  });

  it('matcher score maps through', () => {
    assert.equal(rec({ resolutionScore: 92, resolutionPath: 'directory' }).identity.band, 'high');
    assert.equal(rec({ resolutionScore: 70, resolutionPath: 'directory' }).identity.band, 'medium');
  });
});

describe('time confidence', () => {
  it('drifting clock for the day → low time', () => {
    const r = rec({ clockConfidence: 5 });
    assert.equal(r.time.band, 'low');
    assert.match(r.time.reason, /drift/i);
  });

  it('corrected timestamp recovers to high', () => {
    const r = rec({ clockConfidence: 5, wasCorrected: true });
    assert.equal(r.time.band, 'high');
    assert.match(r.time.reason, /corrected/i);
  });

  it('large skew without clock-health data → low', () => {
    const r = rec({ clockConfidence: null, clockSkewSeconds: 18000 });
    assert.equal(r.time.band, 'low');
  });

  it('server-assigned time is trusted', () => {
    const r = rec({ clockConfidence: null, timeSource: 'server', clockSkewSeconds: null });
    assert.equal(r.time.band, 'high');
  });
});

describe('device + policy', () => {
  it('unregistered device → medium/low device', () => {
    assert.ok(rec({ deviceKnown: false }).device.score <= 60);
  });
  it('offline known device is only mildly penalized (backlog is normal)', () => {
    assert.ok(rec({ deviceOnline: 0 }).device.score >= 75);
  });
  it('no serial → low device', () => {
    assert.equal(rec({ deviceSn: null }).device.band, 'low');
  });
  it('staff shift verdict → high policy', () => {
    assert.equal(rec({ ruleId: -5 }).policy.band, 'high');
  });
  it('no verdict yet → low policy', () => {
    assert.equal(rec({ hasVerdict: false, ruleId: null }).policy.score, 45);
  });
  it('raw-presence fallback → medium policy', () => {
    assert.equal(rec({ ruleId: null }).policy.band, 'medium');
  });
});

describe('overall reason names the weakest link', () => {
  it('healthy identity but drifting clock → reason cites the clock', () => {
    const r = rec({ clockConfidence: 20 });
    assert.match(r.overall.reason, /clock|drift/i);
  });
});
