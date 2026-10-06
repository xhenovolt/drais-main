/**
 * GET /api/desktop/drs-bundle — list schools bundled into THIS install by
 * `npm run dist:win` (scripts/build/prepare-drs-bundle.mjs). Empty array
 * is the normal case for an installer built with nothing bundled, or for
 * `npm run dev` outside Electron — never an error.
 *
 * Deliberately unauthenticated: this runs before login even exists (the
 * whole point is setting up the very first local install) and never
 * returns passphrases, only schoolId/schoolName/createdAt.
 */
import { NextResponse } from 'next/server';
import { listBundledSchools } from '@/lib/desktop/drs-bundle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ success: true, schools: listBundledSchools() });
}
