import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { queryTenant } from '@/lib/dbTenant';
import { promoteStudents, getOrderedClasses } from '@/services/promotionService';

/**
 * PROMOTIONS API — Order-Independent Promotion System
 *
 * GET  — fetch students with promotion status + filters
 * POST — promote a single student (delegates to promotionService)
 */

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const schoolId = session.schoolId;

  const academicYearId = req.nextUrl.searchParams.get('academic_year_id');
  const classId = req.nextUrl.searchParams.get('class_id');
  const statusFilter = req.nextUrl.searchParams.get('status');
  const searchQuery = req.nextUrl.searchParams.get('search')?.toLowerCase() || '';

  try {
    let query = `
      SELECT
        s.id,
        s.admission_no,
        s.promotion_status,
        s.last_promoted_at,
        s.previous_class_id,
        s.previous_year_id,
        p.first_name,
        p.last_name,
        p.other_name,
        CONCAT(p.first_name, ' ', COALESCE(p.last_name, '')) AS full_name,
        e.class_id,
        c.name AS class_name,
        c.level AS class_level,
        e.id AS enrollment_id,
        e.enrollment_type,
        e.promoted_from_enrollment_id,
        ay.id AS academic_year_id,
        ay.name AS academic_year_name
      FROM students s
      JOIN people p ON s.person_id = p.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active' AND e.school_id = ?
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
      WHERE
        s.school_id = ?
        AND s.deleted_at IS NULL
        AND s.status = 'active'
    `;
    const params: any[] = [schoolId, schoolId];

    if (academicYearId) {
      query += ' AND e.academic_year_id = ?';
      params.push(academicYearId);
    }
    if (classId) {
      query += ' AND e.class_id = ?';
      params.push(classId);
    }
    if (statusFilter && statusFilter !== 'all') {
      query += ' AND s.promotion_status = ?';
      params.push(statusFilter);
    }
    if (searchQuery) {
      query += ` AND (p.first_name LIKE ? OR p.last_name LIKE ? OR p.other_name LIKE ? OR s.admission_no LIKE ?)`;
      const term = `%${searchQuery}%`;
      params.push(term, term, term, term);
    }

    query += ' ORDER BY COALESCE(c.level, 999), c.name, p.first_name, p.last_name';

    const rows = await queryTenant(query, params, schoolId);

    const stats = {
      total: rows.length,
      promoted: rows.filter((r: any) => r.promotion_status === 'promoted').length,
      not_promoted: rows.filter((r: any) => r.promotion_status === 'not_promoted').length,
      pending: rows.filter((r: any) => r.promotion_status === 'pending').length,
      demoted: rows.filter((r: any) => r.promotion_status === 'demoted').length,
      dropped_out: rows.filter((r: any) => r.promotion_status === 'dropped_out').length,
      completed: rows.filter((r: any) => r.promotion_status === 'completed').length,
    };

    return NextResponse.json({
      success: true,
      data: rows,
      stats,
      filters: { academic_year_id: academicYearId, class_id: classId, status: statusFilter, search: searchQuery },
    });
  } catch (error: any) {
    console.error('[promotions GET] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch students for promotion', details: error.message },
      { status: 500 },
    );
  }
}

/**
 * POST — Promote a single student
 *
 * Uses the promotionService which:
 *   1. Closes old enrollment (status='completed')
 *   2. Creates NEW enrollment with lineage tracking
 *   3. Updates student promotion fields
 *   4. Inserts promotion + audit records
 *   5. All within a transaction
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const schoolId = session.schoolId;

  const body = await req.json();
  const {
    student_id,
    from_class_id,
    to_class_id,
    from_academic_year_id,
    to_academic_year_id,
    promotion_status = 'promoted',
    criteria_used,
    promotion_reason = 'manual',
    promotion_notes = '',
  } = body;

  if (!student_id || !to_class_id) {
    return NextResponse.json(
      { error: 'Missing required fields: student_id, to_class_id' },
      { status: 400 },
    );
  }

  // Handle "not promoted" — just update the student status, don't create enrollments
  if (promotion_status === 'not_promoted') {
    try {
      const { withTenantTransaction } = await import('@/lib/dbTenant');
      await withTenantTransaction(schoolId, async ({ exec }) => {
        await exec(
          `UPDATE students SET promotion_status = 'not_promoted', promotion_notes = ? WHERE id = ? AND school_id = ?`,
          [promotion_notes || 'Marked as not promoted', student_id, schoolId],
        );
      });
      return NextResponse.json({
        success: true,
        message: `Student marked as not promoted`,
        data: { student_id, promotion_status: 'not_promoted' },
      });
    } catch (error: any) {
      return NextResponse.json(
        { error: 'Failed to update status', details: error.message },
        { status: 500 },
      );
    }
  }

  try {
    const result = await promoteStudents(schoolId, {
      studentIds: [student_id],
      fromClassId: from_class_id || to_class_id, // fallback
      toClassId: to_class_id,
      fromAcademicYearId: from_academic_year_id,
      toAcademicYearId: to_academic_year_id || from_academic_year_id,
      promotedBy: session.userId || 1,
      promotionReason: promotion_reason,
      promotionNotes: promotion_notes,
      criteriaUsed: criteria_used,
    });

    if (result.promoted_count > 0) {
      return NextResponse.json({
        success: true,
        message: `Student promoted successfully`,
        data: result.promoted[0],
      });
    } else {
      return NextResponse.json(
        { error: result.failed[0]?.error || 'Promotion failed' },
        { status: 400 },
      );
    }
  } catch (error: any) {
    console.error('[promotions POST] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process promotion', details: error.message },
      { status: 500 },
    );
  }
}
