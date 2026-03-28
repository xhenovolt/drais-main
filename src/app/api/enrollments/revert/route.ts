/**
 * PUT /api/enrollments/revert
 *
 * Moves one or more students back to a previous class within the SAME
 * academic year by UPDATing the active enrollment row — never INSERTs
 * a duplicate for the same year.
 *
 * Body:
 * {
 *   student_ids:      number[]   // required
 *   to_class_id:      number     // required — class they are being moved back to
 *   academic_year_id: number     // required
 *   reason?:          string     // optional note stored in end_reason
 * }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function PUT(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let connection;
  try {
    const body = await req.json();
    const { student_ids, to_class_id, academic_year_id, reason } = body;

    if (!Array.isArray(student_ids) || !student_ids.length) {
      return NextResponse.json({ success: false, error: 'student_ids must be a non-empty array' }, { status: 400 });
    }
    if (!to_class_id || !academic_year_id) {
      return NextResponse.json({ success: false, error: 'to_class_id and academic_year_id are required' }, { status: 400 });
    }

    const safeIds: number[] = student_ids.map(Number).filter(n => Number.isInteger(n) && n > 0);
    if (safeIds.length !== student_ids.length) {
      return NextResponse.json({ success: false, error: 'Invalid student_ids' }, { status: 400 });
    }

    connection = await getConnection();
    await connection.beginTransaction();

    const results: any[] = [];

    for (const studentId of safeIds) {
      try {
        // Find the active enrollment for this student + year in this school
        const [rows]: any = await connection.execute(
          `SELECT id, class_id
             FROM enrollments
            WHERE student_id       = ?
              AND school_id        = ?
              AND academic_year_id = ?
              AND status           = 'active'
            LIMIT 1`,
          [studentId, session.schoolId, academic_year_id],
        );

        if (!rows.length) {
          results.push({ student_id: studentId, success: false, error: 'No active enrollment found for this year' });
          continue;
        }

        const enrollmentId  = rows[0].id;
        const fromClassId   = rows[0].class_id;

        await connection.execute(
          `UPDATE enrollments
              SET class_id   = ?,
                  end_reason = ?,
                  updated_at = NOW()
            WHERE id         = ?
              AND school_id  = ?`,
          [to_class_id, reason ?? 'reverted', enrollmentId, session.schoolId],
        );

        await logAudit(connection, {
          user_id:    session.userId,
          action:     'ENROLLMENT_REVERT',
          entity_type:'enrollment',
          target_id:  enrollmentId,
          details:    { student_id: studentId, from_class_id: fromClassId, to_class_id, academic_year_id, reason },
          req,
        });

        results.push({ student_id: studentId, enrollment_id: enrollmentId, from_class_id: fromClassId, to_class_id, success: true });

      } catch (err: any) {
        console.error(`[enrollment/revert] student ${studentId}:`, err);
        results.push({ student_id: studentId, success: false, error: err.message });
      }
    }

    await connection.commit();

    const ok  = results.filter(r =>  r.success).length;
    const bad = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      message: `${ok} reverted, ${bad} failed`,
      results,
      summary: { total: results.length, reverted: ok, failed: bad },
    });

  } catch (error: any) {
    if (connection) await connection.rollback().catch(() => {});
    console.error('[enrollment/revert] error:', error);
    return NextResponse.json({
      success: false,
      error:   'Enrollment revert failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    }, { status: 500 });
  } finally {
    if (connection) await connection.end().catch(() => {});
  }
}
