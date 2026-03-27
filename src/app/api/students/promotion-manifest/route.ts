import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import path from 'path';
import fs from 'fs/promises';

/**
 * GET /api/students/promotion-manifest
 *
 * Returns the Promotion_Manifest_2026.json for the authenticated school.
 * Kept behind authentication — not served from the public folder.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const manifestPath = path.join(process.cwd(), 'Promotion_Manifest_2026.json');
    const raw = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(raw);

    // Sanity: only allow school that owns the manifest to read it
    if (manifest.school_id && manifest.school_id !== session.schoolId) {
      return NextResponse.json({ error: 'Manifest not available for your school' }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: manifest });
  } catch (err) {
    console.error('[promotion-manifest] Failed to read manifest:', err);
    return NextResponse.json({ error: 'Promotion manifest not found on server' }, { status: 404 });
  }
}
