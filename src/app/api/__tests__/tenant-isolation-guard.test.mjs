/**
 * Tenant-isolation CI guard (Phase 16 / E-18).
 *
 * A source-level regression guard: critical tenant routes must resolve the
 * session school AND scope their queries by it. This class of bug (a query that
 * forgets `school_id`) has bitten twice — the device roster and device logs —
 * so we assert the invariant instead of hoping. Catches a dropped scope in CI.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../../../${p}`, import.meta.url), 'utf8');

// Critical tenant API routes that MUST be school-scoped.
const SCOPED_ROUTES = [
  'src/app/api/attendance/history/route.ts',
  'src/app/api/attendance/logs/delete/route.ts',
  'src/app/api/attendance/devices/route.ts',
  'src/app/api/attendance/devices/logs/route.ts',
  'src/app/api/attendance/zk/devices/route.ts',
  'src/app/api/devices/list/route.ts',
  'src/app/api/devices/summary/route.ts',
  'src/app/api/students/route.ts',
  'src/app/api/staff/add/route.ts',
];

describe('tenant isolation — critical routes are school-scoped', () => {
  for (const p of SCOPED_ROUTES) {
    it(`${p} resolves + uses the session school`, () => {
      const s = read(p);
      assert.match(s, /getSessionSchoolId/, 'must resolve the session school');
      assert.match(s, /school_id/, 'must reference school_id in its queries');
      // No route should ship a wide-open `WHERE 1=1` with no school scope in the
      // same clause (the exact shape of the two past leaks).
      assert.ok(!/whereClause = '1=1'/.test(s) || /school_id IN \(SELECT/.test(s),
        'an unscoped 1=1 filter must be scoped by school');
    });
  }
});

describe('device logs are scoped via the device owning school', () => {
  it('attendance/devices/logs filters by dahua_devices school_id', () => {
    const s = read('src/app/api/attendance/devices/logs/route.ts');
    assert.match(s, /dl\.device_id IN \(SELECT id FROM dahua_devices WHERE school_id = \?\)/,
      'device_logs must be scoped to this school\'s devices');
    assert.match(s, /students WHERE school_id = \?/, 'the student-name search must be school-scoped too');
  });
});
