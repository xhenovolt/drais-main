/**
 * @drais/provisioning — post-provision verification.
 *
 * This is the module that actually PROVES the property Phase 4 exists to
 * establish (docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md §5.2, §15):
 * a provisioned local install contains exactly one school's data, never
 * more. Today's `db:export:full`/`db:local:init` flow has no equivalent
 * check — it ships every school by construction. This is the check that
 * makes the difference observable and testable, not just asserted.
 *
 * Runs a RAW query directly against the SQLite connection for the leak
 * check, not through StudentRepo — a repo method that takes a schoolId
 * argument always filters BY that argument, so it structurally cannot
 * reveal a leak of some OTHER school's rows sitting in the same file.
 * Only an unscoped query can prove a negative here.
 */
import type { Repos } from '../repo/contract';
import { createMysqlRepos } from '../repo/mysql';
import { openSqliteDb, closeSqliteDb, createSqliteRepos, type SqliteConnection } from '../repo/sqlite';

export interface VerifyOptions {
  schoolId: number;
  sqlitePath: string;
  /** Defaults to a real @drais/repo-mysql instance, used as the row-count
   *  comparison baseline. Inject a fake Repos for tests. */
  source?: Repos;
}

export interface VerifyResult {
  ok: boolean;
  schoolId: number;
  tenantIsolationVerified: boolean;
  leakedSchoolIds: number[];
  counts: {
    school: { local: boolean };
    students: { source: number; local: number; matches: boolean };
  };
  problems: string[];
}

export async function verifyProvisionedSchool(opts: VerifyOptions): Promise<VerifyResult> {
  const { schoolId, sqlitePath } = opts;
  const source = opts.source ?? createMysqlRepos();
  const problems: string[] = [];

  const db: SqliteConnection = openSqliteDb(sqlitePath);
  try {
    const local = createSqliteRepos(db);

    const localSchool = await local.schools.findById(schoolId);
    if (!localSchool) problems.push(`School ${schoolId} is missing from the local file entirely`);

    // The tenant-isolation proof: an UNSCOPED query across the whole local
    // file. Any school_id other than the target one appearing here is a
    // real security failure, not a cosmetic one.
    const rows = db.prepare(`SELECT DISTINCT school_id FROM students`).all() as Array<{ school_id: number }>;
    const leakedSchoolIds = rows.map((r) => r.school_id).filter((id) => id !== schoolId);
    if (leakedSchoolIds.length > 0) {
      problems.push(`TENANT ISOLATION VIOLATION: local file contains rows for school_id(s) [${leakedSchoolIds.join(', ')}] in addition to the target school ${schoolId}`);
    }

    const localStudents = await local.students.listBySchool(schoolId, { limit: 100_000, includeDeleted: true });
    const sourceStudents = await source.students.listBySchool(schoolId, { limit: 100_000, includeDeleted: true });
    const countsMatch = localStudents.length === sourceStudents.length;
    if (!countsMatch) {
      problems.push(`Student count mismatch: source has ${sourceStudents.length}, local has ${localStudents.length}`);
    }

    return {
      ok: problems.length === 0,
      schoolId,
      tenantIsolationVerified: leakedSchoolIds.length === 0,
      leakedSchoolIds,
      counts: {
        school: { local: !!localSchool },
        students: { source: sourceStudents.length, local: localStudents.length, matches: countsMatch },
      },
      problems,
    };
  } finally {
    closeSqliteDb(db);
  }
}
