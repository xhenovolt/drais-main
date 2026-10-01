/**
 * @drais/provisioning — school-scoped export into a local SQLite file.
 *
 * DRAIS V2, roadmap Phase 4 (docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md
 * §25). Replaces the whole-database `db:export:full` transfer flow for
 * anything school-facing (§5.3, §23): that script stays as a gated
 * developer/ops tool; THIS is the only path a local install is ever
 * meant to provision through, and it copies exactly one school.
 *
 * `source` is injectable (defaults to the real @drais/repo-mysql) so this
 * can be tested against a fake/in-memory Repos implementation without a
 * live TiDB connection — see __tests__/provision-school.test.mjs.
 *
 * Phase 7 sub-effort 15 closed a real, pre-existing gap found while
 * building on top of this: PEOPLE WERE NEVER COPIED. Every student (and,
 * before this, every staff member) has a person_id — and every repo-layer
 * read (getOfflineStudent, listOfflineStudents, the staff equivalents)
 * silently SKIPS any row whose person can't be found, treating it as "an
 * orphaned row, deleted independently" rather than erroring. That's the
 * right behavior for a genuinely orphaned row; it is exactly the wrong
 * behavior for every single provisioned student, since this function
 * never wrote their person row at all. A freshly-provisioned local
 * install would have shown ZERO students on /students/offline — not an
 * empty list because there were no students, but because every one of
 * them looked orphaned. Found by reading this file while wiring staff/
 * enrollments provisioning on top of it, not by a failing test (no
 * existing test created a real person first either — fixed there too).
 *
 * Scope note: copies what @drais/repo-sqlite currently implements that's
 * reasonable to provision today — schools, people, students, staff,
 * classes, enrollments. `coverage` in the result reports the gap honestly
 * against the live schema's full school-scoped table list (via
 * src/lib/backup/discovery.ts, the same BFS Backup Center already uses)
 * rather than silently pretending this is a complete school export.
 * Still not provisioned: subjects/terms/academic_years/class_results
 * (repos exist, not yet wired here) and attendance_raw_events/
 * attendance_records (repos exist; attendance ingestion stays online-only
 * by design, so there's a real question of whether provisioning should
 * carry a historical snapshot at all — left for a dedicated sub-effort,
 * not assumed).
 */
import type { Repos } from '../repo/contract';
import { createMysqlRepos } from '../repo/mysql';
import {
  openSqliteDb, closeSqliteDb, type SqliteConnection,
  seedSchool, seedStudent, seedPerson, seedStaff, seedClass, seedEnrollment,
} from '../repo/sqlite';
import { discoverSchoolTables } from '../backup/discovery';

export interface ProvisionOptions {
  schoolId: number;
  sqlitePath: string;
  /** Defaults to a real @drais/repo-mysql instance. Inject a fake Repos
   *  (e.g. one backed by an in-memory repo-sqlite instance) for tests. */
  source?: Repos;
}

export interface ProvisionResult {
  schoolId: number;
  sqlitePath: string;
  counts: { schools: number; students: number; people: number; staff: number; classes: number; enrollments: number };
  coverage: {
    totalSchoolScopedTablesLive: number;
    provisionedTables: string[];
    notYetProvisioned: string[];
  };
}

const PROVISIONED_TABLES = ['people', 'students', 'staff', 'classes', 'enrollments']; // 'schools' is the root table, handled separately below

/** Every provisioned table is tenant-checked the same way: a source that
 *  hands back a row tagged with the wrong school_id is refused outright
 *  rather than silently written — defense in depth against a buggy or
 *  malicious source implementation, not just the schema's own FK/filter. */
function assertOwnedBySchool(schoolId: number, rowSchoolId: number | null, kind: string, id: number | string): void {
  if (rowSchoolId !== schoolId) {
    throw new Error(`Source returned a ${kind} (id=${id}) with school_id=${rowSchoolId}, not the requested ${schoolId} — refusing to provision`);
  }
}

export async function provisionSchool(opts: ProvisionOptions): Promise<ProvisionResult> {
  const { schoolId, sqlitePath } = opts;
  const source = opts.source ?? createMysqlRepos();

  const school = await source.schools.findById(schoolId);
  if (!school) throw new Error(`School ${schoolId} not found in the source — cannot provision`);

  const db: SqliteConnection = openSqliteDb(sqlitePath);
  try {
    seedSchool(db, school);

    // Track which person ids we've already copied — staff and students
    // both reference `people`, and provisioning both should not attempt
    // (and fail on) a duplicate seedPerson call for a person who happens
    // to show up via both paths (rare, but not impossible: a staff member
    // who is also a parent/guardian elsewhere shares no record here, but
    // a defensive de-dup costs nothing and avoids a wasted write).
    const copiedPersonIds = new Set<number>();
    const copyPerson = async (personId: number): Promise<void> => {
      if (copiedPersonIds.has(personId)) return;
      const person = await source.people.findById(personId);
      // A dangling person_id (the referenced person was hard-deleted,
      // or belongs to a different school than expected) is a REAL
      // possible state in production data — skip, don't throw, matching
      // how listOfflineStudents/listOfflineStaff already treat this
      // exact situation as "orphaned, not fatal."
      if (!person) return;
      seedPerson(db, person);
      copiedPersonIds.add(personId);
    };

    const students = await source.students.listBySchool(schoolId, { limit: 100_000, includeDeleted: true });
    for (const s of students) {
      assertOwnedBySchool(schoolId, s.schoolId, 'student', s.id);
      await copyPerson(s.personId);
      seedStudent(db, s);
    }

    const staff = await source.staff.listBySchool(schoolId, { limit: 100_000, includeDeleted: true });
    for (const st of staff) {
      assertOwnedBySchool(schoolId, st.schoolId, 'staff member', st.id);
      await copyPerson(st.personId);
      seedStaff(db, st);
    }

    const classes = await source.classes.listBySchool(schoolId, { limit: 100_000, includeDeleted: true });
    for (const c of classes) {
      // classes.school_id is nullable on the real table (confirmed live,
      // class-repo.ts's own header) — only tenant-check when it's actually
      // set, same reasoning create()/update() already apply to this table.
      if (c.schoolId != null) assertOwnedBySchool(schoolId, c.schoolId, 'class', c.id);
      seedClass(db, c);
    }

    // enrollments.school_id is nullable on the real table too (confirmed
    // live, sub-effort 15) — EnrollmentRepo's own listBySchool already
    // scopes through the student, not that column, so every row returned
    // here is already guaranteed to belong to this school's own students.
    const enrollments = await source.enrollments.listBySchool(schoolId, { limit: 100_000, includeDeleted: true });
    for (const e of enrollments) seedEnrollment(db, e);

    // Honesty check: report the gap between what this phase actually
    // copies and what the live schema considers school-scoped, rather than
    // silently implying this is a complete school export. Best-effort —
    // discoverSchoolTables() needs a reachable DB, which the tests here
    // deliberately don't have; provisioning itself already succeeded above
    // regardless of whether this report can be computed.
    let liveScopedTables: string[] = [];
    try {
      liveScopedTables = (await discoverSchoolTables()).map((t) => t.table);
    } catch { /* coverage report unavailable in this environment; not fatal */ }
    const provisionedSet = new Set(PROVISIONED_TABLES);

    return {
      schoolId,
      sqlitePath,
      counts: {
        schools: 1, students: students.length, people: copiedPersonIds.size,
        staff: staff.length, classes: classes.length, enrollments: enrollments.length,
      },
      coverage: {
        totalSchoolScopedTablesLive: liveScopedTables.length,
        provisionedTables: PROVISIONED_TABLES,
        notYetProvisioned: liveScopedTables.filter((t) => !provisionedSet.has(t)),
      },
    };
  } finally {
    closeSqliteDb(db);
  }
}
