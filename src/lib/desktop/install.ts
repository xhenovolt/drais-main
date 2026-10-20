/**
 * @drais/desktop — the actual decrypt-and-install mechanics, factored out
 * of the API route so the boot-time auto-activate path (src/instrumentation.ts)
 * can call it directly, in-process, with no HTTP round-trip — that matters
 * here specifically because it runs before the server is even accepting
 * requests.
 *
 * Safety rules (directive 2026-10, issue 4):
 *   • The incoming database is checked BEFORE anything is replaced: SQLite
 *     integrity, the tables login needs, and exactly one school.
 *   • Replacing an existing database (force) first copies it — main file and
 *     its -wal/-shm, where most recent writes live — into a dated folder
 *     beside it. Nothing is deleted that was not copied first.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface InstallResult {
  installedAt: string;
  /** Folder holding the database this install replaced, when it replaced one. */
  backupDir?: string;
  schoolName?: string | null;
}

export class InstallTargetExistsError extends Error {
  constructor() {
    super('A local database already exists on this machine.');
    this.name = 'InstallTargetExistsError';
  }
}

/** The decrypted .drs payload is not a usable DRAIS school database. */
export class InstallPayloadInvalidError extends Error {
  readonly code = 'DRS_PAYLOAD_INVALID';
  constructor(reason: string) {
    super(`This .drs does not contain a usable DRAIS school database: ${reason}. Nothing was changed on this computer.`);
    this.name = 'InstallPayloadInvalidError';
  }
}

const REQUIRED_TABLES = ['schools', 'users', 'people', 'students'];

/** Opens the file read-only (no schema creation) and checks what login and the school pages rely on. */
function validateSqliteFile(file: string): { schoolName: string | null } {
  let Database: any;
  try { Database = eval('require')('better-sqlite3'); } catch (e) {
    throw new Error(`The SQLite driver could not be loaded in this build (${(e as Error).message}).`);
  }
  let db: any;
  try {
    db = new Database(file, { readonly: true, fileMustExist: true });
  } catch (e) {
    throw new InstallPayloadInvalidError(`it is not a SQLite database (${(e as Error).message})`);
  }
  try {
    let integrity: string;
    try { integrity = String(db.pragma('integrity_check', { simple: true })); } catch (e) {
      throw new InstallPayloadInvalidError(`SQLite could not read it (${(e as Error).message})`);
    }
    if (integrity !== 'ok') throw new InstallPayloadInvalidError(`SQLite integrity check failed (${integrity.slice(0, 200)})`);
    const tables = new Set((db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[]).map((r) => r.name));
    const missing = REQUIRED_TABLES.filter((t) => !tables.has(t));
    if (missing.length) throw new InstallPayloadInvalidError(`required tables are missing (${missing.join(', ')})`);
    const schools = db.prepare(`SELECT name FROM schools WHERE deleted_at IS NULL`).all() as { name: string | null }[];
    if (schools.length !== 1) throw new InstallPayloadInvalidError(`it holds ${schools.length} schools; a local install holds exactly one`);
    return { schoolName: schools[0].name ?? null };
  } finally {
    db.close();
    // A WAL-mode file grows -wal/-shm sidecars even when opened read-only; they are empty here.
    for (const s of [`${file}-wal`, `${file}-shm`]) { try { fs.rmSync(s, { force: true }); } catch { /* best-effort */ } }
  }
}

/** Copy the current database (and its WAL/SHM) aside before it is replaced. */
function backupExisting(target: string): string | undefined {
  const parts = [target, `${target}-wal`, `${target}-shm`].filter((f) => fs.existsSync(f));
  if (!parts.length) return undefined;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(path.dirname(target), 'replaced', `${path.basename(target)}-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of parts) fs.copyFileSync(f, path.join(dir, path.basename(f)));
  return dir;
}

export async function installDrsPayload(payload: Buffer, force: boolean): Promise<InstallResult> {
  const { defaultSqlitePath, resetSqliteDb } = await import('@/lib/repo/sqlite/singleton');
  const target = defaultSqlitePath();

  if (fs.existsSync(target) && !force) {
    throw new InstallTargetExistsError();
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, payload);

  let schoolName: string | null = null;
  try {
    ({ schoolName } = validateSqliteFile(tmp));
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* best-effort cleanup */ }
    throw e;
  }

  // Closing the last connection checkpoints the WAL into the main file, so
  // the backup below is complete even if only the main file is restored.
  resetSqliteDb();
  let backupDir: string | undefined;
  try {
    backupDir = backupExisting(target);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* best-effort cleanup */ }
    throw new Error(`Could not back up the current database before replacing it (${(e as Error).message}). Nothing was changed.`);
  }

  // Windows-specific: closing a better-sqlite3 handle doesn't always
  // release the OS-level file lock on the SAME tick a rename needs it —
  // confirmed live under `next dev`'s multi-process architecture (killing
  // that process freed the file instantly; a real production single-
  // process run never hit this). Kept as cheap insurance regardless.
  // The sidecars were copied into backupDir above.
  for (const sidecar of [`${target}-wal`, `${target}-shm`]) {
    try { fs.rmSync(sidecar, { force: true }); } catch { /* best-effort */ }
  }
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      fs.renameSync(tmp, target);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 150 * attempt));
    }
  }
  if (lastErr) {
    try { fs.unlinkSync(tmp); } catch { /* best-effort cleanup */ }
    throw lastErr;
  }

  const { applyConfig } = await import('@/lib/db/runtime-config');
  await applyConfig({ DRAIS_ALLOW_LOCAL: 'true', DRAIS_DB_MODE: 'local-sqlite', DRAIS_SQLITE_PATH: target });

  return { installedAt: target, backupDir, schoolName };
}
