// Proactive Attendance Digest — pure composer (Phase D).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAttendanceDigest } from '@/lib/attendance/digest';

const empty = { health: { score: 98, status: 'healthy', topRec: null }, clock: { anomalies: 0 }, gaps: { gaps: 0 }, people: { watch: 0, roster: 0 }, identity: { duplicates: 0, unknowns: 0 }, devices: { needMaint: 0 } };
const d = (over = {}) => buildAttendanceDigest({ ...empty, ...over });

describe('all-clear', () => {
  it('no issues → healthy title, low priority, nothing to act on', () => {
    const r = d();
    assert.equal(r.hasIssues, false);
    assert.equal(r.priority, 'low');
    assert.match(r.title, /healthy/i);
    assert.match(r.message, /Nothing needs action/i);
    assert.equal(r.items.length, 0);
  });
});

describe('alerts escalate priority', () => {
  it('a gap → high priority + recovery route', () => {
    const r = d({ gaps: { gaps: 2 } });
    assert.equal(r.priority, 'high');
    assert.equal(r.hasIssues, true);
    assert.match(r.title, /attention/i);
    assert.ok(r.items.some(i => i.route === '/attendance/recovery' && i.severity === 'alert'));
  });
  it('clock drift → high + time-health route', () => {
    const r = d({ clock: { anomalies: 1 } });
    assert.equal(r.priority, 'high');
    assert.ok(r.items.some(i => i.route === '/attendance/time-health'));
  });
});

describe('watch-level items → normal priority', () => {
  it('identity + device + people but no alerts → normal', () => {
    const r = d({ identity: { duplicates: 3, unknowns: 5 }, devices: { needMaint: 1 }, people: { watch: 4, roster: 10 } });
    assert.equal(r.priority, 'normal');
    assert.ok(r.items.some(i => i.route === '/attendance/identity-intelligence'));
    assert.ok(r.items.some(i => i.route === '/attendance/device-intelligence'));
    assert.ok(r.items.some(i => i.route === '/attendance/profiles'));
  });
  it('combines the identity duplicate+unknown count', () => {
    const r = d({ identity: { duplicates: 2, unknowns: 3 } });
    const it = r.items.find(i => i.route === '/attendance/identity-intelligence');
    assert.match(it.text, /5 identity issues/);
  });
});

describe('roster-only is info (lowest)', () => {
  it('only roster-review → normal? no — info only, still hasIssues', () => {
    const r = d({ people: { watch: 0, roster: 8 } });
    assert.equal(r.hasIssues, true);
    assert.equal(r.priority, 'low'); // info-only, no watch/alert
    assert.ok(r.items.every(i => i.severity === 'info'));
  });
});

describe('message formatting', () => {
  it('lists each item with a bullet + includes health line', () => {
    const r = d({ gaps: { gaps: 1 }, people: { watch: 2 } });
    assert.match(r.message, /Attendance health 98%/);
    assert.match(r.message, /• /);
    assert.equal(r.message.split('•').length - 1, r.items.length);
  });
  it('singular vs plural is correct', () => {
    assert.match(d({ gaps: { gaps: 1 } }).items[0].text, /1 attendance gap —/);
    assert.match(d({ gaps: { gaps: 3 } }).items[0].text, /3 attendance gaps/);
  });
});

describe('missing summary layers degrade safely', () => {
  it('null layers → treated as zero, no crash', () => {
    const r = buildAttendanceDigest({ health: null, clock: null, gaps: null, people: null, identity: null, devices: null });
    assert.equal(r.hasIssues, false);
    assert.equal(typeof r.message, 'string');
  });
});
