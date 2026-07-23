// Automatic Attendance Recovery — pure gap → method decisions.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { recommendMethod } from '@/lib/attendance/recovery';

const base = {
  deviceKnown: true, lanIp: '192.168.1.197', isOnline: true,
  minutesSinceLastPunch: 20, minutesSinceLastSeen: 5,
  expectedByNow: 80, gotToday: 78,
  stuckAcquisition: false, stuckQueue: 0, schoolHour: 10,
};
const s = (over = {}) => recommendMethod({ ...base, ...over });

describe('healthy flow', () => {
  it('normal volume → ok / none', () => {
    const v = s();
    assert.equal(v.status, 'ok');
    assert.equal(v.method, 'none');
  });
  it('before 7am → nothing expected', () => {
    assert.equal(s({ schoolHour: 6, gotToday: 0, expectedByNow: 0 }).status, 'ok');
  });
});

describe('severe gaps', () => {
  it('near-zero volume + stale + LAN route → LAN pull', () => {
    const v = s({ gotToday: 2, expectedByNow: 90, minutesSinceLastPunch: 300 });
    assert.equal(v.status, 'gap');
    assert.equal(v.method, 'lan_pull');
  });
  it('near-zero volume + stale + NO LAN route → check device', () => {
    const v = s({ gotToday: 1, expectedByNow: 90, minutesSinceLastPunch: 400, lanIp: null });
    assert.equal(v.status, 'gap');
    assert.equal(v.method, 'check_device');
  });
});

describe('staging + queue', () => {
  it('uncommitted acquisition beats everything → resume', () => {
    const v = s({ stuckAcquisition: true, gotToday: 0, expectedByNow: 90 });
    assert.equal(v.method, 'resume_acquisition');
  });
  it('stuck queue with otherwise-fine flow → retry queue', () => {
    const v = s({ stuckQueue: 12 });
    assert.equal(v.method, 'retry_queue');
    assert.equal(v.status, 'watch');
  });
});

describe('moderate shortfall', () => {
  it('partial volume, device reachable → watch + LAN backfill', () => {
    const v = s({ gotToday: 40, expectedByNow: 90 });
    assert.equal(v.status, 'watch');
    assert.equal(v.method, 'lan_pull');
  });
  it('partial shortfall but no LAN → check device', () => {
    const v = s({ gotToday: 40, expectedByNow: 90, lanIp: null });
    assert.equal(v.method, 'check_device');
  });
});

describe('no learned baseline yet', () => {
  it('expectedByNow 0 with some punches → ok (cannot judge)', () => {
    assert.equal(s({ expectedByNow: 0, gotToday: 12 }).status, 'ok');
  });
});
