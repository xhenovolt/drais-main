/**
 * Module server-gate coverage guard (Phase 16b).
 *
 * Opt-out modules must be enforced on the SERVER, not just hidden in the UI.
 * A school that disabled the attendance module should get 403 MODULE_DISABLED
 * from the front-door attendance routes — hiding the nav link is not security.
 *
 * This asserts the core school-facing attendance routes carry the module gate.
 * Internal device/ZK provisioning plumbing is gated in a later pass (16c); this
 * guard locks in the front door so it can't silently regress.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../../../${p}`, import.meta.url), 'utf8');

// Front-door attendance routes a school user's browser calls directly.
const GATED_ATTENDANCE_ROUTES = [
  'src/app/api/attendance/list/route.ts',
  'src/app/api/attendance/history/route.ts',
  'src/app/api/attendance/mark/route.ts',
  'src/app/api/attendance/bulk-mark/route.ts',
  'src/app/api/attendance/summary/route.ts',
  'src/app/api/attendance/stats/route.ts',
  'src/app/api/attendance/students/route.ts',
  'src/app/api/attendance/reports/route.ts',
  'src/app/api/attendance/reports/v2/route.ts',
  'src/app/api/attendance/export/route.ts',
  'src/app/api/attendance/sessions/route.ts',
  'src/app/api/attendance/devices/logs/route.ts',
];

describe('module gate — front-door attendance routes enforce the module server-side', () => {
  for (const p of GATED_ATTENDANCE_ROUTES) {
    it(`${p} gates on the attendance module`, () => {
      const s = read(p);
      assert.match(s, /checkModule\(\s*schoolId\s*,\s*'attendance'\s*\)/,
        'must call checkModule(schoolId, \'attendance\')');
      assert.match(s, /if \(moduleDenied\) return moduleDenied/,
        'must return the 403 MODULE_DISABLED response when disabled');
    });
  }
});
