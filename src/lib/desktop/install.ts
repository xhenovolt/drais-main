/**
 * @drais/desktop — the actual decrypt-and-install mechanics, factored out
 * of the API route so the boot-time auto-activate path (src/instrumentation.ts)
 * can call it directly, in-process, with no HTTP round-trip — that matters
 * here specifically because it runs before the server is even accepting
 * requests.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface InstallResult {
  installedAt: string;
}

export class InstallTargetExistsError extends Error {
  constructor() {
    super('A local database already exists on this machine.');
    this.name = 'InstallTargetExistsError';
  }
}

export async function installDrsPayload(payload: Buffer, force: boolean): Promise<InstallResult> {
  const { defaultSqlitePath, resetSqliteDb } = await import('@/lib/repo/sqlite/singleton');
  const target = defaultSqlitePath();

  if (fs.existsSync(target) && !force) {
    throw new InstallTargetExistsError();
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  resetSqliteDb(); // release any open handle before overwriting the file
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, payload);

  // Windows-specific: closing a better-sqlite3 handle doesn't always
  // release the OS-level file lock on the SAME tick a rename needs it —
  // confirmed live under `next dev`'s multi-process architecture (killing
  // that process freed the file instantly; a real production single-
  // process run never hit this). Kept as cheap insurance regardless.
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

  return { installedAt: target };
}
