import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTerm, getAllTerms } from '@/lib/terms';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * GET /api/terms/current
 * Returns the current term and a list of all terms for the school.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const schoolId = session.schoolId;

  try {
    const [current, all] = await Promise.all([
      getCurrentTerm(schoolId),
      getAllTerms(schoolId),
    ]);

    return NextResponse.json({
      success: true,
      data: { current, all },
    });
  } catch (err) {
    console.error('[terms/current] error:', err);
    return NextResponse.json({ error: 'Failed to fetch terms' }, { status: 500 });
  }
}
