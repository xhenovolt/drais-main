/**
 * POST /api/desktop/import-drs — the real, packaged-app-reachable
 * counterpart to scripts/db/import-drs.mjs (a dev-only CLI script that
 * imports straight from TypeScript source files never shipped in the
 * installed .exe — it could never actually be run on a customer's
 * machine). This route reuses the exact same decrypt logic
 * (openDrsFile/readDrsHeader) from inside the already-bundled Next
 * server, so it works identically whether Electron is running it or a
 * plain `npm run dev` is.
 *
 * Two ways to call it:
 *   1. { bundledSchoolId } — installs one of the schools `npm run
 *      dist:win` bundled into this build (scripts/build/
 *      prepare-drs-bundle.mjs), using its stored passphrase. The
 *      "Automatic" setup path.
 *   2. multipart/form-data: file=<.drs>, passphrase=<text> — installs an
 *      arbitrary .drs the admin picked. The "Customize" path, and also
 *      the general-purpose "Import a different .drs later" feature.
 *
 * Deliberately unauthenticated, same reasoning as GET /api/desktop/
 * drs-bundle: this is what BOOTSTRAPS a local install, so it runs before
 * any session exists. Gated on isLocalAllowed() — a hosted/serverless
 * deployment can never reach this regardless. Refuses to overwrite an
 * existing non-empty local file without force:true, same safety rule
 * import-drs.mjs already enforces.
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { isLocalAllowed } from '@/lib/db/db-mode';
import { findBundledSchool } from '@/lib/desktop/drs-bundle';

export const runtime = 'nodejs';

async function installPayload(payload: Buffer, force: boolean) {
  const { defaultSqlitePath, resetSqliteDb } = await import('@/lib/repo/sqlite/singleton');
  const target = defaultSqlitePath();

  if (fs.existsSync(target) && !force) {
    return NextResponse.json({
      error: 'A local database already exists on this machine. Pass force to replace it — this discards whatever is currently there.',
      code: 'TARGET_EXISTS',
    }, { status: 409 });
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  resetSqliteDb(); // release any open handle before overwriting the file
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, payload);

  // Windows-specific: closing a better-sqlite3 handle doesn't always
  // release the OS-level file lock on the SAME tick a rename needs it —
  // confirmed live, not assumed: the very first real install-flow test
  // of a SECOND install over an already-open file hit a real EPERM here.
  // WAL/SHM sidecars from the file being replaced can be in the same
  // state, so they're cleared too, best-effort. A short retry absorbs
  // the race; POSIX rename-over-open-file never hits this path at all.
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

  return NextResponse.json({ success: true, installedAt: target });
}

export async function POST(req: NextRequest) {
  if (!isLocalAllowed()) {
    return NextResponse.json({ error: 'Local database setup is disabled on this deployment.' }, { status: 403 });
  }

  const { openDrsFile, readDrsHeader } = await import('@/lib/container/read-drs');
  const contentType = req.headers.get('content-type') || '';

  try {
    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({}));
      const schoolId = Number(body.bundledSchoolId);
      if (!Number.isInteger(schoolId)) {
        return NextResponse.json({ error: 'bundledSchoolId is required' }, { status: 400 });
      }
      const bundled = findBundledSchool(schoolId);
      if (!bundled) return NextResponse.json({ error: 'That school was not bundled with this installer.' }, { status: 404 });

      const header = await readDrsHeader(bundled.filePath);
      if (header.engine !== 'sqlite') {
        return NextResponse.json({ error: `Bundled .drs engine is '${header.engine}', not 'sqlite'.` }, { status: 400 });
      }
      const { payload } = await openDrsFile(bundled.filePath, bundled.passphrase);
      return installPayload(payload, body.force === true);
    }

    // multipart/form-data: an admin-picked .drs + its passphrase.
    const form = await req.formData();
    const file = form.get('file');
    const passphrase = String(form.get('passphrase') || '');
    const force = form.get('force') === 'true';
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'A .drs file is required' }, { status: 400 });
    }
    if (!passphrase) {
      return NextResponse.json({ error: 'The .drs passphrase is required' }, { status: 400 });
    }

    const tmpUpload = path.join(os.tmpdir(), `drais-import-${process.pid}-${Date.now()}.drs`);
    fs.writeFileSync(tmpUpload, Buffer.from(await file.arrayBuffer()));
    try {
      const header = await readDrsHeader(tmpUpload);
      if (header.engine !== 'sqlite') {
        return NextResponse.json({ error: `This .drs's engine is '${header.engine}', not 'sqlite'.` }, { status: 400 });
      }
      let payload: Buffer;
      try {
        ({ payload } = await openDrsFile(tmpUpload, passphrase));
      } catch {
        return NextResponse.json({ error: 'Wrong passphrase, or the file is corrupted.' }, { status: 400 });
      }
      return await installPayload(payload, force);
    } finally {
      fs.unlinkSync(tmpUpload);
    }
  } catch (e: any) {
    console.error('[desktop/import-drs]', e);
    return NextResponse.json({ error: e?.message || 'Import failed' }, { status: 500 });
  }
}
