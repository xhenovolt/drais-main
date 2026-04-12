import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { promoteStudents, analyseEligibility } from '@/services/promotionService';

/**
 * BULK PROMOTIONS API — Order-Independent
 *
 * POST /api/promotions/bulk
 *
 * Supports two modes:
 *   1. manual          — promote a specific set of student IDs
 *   2. eligible_only   — auto-select eligible students via the eligibility engine
 *
 * Key behaviour:
 *   • Closes old enrollment (status='completed', end_reason='promoted')
 *   • Creates NEW enrollment in destination class with lineage tracking
 *   • NEVER mutates existing enrollment class_id
 *   • Runs entirely inside a transaction (all-or-nothing)
 *   • Promotion order is irrelevant — P5→P6 and P6→P7 can run in any sequence
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const schoolId = session.schoolId;
  const body = await req.json();
  const {
    mode = 'manual',
    academic_year_id,
    from_class_id,
    to_class_id,
    to_academic_year_id,
    student_ids = [],
    promotion_reason = 'manual',
    promotion_notes = '',
    criteria_used,
  } = body;

  if (!academic_year_id || !from_class_id || !to_class_id) {
    return NextResponse.json(
      { error: 'Missing required fields: academic_year_id, from_class_id, to_class_id' },
      { status: 400 },
    );
  }

  try {
    let idsToPromote: number[] = [];

    if (mode === 'manual') {
      // Manual mode: use provided student IDs
      if (!student_ids || student_ids.length === 0) {
        return NextResponse.json(
          { error: 'No student_ids provided for manual mode' },
          { status: 400 },
        );
      }
      idsToPromote = student_ids.map((id: any) => Number(id));
    } else if (mode === 'eligible_only') {
      // Auto mode: use the eligibility engine to determine who qualifies
      const analysis = await analyseEligibility(schoolId, from_class_id, academic_year_id);
      idsToPromote = analysis.eligible.map(s => s.id);

      if (idsToPromote.length === 0) {
        return NextResponse.json({
          success: true,
          mode,
          message: 'No eligible students found for promotion',
          promoted_count: 0,
          failed_count: 0,
          ineligible_count: analysis.ineligible.length,
          already_promoted_count: analysis.already_promoted.length,
          promoted_students: [],
          failed_students: [],
        });
      }
    } else {
      return NextResponse.json(
        { error: `Invalid mode: ${mode}. Use 'manual' or 'eligible_only'` },
        { status: 400 },
      );
    }

    const result = await promoteStudents(schoolId, {
      studentIds: idsToPromote,
      fromClassId: from_class_id,
      toClassId: to_class_id,
      fromAcademicYearId: academic_year_id,
      toAcademicYearId: to_academic_year_id || academic_year_id,
      promotedBy: session.userId || 1,
      promotionReason: promotion_reason,
      promotionNotes: promotion_notes,
      criteriaUsed: criteria_used,
    });

    return NextResponse.json({
      success: result.success,
      mode,
      message: `Completed: ${result.promoted_count} promoted, ${result.failed_count} failed`,
      promoted_count: result.promoted_count,
      failed_count: result.failed_count,
      promoted_students: result.promoted,
      failed_students: result.failed,
    });
  } catch (error: any) {
    console.error('[promotions/bulk] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Bulk promotion failed', details: error.message },
      { status: 500 },
    );
  }
}
