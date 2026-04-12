import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { analyseEligibility, getNextClass, getOrderedClasses } from '@/services/promotionService';

/**
 * GET /api/promotions/eligibility?from_class_id=X&academic_year_id=Y
 *
 * Analyses a class and returns:
 *   - eligible students (from previous class/year, ready for promotion)
 *   - ineligible students (newly enrolled, not eligible)
 *   - already promoted students (skip)
 *   - conflicts (mixed years, duplicate paths, wrong timelines)
 *   - suggested destination class (auto-detected via level or name progression)
 *
 * This is the "brain" — the admin sees exactly who should be promoted
 * and who should NOT, with clear explanations for each.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const schoolId = session.schoolId;
  const fromClassId = req.nextUrl.searchParams.get('from_class_id');
  const academicYearId = req.nextUrl.searchParams.get('academic_year_id');

  if (!fromClassId || !academicYearId) {
    return NextResponse.json(
      { error: 'Missing required parameters: from_class_id, academic_year_id' },
      { status: 400 },
    );
  }

  try {
    const result = await analyseEligibility(
      schoolId,
      parseInt(fromClassId),
      parseInt(academicYearId),
    );

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('[promotions/eligibility] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to analyse eligibility' },
      { status: 500 },
    );
  }
}
