import { NextRequest, NextResponse } from 'next/server';
import { getAllTerms } from '@/lib/terms';
import { getSessionSchoolId } from '@/lib/auth';
import { resolveTermContext } from '@/lib/academic/term-resolver';
import { resolveTimePolicy } from '@/lib/attendance/device-clock';

/**
 * GET /api/terms/current
 * Canonical current-term endpoint. `data.current` is now DATE-DRIVEN via the
 * term resolver (null when today is outside every term), not the old
 * "latest is_active term" which returned a stale past term forever.
 * `data.context` carries effective/upcoming/previous/progress/warnings.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const schoolId = session.schoolId;

  try {
    const policy = await resolveTimePolicy(schoolId);
    const [context, all] = await Promise.all([
      resolveTermContext(schoolId, policy.offsetMinutes),
      getAllTerms(schoolId),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        current: context.effective,   // date-driven; null if no current term
        all,
        context,                      // { effective, upcoming, previous, progress, warnings, ... }
      },
    });
  } catch (err) {
    console.error('[terms/current] error:', err);
    return NextResponse.json({ error: 'Failed to fetch terms' }, { status: 500 });
  }
}
