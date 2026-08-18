/**
 * GET/PUT /api/students/import/v2/settings — school-level import settings.
 * See src/lib/ingestion/settings.ts for the full field-by-field rationale.
 * Read = any authenticated school session. Write requires the same
 * permission as running a bulk import (learners.bulk.import) — whoever
 * can import can configure how imports behave for their own school.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { userCan } from '@/lib/rbac';
import { getImportSettings, setImportSettings, DEFAULT_IMPORT_SETTINGS } from '@/lib/ingestion/settings';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const settings = await getImportSettings(session.schoolId);
  return NextResponse.json({ success: true, settings, defaults: DEFAULT_IMPORT_SETTINGS });
}

export async function PUT(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!session.isSuperAdmin && !(await userCan(session.userId, session.schoolId, 'learners.bulk.import'))) {
    return NextResponse.json({ error: 'You do not have permission to configure import settings' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const settings = await setImportSettings(session.schoolId, body);
  return NextResponse.json({ success: true, settings });
}
