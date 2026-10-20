/**
 * Shared guard for /api/media/*: a signed-in session, optionally a permission.
 * The school is ALWAYS the session's — no media route accepts a school id.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { checkPermission } from '@/lib/rbac';

export type MediaSession = { schoolId: number; userId: number; isSuperAdmin: boolean };

export async function mediaSession(req: NextRequest, permission?: string): Promise<MediaSession | NextResponse> {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const s = { schoolId: Number(session.schoolId), userId: Number(session.userId), isSuperAdmin: Boolean((session as { isSuperAdmin?: boolean }).isSuperAdmin) };
  if (permission) {
    const denied = await checkPermission(s.userId, s.schoolId, permission, s.isSuperAdmin);
    if (denied) return denied;
  }
  return s;
}
