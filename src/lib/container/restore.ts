/**
 * @drais/container — restore a .drs backup into a fresh local SQLite file.
 *
 * docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md §13 item 1, §25 Phase 6
 * — "the single largest gap" in the whole backup story: every backup
 * mechanism already in this codebase (Backup Center, db:export:full) can
 * PRODUCE a file. None of them can put one back. This is that missing half.
 *
 * Order is deliberate, matching §13's spec exactly:
 *   decrypt/verify the .drs (openDrsFile already does all of this,
 *     including the whole-file checksum and format-version check, and
 *     throws before this module touches anything if any of it fails)
 *   -> write the payload to a FRESH file, never the live target
 *   -> verify the fresh file structurally (SQLite's own integrity_check,
 *     the same tenant-isolation "no other school leaked in" proof Phase 4
 *     established, core-row presence)
 *   -> only THEN atomically swap it into place, preserving the old file
 *     as a sidecar rather than deleting it
 *
 * Nothing about the live target is touched until every prior step has
 * succeeded. A restore that fails at any point must leave the existing
 * install exactly as it was — this has to hold even when what's being
 * restored INTO is itself corrupted (DR Scenario 2: a corrupted local DB,
 * restoring from the last verified .drs).
 *
 * Deliberately self-contained: unlike Phase 4's verifyProvisionedSchool
 * (which compares counts against a live online source), restore
 * verification never requires a connection to anything. A school 30 days
 * offline with a corrupted local file must be able to restore with zero
 * network access — that's DR Scenario 3 and Scenario 2 at the same time.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { openDrsFile } from './read-drs';
import { openSqliteDb, closeSqliteDb, type SqliteConnection } from '../repo/sqlite';

export class RestoreVerificationError extends Error {
  constructor(message: string, public readonly problems: string[]) {
    super(message);
    this.name = 'RestoreVerificationError';
  }
}

export interface RestoreOptions {
  drsPath: string;
  passphrase: string;
  targetSqlitePath: string;
}

export interface RestoreResult {
  targetSqlitePath: string;
  schoolId: number;
  studentCount: number;
  /** Where the previous file at targetSqlitePath was preserved, or null
   *  if none existed (a fresh install being provisioned from a backup,
   *  not a recovery from corruption). The old file is NEVER deleted. */
  preRestoreBackupPath: string | null;
}

const SIDECAR_SUFFIXES = ['', '-wal', '-shm']; // main file, then SQLite's WAL-mode sidecars

async function moveSqliteFileAndSidecars(fromPath: string, toPath: string): Promise<void> {
  // Known limitation, accepted for this phase rather than building full
  // rollback machinery for it: these renames are not one atomic
  // operation. In practice this only matters if a WAL/SHM sidecar exists
  // at restore time, which it normally won't — restore is meant to run
  // with the app (and its open DB connection) stopped, at which point
  // SQLite has already checkpointed WAL into the main file and the
  // sidecars don't exist. Sequential, not parallel, specifically so a
  // failure partway is easier to reason about than a torn Promise.all.
  for (const suffix of SIDECAR_SUFFIXES) {
    const from = fromPath + suffix;
    const to = toPath + suffix;
    try {
      await fs.access(from);
    } catch {
      continue; // sidecar doesn't exist — fine, WAL/SHM are optional
    }
    await fs.rename(from, to);
  }
}

async function verifyRestoredFile(sqlitePath: string, expectedSchoolId: number): Promise<{ studentCount: number }> {
  let db: SqliteConnection;
  try {
    db = openSqliteDb(sqlitePath);
  } catch (err: any) {
    throw new RestoreVerificationError('Restored file will not even open as a SQLite database', [
      err?.message || String(err),
    ]);
  }

  try {
    const problems: string[] = [];

    // SQLite's own corruption detector — the strongest single check
    // available here, catches damage no amount of application-level
    // logic in this repo would ever think to look for.
    const integrity = db.pragma('integrity_check') as Array<{ integrity_check: string }>;
    const integrityOk = integrity.length === 1 && integrity[0].integrity_check === 'ok';
    if (!integrityOk) {
      problems.push(`SQLite integrity_check failed: ${integrity.map((r) => r.integrity_check).join('; ')}`);
    }

    const schoolRows = db.prepare('SELECT id FROM schools').all() as Array<{ id: number }>;
    if (schoolRows.length !== 1) {
      problems.push(`Expected exactly 1 school row in a restored install, found ${schoolRows.length}`);
    } else if (schoolRows[0].id !== expectedSchoolId) {
      problems.push(`Restored school id ${schoolRows[0].id} does not match the .drs header's schoolId ${expectedSchoolId}`);
    }

    // Same unscoped-query tenant-isolation proof as Phase 4's
    // verifyProvisionedSchool — only an unscoped query can reveal a leak;
    // a school-scoped one would just hide it.
    const studentSchoolIds = db.prepare('SELECT DISTINCT school_id FROM students').all() as Array<{ school_id: number }>;
    const leaked = studentSchoolIds.map((r) => r.school_id).filter((id) => id !== expectedSchoolId);
    if (leaked.length > 0) {
      problems.push(`TENANT ISOLATION VIOLATION: restored file contains student rows for school_id(s) [${leaked.join(', ')}] in addition to ${expectedSchoolId}`);
    }

    if (problems.length > 0) {
      throw new RestoreVerificationError(
        'Restored file failed verification — the .drs backup itself decrypted fine, but the resulting database is not trustworthy',
        problems,
      );
    }

    const studentCount = (db.prepare('SELECT COUNT(*) AS n FROM students WHERE school_id = ?').get(expectedSchoolId) as { n: number }).n;
    return { studentCount };
  } finally {
    closeSqliteDb(db);
  }
}

export async function restoreFromDrs(opts: RestoreOptions): Promise<RestoreResult> {
  // Step 1: fully decrypt + verify the .drs. Throws (DrsFormatError /
  // DrsIntegrityError / DrsDecryptError / DrsVersionError) before this
  // function has touched the filesystem at all if anything about the
  // backup file itself is wrong.
  const { header, payload } = await openDrsFile(opts.drsPath, opts.passphrase);

  if (header.engine !== 'sqlite') {
    throw new RestoreVerificationError(
      `This .drs file's payload is for engine "${header.engine}", not sqlite — cannot restore it into a local SQLite install`,
      [],
    );
  }

  // Step 2: write to a FRESH file. The live target has not been touched
  // yet and will not be until every check below passes.
  await fs.mkdir(path.dirname(opts.targetSqlitePath), { recursive: true });
  const stagingPath = `${opts.targetSqlitePath}.restoring-${process.pid}-${Date.now()}`;
  await fs.writeFile(stagingPath, payload);

  // Step 3: verify the fresh file structurally. Any failure deletes the
  // staging file and rethrows — the live target is still untouched.
  let studentCount: number;
  try {
    ({ studentCount } = await verifyRestoredFile(stagingPath, header.schoolId));
  } catch (err) {
    await fs.rm(stagingPath, { force: true }).catch(() => undefined);
    throw err;
  }

  // Step 4: only now, holding a verified-good file, touch the live
  // target — preserve it (never delete) if one already exists. The
  // existence check and the move are deliberately NOT in the same
  // try/catch: if a target file exists but the move itself fails (e.g. a
  // permission error), that must propagate as a real error, not be
  // swallowed as "no existing file, nothing to preserve" — conflating
  // those two would risk silently proceeding to overwrite a live file
  // this function was never able to actually back up.
  let targetExists = true;
  try {
    await fs.access(opts.targetSqlitePath);
  } catch {
    targetExists = false;
  }

  let preRestoreBackupPath: string | null = null;
  if (targetExists) {
    preRestoreBackupPath = `${opts.targetSqlitePath}.pre-restore-${Date.now()}`;
    await moveSqliteFileAndSidecars(opts.targetSqlitePath, preRestoreBackupPath);
  }

  await fs.rename(stagingPath, opts.targetSqlitePath);

  return {
    targetSqlitePath: opts.targetSqlitePath,
    schoolId: header.schoolId,
    studentCount,
    preRestoreBackupPath,
  };
}
