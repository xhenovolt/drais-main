/**
 * Tenant-isolation regression guard for the device surface (P1).
 *
 * These are source-level invariants: the device routes must never ship a query
 * over the shared `devices` table without a per-school scope. A static guard is
 * the cheapest way to make a dropped `school_id` filter fail CI instead of
 * leaking School B's hardware into School A's dashboard (the P0 this closes).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../../../../../../${p}`, import.meta.url), 'utf8');

describe('device tenant isolation — /api/attendance/zk/devices', () => {
  const src = read('src/app/api/attendance/zk/devices/route.ts');

  it('the device list is scoped to the session school', () => {
    assert.match(src, /d\.school_id = \?/, 'main list query must filter by school_id');
    assert.match(src, /\[session\.schoolId\]/, 'and bind session.schoolId (never a literal / param)');
  });

  it('the discovery fallback is school-scoped too', () => {
    assert.match(src, /zk_attendance_logs[\s\S]*?school_id = \?/, 'discovery fallback must filter by school_id');
  });

  it('PUT and DELETE only touch this school\'s devices', () => {
    // Both the existence checks and the UPDATEs carry a school_id predicate.
    const scoped = src.match(/school_id = \?/g) || [];
    assert.ok(scoped.length >= 4, `expected school_id scoping on list+fallback+PUT+DELETE, found ${scoped.length}`);
    assert.ok(!/WHERE id = \?\s*',/.test(src) && !/WHERE id = \? AND deleted_at IS NULL'/.test(src),
      'no id-only device lookup may remain (must include school_id)');
  });
});

describe('retired param-injectable endpoint returns 410', () => {
  it('zk/live is retired (was param-scoped, default school 1)', () => {
    const s = read('src/app/api/attendance/zk/live/route.ts');
    assert.match(s, /status: 410/, 'must return 410 Gone');
    assert.ok(!/from '@\/lib\/db'/.test(s) && !/\bquery\(/.test(s), 'retired endpoint must not query tenant data');
  });
});

describe('restored device endpoints are authenticated + school-scoped', () => {
  for (const p of ['src/app/api/devices/list/route.ts', 'src/app/api/devices/summary/route.ts']) {
    it(`${p} scopes to the session school`, () => {
      const s = read(p);
      assert.match(s, /getSessionSchoolId/, 'must authenticate');
      assert.match(s, /school_id = \?/, 'must filter by school_id');
      assert.match(s, /\[session\.schoolId\]/, 'must bind the session school');
    });
  }
});

describe('suspended/retired devices record no attendance (P2.1)', () => {
  const handler = read('src/app/api/zk-handler/route.ts');
  it('the ingest path gates suspended/retired devices', () => {
    assert.match(handler, /deviceStatus === 'suspended' \|\| deviceStatus === 'retired'/,
      'ATTLOG ingest must skip devices the platform took out of service');
    assert.match(handler, /SKIPPED_DEVICE_OUT_OF_SERVICE/, 'and log the skip for the audit trail');
  });
  it('the heartbeat upsert does not resurrect a suspended/retired device', () => {
    assert.match(handler, /IF\(status IN \('suspended','retired'\), status, 'active'\)/,
      'upsert must preserve a deliberate platform status');
  });
});

describe('device ownership is platform-only (not school level)', () => {
  for (const action of ['release', 'acquire', 'decommission']) {
    it(`${action} is gated to super-admin`, () => {
      const s = read(`src/app/api/admin/devices/[sn]/${action}/route.ts`);
      assert.match(s, /if \(!session\.isSuperAdmin\)/, 'must reject non-super-admin');
      assert.match(s, /Xhenvolt Control/, 'with the platform-only message');
    });
  }
});
