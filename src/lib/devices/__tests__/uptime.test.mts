import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveTransitions, uptimePercent } from '../uptime.ts';

const T = (m: number) => new Date(Date.UTC(2026, 9, 19, 0, 0) + m * 60_000); // minutes after midnight UTC
const C = (...mins: number[]) => mins.map((m) => ({ at: T(m), source: 'heartbeat' }));
const TH = 5 * 60_000;

test('first contact of a never-seen device opens an online period', () => {
  const r = deriveTransitions(null, C(10, 11, 12), T(13), TH);
  assert.deepEqual(r.transitions.map((t) => [t.status, t.at.toISOString()]), [['online', T(10).toISOString()]]);
  assert.equal(r.status, 'online');
});

test('a gap longer than the threshold is an outage: offline at last+threshold, online at next contact', () => {
  const r = deriveTransitions({ status: 'online', lastContact: T(10) }, C(30, 31), T(32), TH);
  assert.deepEqual(r.transitions.map((t) => [t.status, t.at.toISOString()]), [['offline', T(15).toISOString()], ['online', T(30).toISOString()]]);
});

test('gaps within the threshold are not outages', () => {
  const r = deriveTransitions({ status: 'online', lastContact: T(10) }, C(14, 18, 22), T(23), TH);
  assert.equal(r.transitions.length, 0);
});

test('a device silent past the threshold goes offline once, and stays put on re-run (idempotent)', () => {
  const r1 = deriveTransitions({ status: 'online', lastContact: T(10) }, [], T(60), TH);
  assert.deepEqual(r1.transitions.map((t) => t.status), ['offline']);
  const r2 = deriveTransitions({ status: r1.status, lastContact: r1.lastContact }, [], T(120), TH);
  assert.equal(r2.transitions.length, 0);
});

test('contacts already processed are ignored', () => {
  const r = deriveTransitions({ status: 'online', lastContact: T(20) }, C(18, 19, 20), T(21), TH);
  assert.equal(r.transitions.length, 0);
});

test('uptime percent counts only the known part of the window', () => {
  const ev = [{ status: 'online', at: T(0) }, { status: 'offline', at: T(60) }, { status: 'online', at: T(90) }];
  assert.equal(uptimePercent(ev, T(0), T(120)), 75);
  // window opening before the first event: the unknown part is not held against the device
  assert.equal(uptimePercent(ev, T(-600), T(120)), 75);
  // status carried in from before the window
  assert.equal(uptimePercent(ev, T(30), T(60)), 100);
  assert.equal(uptimePercent([], T(0), T(10)), null);
});
