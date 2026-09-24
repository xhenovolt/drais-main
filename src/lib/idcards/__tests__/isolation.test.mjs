// Static tenant-isolation guard for the ID Card Studio (no DB in CI, matching
// the repo's other isolation guards). Every route must go through the shared
// access gate, and every job/design query must be scoped by school_id (jobs
// also by owner) — so one school can never read another school's upload.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

const ROUTES = [
  'app/api/id-cards/jobs/route.ts',
  'app/api/id-cards/jobs/upload-ticket/route.ts',
  'app/api/id-cards/jobs/[id]/route.ts',
  'app/api/id-cards/jobs/[id]/extract/route.ts',
  'app/api/id-cards/designs/route.ts',
  'app/api/id-cards/designs/[id]/route.ts',
  'app/api/id-cards/assets/route.ts',
];

describe('id-cards routes', () => {
  for (const r of ROUTES) {
    it(`${r} is behind the session + permission gate`, () => {
      const src = read(r);
      assert.match(src, /requireCardsAccess\(req\)/);
      assert.match(src, /isResponse\(s\)/);
      assert.doesNotMatch(src, /searchParams\.get\(['"]school/i, 'never take school id from the client');
      assert.doesNotMatch(src, /body\.schoolId|body\.school_id/, 'never take school id from the body');
    });
  }

  it('access gate resolves the school from the session and checks the permission', () => {
    const src = read('lib/idcards/access.ts');
    assert.match(src, /getSessionSchoolId\(req\)/);
    assert.match(src, /canAny\(s, \[CARDS_PERMISSION\], CARDS_ROLE_FALLBACK\)/);
  });
});

describe('id_card_jobs queries', () => {
  const src = read('lib/idcards/jobs.ts');
  const stmts = src.match(/(SELECT|UPDATE|DELETE)[\s\S]*?(?=`,)/g) ?? [];

  it('every per-job statement filters on job_uuid AND school_id AND created_by', () => {
    const perJob = stmts.filter((s) => /job_uuid = \?/.test(s));
    assert.equal(perJob.length, 5, 'getJob, getJobData, saveMapping, deleteJob (select + delete)');
    for (const s of perJob) {
      assert.match(s, /school_id = \?/, s.slice(0, 80));
      assert.match(s, /created_by = \?/, s.slice(0, 80));
    }
  });

  it('the listing is scoped by school and owner', () => {
    const list = stmts.find((s) => /ORDER BY id DESC/.test(s));
    assert.ok(list);
    assert.match(list, /school_id = \?/);
    assert.match(list, /created_by = \?/);
  });

  it('jobs expire, and expiry/delete destroy the stored workbook before the row', () => {
    assert.match(src, /expires_at > UTC_TIMESTAMP\(\)/);
    assert.match(src, /expires_at < UTC_TIMESTAMP\(\)/);
    assert.ok(src.indexOf('destroyWorkbook(row.storage_ref)') < src.indexOf("DELETE FROM id_card_jobs WHERE id = ?"));
    assert.ok(src.indexOf('await destroyWorkbook(rows[0].storage_ref)') < src.indexOf('DELETE FROM id_card_jobs WHERE job_uuid'));
    assert.doesNotMatch(src, /https?:\/\//i, 'no URL is ever stored or returned');
    assert.doesNotMatch(src, /file_data/, 'workbook bytes are never kept in the database');
  });

  it('job code never touches student, people, enrollment, attendance or notification tables', () => {
    for (const f of ['lib/idcards/jobs.ts', 'lib/idcards/storage.ts', 'lib/idcards/excel.ts', 'app/api/id-cards/jobs/route.ts', 'app/api/id-cards/jobs/upload-ticket/route.ts', 'app/api/id-cards/jobs/[id]/route.ts', 'app/api/id-cards/jobs/[id]/extract/route.ts']) {
      const s = read(f);
      for (const t of ['students', 'people', 'enrollments', 'attendance_records', 'attendance_raw_events', 'notification_outbox', 'student_contacts']) {
        assert.doesNotMatch(s, new RegExp(`(FROM|INTO|UPDATE|JOIN)\\s+${t}\\b`, 'i'), `${f} must not touch ${t}`);
      }
    }
  });
});

describe('id_card_designs queries', () => {
  for (const f of ['app/api/id-cards/designs/route.ts', 'app/api/id-cards/designs/[id]/route.ts']) {
    it(`${f}: every statement is school-scoped`, () => {
      const src = read(f);
      const stmts = src.match(/(SELECT|UPDATE|INSERT INTO)\s+id_card_designs[\s\S]*?`/g) ?? [];
      assert.ok(stmts.length > 0);
      for (const s of stmts) {
        assert.match(s, /school_id/, s.slice(0, 90));
      }
    });
  }
});

describe('asset upload', () => {
  const src = read('app/api/id-cards/assets/route.ts');
  it('namespaces uploads by the session school and never lets the client pick the folder', () => {
    assert.match(src, /drais\/idcards\/\$\{s\.schoolId\}/);
    assert.doesNotMatch(src, /form\.get\(['"]folder['"]\)/);
  });
  it('rejects SVG, and PDF/PSD/Publisher, by signature not extension', () => {
    assert.doesNotMatch(src, /image\/svg|svg\+xml/i);
    assert.match(src, /'8BPS'/);
    assert.match(src, /'%PDF'/);
    assert.match(src, /UNSUPPORTED_FORMAT/);
  });
});
