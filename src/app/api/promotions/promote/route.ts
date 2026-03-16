import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * Promote Student with Proper Lifecycle Management
 * POST /api/promotions/promote
 * 
 * This endpoint:
 * 1. Closes the old enrollment (marks as 'completed')
 * 2. Creates a new enrollment for the new class/year
 * 3. Records the promotion in the promotions table
 * 4. Updates student promotion tracking fields
 * 5. Preserves all historical results and reports
 */
export async function POST(req: NextRequest) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const body = await req.json();
    const {
      student_id,
      from_class_id,
      to_class_id,
      from_academic_year_id,
      to_academic_year_id,
      stream_id,
      promotion_status = 'promoted',
      criteria_used,
      remarks,
    } = body;

    if (!student_id || !to_class_id) {
      return NextResponse.json({ error: 'student_id and to_class_id are required' }, { status: 400 });
    }

    // Verify student exists 
    const [studentCheck]: any = await conn.execute(
      'SELECT id, admission_no FROM students WHERE id = ? AND school_id = ? AND deleted_at IS NULL',
      [student_id, schoolId]
    );
    if (studentCheck.length === 0) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    await conn.execute('START TRANSACTION');

    try {
      // STEP 1: Close all current active enrollments
      await conn.execute(`
        UPDATE enrollments
        SET status = 'completed',
            end_date = CURDATE(),
            end_reason = ?
        WHERE student_id = ? AND school_id = ? AND status = 'active'
      `, [promotion_status, student_id, schoolId]);

      // STEP 2: Create new enrollment for the target class/year
      const now = Math.floor(Date.now() / 1000);
      const [newEnrollment]: any = await conn.execute(`
        INSERT INTO enrollments
          (school_id, student_id, class_id, stream_id, academic_year_id, status, enrollment_date, created_at)
        VALUES (?, ?, ?, ?, ?, 'active', CURDATE(), ?)
      `, [schoolId, student_id, to_class_id, stream_id || null, to_academic_year_id || null, now]);

      const newEnrollmentId = newEnrollment.insertId;

      // STEP 3: Update student tracking fields
      await conn.execute(`
        UPDATE students SET
          promotion_status = ?,
          last_promoted_at = NOW(),
          previous_class_id = ?,
          previous_year_id = ?,
          current_enrollment_id = ?
        WHERE id = ? AND school_id = ?
      `, [promotion_status, from_class_id || null, from_academic_year_id || null, newEnrollmentId, student_id, schoolId]);

      // STEP 4: Record in promotions table (audit trail)
      try {
        await conn.execute(`
          INSERT INTO promotions
            (school_id, student_id, from_class_id, to_class_id,
             from_academic_year_id, to_academic_year_id,
             promotion_status, criteria_used, remarks)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            to_class_id = VALUES(to_class_id),
            to_academic_year_id = VALUES(to_academic_year_id),
            promotion_status = VALUES(promotion_status),
            criteria_used = VALUES(criteria_used),
            remarks = VALUES(remarks),
            updated_at = NOW()
        `, [
          schoolId, student_id,
          from_class_id || to_class_id, to_class_id,
          from_academic_year_id || null, to_academic_year_id || null,
          promotion_status,
          criteria_used ? JSON.stringify(criteria_used) : null,
          remarks || null,
        ]);
      } catch (promoError) {
        console.warn('Warning: promotions table insert failed:', promoError);
      }

      await conn.execute('COMMIT');

      return NextResponse.json({
        success: true,
        message: `Student ${studentCheck[0].admission_no} promoted successfully`,
        data: {
          student_id,
          enrollment_id: newEnrollmentId,
          from_class_id,
          to_class_id,
          promotion_status,
        }
      });
    } catch (txError) {
      await conn.execute('ROLLBACK');
      throw txError;
    }
  } catch (error) {
    console.error('Error promoting student:', error);
    return NextResponse.json({ error: 'Failed to promote student' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
