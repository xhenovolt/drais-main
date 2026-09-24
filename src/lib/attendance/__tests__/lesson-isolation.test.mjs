// Static guards for lesson attendance (no DB in CI): tenant scoping, gating, and
// that the feature is wired without touching the school-entry pipeline's outputs.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

const ROUTES = [
  ['app/api/attendance/lessons/route.ts', 'view'],
  ['app/api/attendance/lessons/[occurrenceId]/route.ts', 'view'],
  ['app/api/attendance/lessons/settings/route.ts', 'view'],
];

describe('lesson attendance routes', () => {
  for (const [f] of ROUTES) {
    it(`${f} resolves the school from the session and is permission-gated`, () => {
      const src = read(f);
      assert.match(src, /requireLessonAccess\(req, '(view|correct|configure)'\)/);
      assert.doesNotMatch(src, /searchParams\.get\(['"]school/i);
      assert.doesNotMatch(src, /body\??\.school_?[iI]d/);
    });
  }

  it('corrections need the "correct" gate, settings writes need "configure"', () => {
    assert.match(read('app/api/attendance/lessons/[occurrenceId]/route.ts'), /requireLessonAccess\(req, 'correct'\)/);
    assert.match(read('app/api/attendance/lessons/settings/route.ts'), /requireLessonAccess\(req, 'configure'\)/);
  });

  it('teachers cannot open another teacher\'s lesson (404, not 403)', () => {
    const src = read('app/api/attendance/lessons/[occurrenceId]/route.ts');
    assert.match(src, /!s\.seesAll && occ\.teacherId !== s\.staffId/);
  });

  it('gate accepts the coarse codes production roles actually hold, and the admin role', () => {
    const src = read('lib/attendance/lessons/access.ts');
    assert.match(src, /'attendance\.view'/);
    assert.match(src, /'attendance\.manage'/);
    assert.match(src, /roles: \['admin'\]/);
    assert.match(src, /checkModule\(session\.schoolId, 'attendance'\)/);
  });
});

describe('lesson attendance service', () => {
  const src = read('lib/attendance/lessons/service.ts');

  it('every statement touching lesson tables is school-scoped', () => {
    const stmts = src.match(/(?:FROM|INTO|UPDATE)\s+(?:lesson_occurrences|lesson_attendance|device_attendance_scopes|lesson_attendance_settings)[\s\S]*?`/g) ?? [];
    assert.ok(stmts.length >= 10, `found ${stmts.length}`);
    for (const s of stmts) assert.match(s, /school_id/, s.slice(0, 80));
  });

  it('manual corrections are protected from recompute in the upsert', () => {
    assert.match(src, /status = IF\(source = 'manual', status, VALUES\(status\)\)/);
    assert.match(src, /source = IF\(source = 'manual', source, VALUES\(source\)\)/);
  });

  it('occurrences are only refreshed while they hold no attendance rows (history is frozen)', () => {
    assert.match(src, /Number\(ex\.att_rows\) === 0 && localDate >= todayLocal/);
  });

  it('lesson rows never touch school-entry attendance_records or teacher attendance', () => {
    assert.doesNotMatch(src, /(INTO|UPDATE)\s+attendance_records/);
    assert.doesNotMatch(src, /staff_attendance|teacher_attendance/);
  });

  it('feature is off by default and the punch hook is a no-op when disabled', () => {
    assert.match(src, /if \(!policy\.enabled\) return;/);
    assert.match(read('lib/attendance/engine.ts'), /await onRawPunchForLessons\(r\.school_id, r\.person_id, r\.role_type, punchAt\.getTime\(\)\)/);
    assert.match(read('../database/migrations/tidb/052_lesson_attendance.sql'), /enabled TINYINT\(1\) NOT NULL DEFAULT 0/);
  });

  it('the punch hook never throws into the ingest path', () => {
    assert.match(src, /catch \(e: any\) \{\s*console\.warn\('\[lesson-attendance\] punch hook failed:'/);
  });
});
