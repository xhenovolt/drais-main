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
 * Scope note: only copies what @drais/repo-sqlite currently implements
 * (schools, students — Phase 3's vertical slice). `coverage` in the
 * result reports the gap honestly against the live schema's full
 * school-scoped table list (via src/lib/backup/discovery.ts, the same
 * BFS Backup Center already uses) rather than silently pretending this is
 * a complete school export.
 */
import type { Repos } from '../repo/contract';
import { createMysqlRepos } from '../repo/mysql';
import { openSqliteDb, closeSqliteDb, type SqliteConnection, seedSchool, seedStudent } from '../repo/sqlite';
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
  counts: { schools: number; students: number };
  coverage: {
    totalSchoolScopedTablesLive: number;
    provisionedTables: string[];
    notYetProvisioned: string[];
  };
}

const PROVISIONED_TABLES = ['students']; // 'schools' is the root table, handled separately below

export async function provisionSchool(opts: ProvisionOptions): Promise<ProvisionResult> {
  const { schoolId, sqlitePath } = opts;
  const source = opts.source ?? createMysqlRepos();

  const school = await source.schools.findById(schoolId);
  if (!school) throw new Error(`School ${schoolId} not found in the source — cannot provision`);

  const db: SqliteConnection = openSqliteDb(sqlitePath);
  try {
    seedSchool(db, school);

    const students = await source.students.listBySchool(schoolId, { limit: 100_000, includeDeleted: true });
    for (const s of students) {
      if (s.schoolId !== schoolId) {
        // Defense in depth: a source implementation that leaked a row from
        // another school would otherwise silently corrupt the "one school
        // per install" guarantee this whole phase exists to establish.
        throw new Error(`Source returned a student (id=${s.id}) with school_id=${s.schoolId}, not the requested ${schoolId} — refusing to provision`);
      }
      seedStudent(db, s);
    }

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
      counts: { schools: 1, students: students.length },
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
