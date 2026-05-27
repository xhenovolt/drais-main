/**
 * POST /api/admin/search/reindex   body: { type?: SearchEntityType }
 *
 * Rebuilds the search projection for the caller's school. Any admin with
 * settings.manage can refresh; super-admin always allowed. Run after bulk
 * imports, or wire to a daily cron as a backstop.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { reindexSchool } from '@/lib/search/indexer';
import type { SearchEntityType } from '@/lib/search/entities';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'settings.manage', session.isSuperAdmin);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const type = body?.type as SearchEntityType | undefined;

  const counts = await reindexSchool(session.schoolId, type);
  return NextResponse.json({ success: true, school_id: session.schoolId, indexed: counts });
}
