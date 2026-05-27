/**
 * POST /api/portal/context/school
 * Body: { school_id }
 *
 * Sets the active school context for this parent session. Rejects any school
 * the parent does not have an active link in — the school-switch is itself a
 * gated operation, so the context can never point at an unauthorized tenant.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getParentSession, setActiveSchool } from '@/lib/portal/session';
import { parentHasSchool } from '@/lib/portal/guard';

export async function POST(req: NextRequest) {
  const session = await getParentSession(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const schoolId = Number(body?.school_id);
  if (!schoolId) return NextResponse.json({ error: 'school_id is required' }, { status: 400 });

  const allowed = await parentHasSchool(session.parentAccountId, schoolId);
  if (!allowed) return NextResponse.json({ error: 'You have no active link in that school' }, { status: 403 });

  await setActiveSchool(session.sessionToken, schoolId);
  return NextResponse.json({ success: true, active_school_id: schoolId });
}
