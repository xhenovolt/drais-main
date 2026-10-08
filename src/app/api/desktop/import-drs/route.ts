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
 * Three ways to call it:
 *   1. { bundledSchoolId } — installs one of the schools `npm run
 *      dist:win` bundled into this build (scripts/build/
 *      prepare-drs-bundle.mjs), using its stored passphrase. No rebuild
 *      needed; this is the "Automatic" setup path.
 *   2. { droppedFileName, passphrase } — installs a .drs someone copied
 *      directly onto this machine's disk, in the drop folder next to
 *      wherever the real local database lives (src/lib/desktop/
 *      drs-bundle.ts's dropDir()) — no rebuild, no reinstall, just "put
 *      the file there and refresh". No stored passphrase for these, so
 *      one is required in the request.
 *   3. multipart/form-data: file=<.drs>, passphrase=<text> — installs an
 *      arbitrary .drs the admin picked via a file browser. The
 *      "Customize" path, and also the general-purpose "Import a
 *      different .drs later" feature.
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
import { findBundledSchool, resolveDroppedFile } from '@/lib/desktop/drs-bundle';
import { installDrsPayload, InstallTargetExistsError } from '@/lib/desktop/install';

export const runtime = 'nodejs';

async function installPayload(payload: Buffer, force: boolean) {
  try {
    const result = await installDrsPayload(payload, force);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    if (e instanceof InstallTargetExistsError) {
      return NextResponse.json({
        error: 'A local database already exists on this machine. Pass force to replace it — this discards whatever is currently there.',
        code: 'TARGET_EXISTS',
      }, { status: 409 });
    }
    throw e;
  }
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

      if (body.droppedFileName) {
        const filePath = await resolveDroppedFile(String(body.droppedFileName));
        if (!filePath) return NextResponse.json({ error: 'That file is no longer in the drop folder.' }, { status: 404 });
        const passphrase = String(body.passphrase || '');
        if (!passphrase) return NextResponse.json({ error: 'The .drs passphrase is required' }, { status: 400 });

        const header = await readDrsHeader(filePath);
        if (header.engine !== 'sqlite') {
          return NextResponse.json({ error: `This .drs's engine is '${header.engine}', not 'sqlite'.` }, { status: 400 });
        }
        let payload: Buffer;
        try {
          ({ payload } = await openDrsFile(filePath, passphrase));
        } catch {
          return NextResponse.json({ error: 'Wrong passphrase, or the file is corrupted.' }, { status: 400 });
        }
        return installPayload(payload, body.force === true);
      }

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
