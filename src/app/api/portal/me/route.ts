/**
 * GET /api/portal/me
 * Returns the authenticated parent, their schools, and the active school
 * context. Drives the portal shell + school picker.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getParentSession } from '@/lib/portal/session';
import { parentSchools } from '@/lib/portal/guard';

export async function GET(req: NextRequest) {
  const session = await getParentSession(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const schools = await parentSchools(session.parentAccountId);
  return NextResponse.json({
    success: true,
    parent: {
      id:       session.parentAccountId,
      phone:    session.phone,
      fullName: session.fullName,
    },
    schools,
    active_school_id: session.activeSchoolId,
    needs_school_pick: session.activeSchoolId == null && schools.length > 1,
    needs_link: schools.length === 0,
  });
}
