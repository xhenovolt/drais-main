import { NextRequest, NextResponse } from 'next/server';
import { getAcademicYears, getAllTerms } from '@/lib/terms';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * GET /api/academic/years
 * 
 * Returns all academic years and their terms for the school.
 * Used for populating academic year and term dropdown filters.
 * 
 * Response:
 * [
 *   {
 *     id: 501,
 *     school_id: 6,
 *     name: "2026",
 *     start_date: "2026-01-15",
 *     end_date: "2026-12-15",
 *     status: "active",
 *     terms: [
 *       {
 *         id: 1001,
 *         academic_year_id: 501,
 *         name: "Term 1",
 *         start_date: "2026-01-15",
 *         end_date: "2026-03-30"
 *       }
 *     ]
 *   }
 * ]
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const years = await getAcademicYears(session.schoolId);
    const allTerms = await getAllTerms(session.schoolId);

    // Group terms by academic year
    const grouped = years.map((year) => ({
      ...year,
      terms: allTerms.filter((term) => term.academic_year_id === year.id)
    }));

    return NextResponse.json(grouped);
  } catch (error) {
    console.error('Error fetching academic years:', error);
    return NextResponse.json(
      { error: 'Failed to fetch academic years' },
      { status: 500 }
    );
  }
}
