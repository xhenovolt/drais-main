// Regression tests for THREE bugs, all caught only by testing Phase 4
// against real production data — none was caught by any fixture in this
// repo, since every other test here uses a SQLite-backed fake "source"
// that already returns proper JS strings/numbers/non-null values. Real
// mysql2 results don't:
//   1. DATETIME/TIMESTAMP/DATE columns come back as JS Date objects, and
//      better-sqlite3 throws immediately if a Date is bound as a parameter
//      ("SQLite3 can only bind numbers, strings, bigints, buffers, and
//      null"). Fix: toIso/toIsoDate.
//   2. BIGINT columns (every id, school_id, person_id, village_id in this
//      schema) come back as STRINGS, not numbers — the pool config sets
//      bigNumberStrings:true (src/lib/db/pools.ts, deliberate, untouched).
//      This silently broke provisionSchool's own tenant-isolation guard:
//      `"8002" !== 8002` even though both print identically. Fix:
//      toNum/toNumOrNull.
//   3. A real production `students` row can have `updated_at IS NULL` —
//      not a schema defect this layer invented, a real data-history
//      artifact (a column added after some rows already existed, most
//      likely). The SQLite schema declares updated_at NOT NULL, so the
//      raw null hit that constraint immediately on seed. Fix:
//      toIsoRequired, with an explicit created_at-then-sentinel fallback.
// A full repo-mysql integration test would need a real MySQL connection,
// which this environment doesn't have (see the existing, already-stated
// repo-mysql testing gap in src/lib/repo/__tests__/contract-assertions.mjs)
// — these test the fix functions directly instead.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toIso, toIsoDate, toIsoRequired, toNum, toNumOrNull, UNKNOWN_TIMESTAMP_SENTINEL } from '@/lib/repo/mysql/util';

describe('mysql repo boundary: Date -> string normalization', () => {
  it('toIso converts a Date to a full ISO string', () => {
    const d = new Date('2026-08-19T06:41:51.000Z');
    assert.equal(toIso(d), '2026-08-19T06:41:51.000Z');
  });

  it('toIso passes an already-string value through unchanged', () => {
    assert.equal(toIso('2026-08-19T06:41:51.000Z'), '2026-08-19T06:41:51.000Z');
  });

  it('toIso maps null/undefined to null, never throws', () => {
    assert.equal(toIso(null), null);
    assert.equal(toIso(undefined), null);
  });

  it('toIsoDate extracts just the calendar date from a Date object', () => {
    const d = new Date('2026-08-19T06:41:51.000Z');
    assert.equal(toIsoDate(d), '2026-08-19');
  });

  it('toIsoDate on null stays null, not a stringified "null"', () => {
    assert.equal(toIsoDate(null), null);
  });

  it('the exact failure mode: a raw Date object must never reach better-sqlite3 unconverted', async () => {
    // Simulates what mysql2 actually returns for created_at/updated_at —
    // a Date, not a string — and proves the normalized shape is bindable.
    const { openSqliteDb, closeSqliteDb, seedSchool } = await import('@/lib/repo/sqlite');
    const db = openSqliteDb(':memory:');
    try {
      // What mysql/school-repo.ts's toRecord() must produce — Date inputs
      // already run through toIso()/toIsoDate() before reaching this point.
      const normalized = {
        id: 1, name: 'Regression School', legalName: null, shortCode: null, email: null, phone: null,
        currency: 'UGX', address: null, logoUrl: null, status: 'active',
        createdAt: toIso(new Date()), updatedAt: toIso(new Date()), deletedAt: toIso(null),
      };
      assert.doesNotThrow(() => seedSchool(db, normalized));
    } finally {
      closeSqliteDb(db);
    }
  });
});

describe('mysql repo boundary: BIGINT string -> number normalization', () => {
  it('toNum converts a bigNumberStrings-style string id to a real number', () => {
    assert.equal(toNum('8002'), 8002);
    assert.equal(typeof toNum('8002'), 'number');
  });

  it('toNum passes an already-number value through unchanged', () => {
    assert.equal(toNum(8002), 8002);
  });

  it('toNum throws on a non-numeric value rather than silently producing NaN', () => {
    assert.throws(() => toNum('not-a-number'), /Expected a numeric BIGINT value/);
    assert.throws(() => toNum(undefined), /Expected a numeric BIGINT value/);
  });

  it('toNumOrNull maps null to null without throwing', () => {
    assert.equal(toNumOrNull(null), null);
    assert.equal(toNumOrNull('42'), 42);
  });

  it('the exact failure mode: a string school_id must equal its numeric counterpart after normalization', () => {
    // This is precisely what broke: provisionSchool's tenant-isolation
    // guard does `s.schoolId !== schoolId`. Before the fix, a string
    // "8002" from mysql2 compared against the number 8002 from CLI/route
    // input was ALWAYS unequal, even for the correct school — a false
    // positive that made provisioning of any real (BIGINT-backed) school
    // impossible, not just an edge case.
    const fromMysql2 = '8002';   // bigNumberStrings:true shape
    const fromCallerInput = 8002; // parseInt()'d CLI arg / route body
    assert.notStrictEqual(fromMysql2, fromCallerInput, 'sanity: this is the actual bug — the code uses !==, and these really do differ under it');
    assert.strictEqual(toNum(fromMysql2), fromCallerInput, 'normalized value must compare strictly equal');
  });
});

describe('mysql repo boundary: NULL updated_at/created_at fallback', () => {
  it('toIsoRequired passes a real value through untouched', () => {
    assert.equal(toIsoRequired('2026-08-19T06:41:51.000Z'), '2026-08-19T06:41:51.000Z');
  });

  it('toIsoRequired falls back to the given fallback when the value is null', () => {
    assert.equal(toIsoRequired(null, '2026-01-01T00:00:00.000Z'), '2026-01-01T00:00:00.000Z');
  });

  it('toIsoRequired falls back to the sentinel when both value and fallback are absent', () => {
    assert.equal(toIsoRequired(null), UNKNOWN_TIMESTAMP_SENTINEL);
  });

  it('the exact failure mode: a real production row with updated_at NULL must still seed cleanly', async () => {
    const { openSqliteDb, closeSqliteDb, seedSchool, seedStudent } = await import('@/lib/repo/sqlite');
    const db = openSqliteDb(':memory:');
    try {
      // The FK constraint (students.school_id -> schools.id) requires the
      // parent row to exist first — the same constraint that caught a
      // similar oversight in provision-school.test.mjs's leak simulation.
      seedSchool(db, {
        id: 8002, name: 'Regression School', legalName: null, shortCode: null, email: null, phone: null,
        currency: 'UGX', address: null, logoUrl: null, status: 'active',
        createdAt: toIso(new Date('2020-01-01T00:00:00.000Z')), updatedAt: toIso(new Date('2020-01-01T00:00:00.000Z')), deletedAt: null,
      });

      // Mirrors student-repo.ts's toRecord(): updated_at falls back to
      // created_at when the source row's updated_at is genuinely NULL.
      const createdAt = toIso(new Date('2020-01-01T00:00:00.000Z'));
      const normalized = {
        id: 1, schoolId: 8002, personId: 1, admissionNo: 'REGRESSION-001', villageId: null,
        admissionDate: null, status: 'active', notes: null,
        createdAt,
        updatedAt: toIsoRequired(null, createdAt), // the real row's actual shape: updated_at IS NULL
        deletedAt: null,
      };
      assert.equal(normalized.updatedAt, createdAt, 'updated_at must fall back to created_at, not stay null');
      assert.doesNotThrow(() => seedStudent(db, normalized));
    } finally {
      closeSqliteDb(db);
    }
  });
});
