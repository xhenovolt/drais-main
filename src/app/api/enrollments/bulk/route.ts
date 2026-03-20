import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { getCurrentTerm } from '@/lib/terms';

/**
 * POST /api/enrollments/bulk
 *
 * Bulk-enroll or bulk-promote students.
 *
 * Body options:
 *
 * A) Bulk promote a class to the next class:
 *   {
 *     mode: "promote",
 *     from_class_id: 5,
 *     to_class_id: 6,
 *     academic_year_id: 3,
 *     term_id: 9,           // optional – defaults to current
 *     student_ids: [1,2,3]  // optional – if omitted, all active students in class
 *   }
 *
 * B) Bulk enroll a list of students:
 *   {
 *     mode: "enroll",
 *     class_id: 6,
 *     stream_id: 2,         // optional
 *     academic_year_id: 3,
 *     term_id: 9,
 *     enrollment_type: "new" | "continuing" | "transfer" | "repeat",
 *     student_ids: [1,2,3]
 *   }
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const schoolId = session.schoolId;

  const body = await req.json();
  const { mode } = body;

  if (mode !== 'promote' && mode !== 'enroll') {
    return NextResponse.json({ error: 'mode must be "promote" or "enroll"' }, { status: 400 });
  }

  const conn = await getConnection();
  try {
    // Resolve term
    let termId: number = body.term_id;
    if (!termId) {
      const current = await getCurrentTerm(schoolId);
      if (!current) return NextResponse.json({ error: 'No active term found' }, { status: 400 });
      termId = current.id;
    }
    const academicYearId: number = body.academic_year_id;
    if (!academicYearId) {
      return NextResponse.json({ error: 'academic_year_id is required' }, { status: 400 });
    }

    await conn.execute('START TRANSACTION');
    try {
      let studentIds: number[] = body.student_ids || [];

      if (mode === 'promote') {
        const { from_class_id, to_class_id } = body;
        if (!from_class_id || !to_class_id) {
          await conn.execute('ROLLBACK');
          return NextResponse.json({ error: 'from_class_id and to_class_id required for promote mode' }, { status: 400 });
        }

        // If no student_ids provided, find all active students in from_class
        if (studentIds.length === 0) {
          const [rows] = await conn.execute<any[]>(
            `SELECT DISTINCT e.student_id
             FROM enrollments e
             WHERE e.school_id = ?
               AND e.class_id = ?
               AND e.status = 'active'
               AND e.deleted_at IS NULL`,
            [schoolId, from_class_id]
          );
          studentIds = rows.map((r: any) => r.student_id);
        }

        if (studentIds.length === 0) {
          await conn.execute('ROLLBACK');
          return NextResponse.json({ success: true, data: { enrolled: 0, message: 'No students found in class' } });
        }

        // Close current active enrollments for these students
        await conn.execute(
          `UPDATE enrollments
           SET status = 'completed', end_date = CURDATE(), end_reason = 'promoted', updated_at = NOW()
           WHERE school_id = ?
             AND student_id IN (${studentIds.map(() => '?').join(',')})
             AND status = 'active'`,
          [schoolId, ...studentIds]
        );

        // Create new enrollments in to_class
        for (const sid of studentIds) {
          await conn.execute(
            `INSERT INTO enrollments
               (school_id, student_id, class_id, academic_year_id, term_id,
                enrollment_type, status, joined_at, enrollment_date, created_at)
             VALUES (?, ?, ?, ?, ?, 'continuing', 'active', CURDATE(), CURDATE(), NOW())
             ON DUPLICATE KEY UPDATE status='active', updated_at=NOW()`,
            [schoolId, sid, to_class_id, academicYearId, termId]
          );
        }

        // Log promotion records
        for (const sid of studentIds) {
          await conn.execute(
            `INSERT INTO promotions
               (school_id, student_id, from_class_id, to_class_id,
                from_academic_year_id, to_academic_year_id,
                promotion_status, approval_status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 'promoted', 'approved', NOW())
             ON DUPLICATE KEY UPDATE promotion_status='promoted', updated_at=NOW()`,
            [schoolId, sid, from_class_id, to_class_id, academicYearId, academicYearId]
          );
        }

        await conn.execute('COMMIT');
        return NextResponse.json({
          success: true,
          data: { enrolled: studentIds.length, mode: 'promote', from_class_id, to_class_id },
        });
      }

      // mode === 'enroll'
      const { class_id, stream_id, enrollment_type = 'new' } = body;
      if (!class_id) {
        await conn.execute('ROLLBACK');
        return NextResponse.json({ error: 'class_id is required for enroll mode' }, { status: 400 });
      }
      if (studentIds.length === 0) {
        await conn.execute('ROLLBACK');
        return NextResponse.json({ error: 'student_ids must not be empty for enroll mode' }, { status: 400 });
      }

      for (const sid of studentIds) {
        await conn.execute(
          `INSERT INTO enrollments
             (school_id, student_id, class_id, stream_id, academic_year_id, term_id,
              enrollment_type, status, joined_at, enrollment_date, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'active', CURDATE(), CURDATE(), NOW())`,
          [schoolId, sid, class_id, stream_id || null, academicYearId, termId, enrollment_type]
        );
      }

      await conn.execute('COMMIT');
      return NextResponse.json({
        success: true,
        data: { enrolled: studentIds.length, mode: 'enroll', class_id },
      });
    } catch (err) {
      await conn.execute('ROLLBACK');
      throw err;
    }
  } catch (err) {
    console.error('[enrollments/bulk] error:', err);
    return NextResponse.json({ error: 'Bulk enrollment failed' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
