/**
 * GET /api/desktop/drs-bundle — the two ways a local install can have a
 * school ready to set up:
 *   - `schools`  — baked into THIS install at build time (`npm run
 *     dist:win`, scripts/build/prepare-drs-bundle.mjs). Known passphrase,
 *     one-click install.
 *   - `dropped`  — a .drs file someone copied straight onto this machine's
 *     disk, in the drop folder next to wherever the real local database
 *     lives (src/lib/desktop/drs-bundle.ts's dropDir() — no rebuild, no
 *     reinstall, just "put the file there and refresh this page"). No
 *     passphrase is known for these — the setup page asks for it once.
 * Both empty is the normal case for a fresh install with nothing staged
 * yet — never an error.
 *
 * Deliberately unauthenticated: this runs before login even exists (the
 * whole point is setting up the very first local install) and never
 * returns passphrases, only schoolId/schoolName/createdAt/fileName.
 */
import { NextResponse } from 'next/server';
import { listBundledSchools, listDroppedDrsFiles, dropDir } from '@/lib/desktop/drs-bundle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const [dropped, dropFolder] = await Promise.all([listDroppedDrsFiles(), dropDir()]);
  return NextResponse.json({ success: true, schools: listBundledSchools(), dropped, dropFolder });
}
