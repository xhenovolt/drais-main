import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTerm, getAcademicYears, getAllTerms } from '@/lib/terms';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * GET /api/academic/current-term
 * 
 * Returns current academic year and term for the school.
 * Used as default for results, enrollments, and academic reporting.
 * 
 * Response:
 * {
 *   "id": 1001,
 *   "school_id": 6,
 *   "academic_year_id": 501,
 *   "name": "Term 1",
 *   "start_date": "2026-01-15",
 *   "end_date": "2026-03-30",
 *   "status": "active",
 *   "academic_year_name": "2026"
 * }
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const term = await getCurrentTerm(session.schoolId);
    if (!term) {
      return NextResponse.json(
        { error: 'No active term configured' },
        { status: 404 }
      );
    }
    return NextResponse.json(term);
  } catch (error) {
    console.error('Error fetching current term:', error);
    return NextResponse.json(
      { error: 'Failed to fetch current term' },
      { status: 500 }
    );
  }
}
