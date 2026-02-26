import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

/**
 * BULK PROMOTIONS API
 * Endpoint: /api/promotions/bulk
 * Method: POST
 * 
 * Supports two modes:
 * 1. Manual bulk promotion: Pass array of selected student IDs
 * 2. Condition-based: Pass criteria (min marks, average, etc) to auto-select eligible students
 */

export async function POST(req: NextRequest) {
  let connection;
  try {
    const body = await req.json();
    const {
      mode = 'manual',
      school_id = 1,
      academic_year_id,
      from_class_id,
      to_class_id,
      to_academic_year_id,
      student_ids = [],
      criteria,
      promoted_by,
      promotion_reason = 'manual',
      promotion_notes = ''
    } = body;

    if (!academic_year_id || !from_class_id || !to_class_id) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    connection = await getConnection();

    let eligibleStudents: any[] = [];

    if (mode === 'manual' && student_ids.length > 0) {
      // Manual mode: use provided student IDs
      const placeholders = student_ids.map(() => '?').join(',');
      const [students] = await connection.execute(
        `SELECT 
          s.id,
          s.admission_no,
          p.first_name,
          p.last_name,
          c.name as current_class_name,
          c2.name as destination_class_name
        FROM students s
        JOIN persons p ON s.person_id = p.id
        JOIN enrollments e ON s.id = e.student_id
        JOIN classes c ON e.class_id = c.id
        JOIN classes c2 ON c2.id = ?
        WHERE s.id IN (${placeholders})
          AND s.school_id = ?
          AND e.academic_year_id = ?
          AND s.deleted_at IS NULL`,
        [to_class_id, school_id, academic_year_id, ...student_ids]
      );
      eligibleStudents = students as any[];
    } else if (mode === 'condition_based' && criteria) {
      // Condition-based mode: query students meeting criteria
      const {
        minimum_total_marks,
        minimum_average_marks,
        minimum_subjects_passed,
        attendance_percentage = 75
      } = criteria;

      const [students] = await connection.execute(
        `SELECT 
          s.id,
          s.admission_no,
          p.first_name,
          p.last_name,
          c.name as current_class_name,
          c2.name as destination_class_name,
          COALESCE(SUM(r.total_marks), 0) as total_marks,
          COALESCE(AVG(r.total_marks), 0) as average_marks,
          COUNT(DISTINCT CASE WHEN r.grade IS NOT NULL AND r.grade NOT IN ('F', 'U') THEN r.subject_id END) as subjects_passed
        FROM students s
        JOIN persons p ON s.person_id = p.id
        JOIN enrollments e ON s.id = e.student_id
        JOIN classes c ON e.class_id = c.id
        JOIN classes c2 ON c2.id = ?
        LEFT JOIN results r ON s.id = r.student_id 
          AND r.academic_year_id = ?
          AND r.term_id IN (SELECT id FROM terms WHERE academic_year_id = ? AND name = 'Term 3')
        WHERE 
          s.school_id = ?
          AND e.academic_year_id = ?
          AND c.id = ?
          AND s.deleted_at IS NULL
          AND s.status = 'active'
        GROUP BY s.id, p.id, c.id, c2.id
        HAVING 
          (? IS NULL OR SUM(r.total_marks) >= ?)
          AND (? IS NULL OR AVG(r.total_marks) >= ?)
          AND (? IS NULL OR COUNT(DISTINCT CASE WHEN r.grade IS NOT NULL AND r.grade NOT IN ('F', 'U') THEN r.subject_id END) >= ?)`,
        [
          to_class_id,
          academic_year_id,
          academic_year_id,
          school_id,
          academic_year_id,
          from_class_id,
          minimum_total_marks,
          minimum_total_marks,
          minimum_average_marks,
          minimum_average_marks,
          minimum_subjects_passed,
          minimum_subjects_passed
        ]
      );
      eligibleStudents = students as any[];
    } else {
      await connection.end();
      return NextResponse.json(
        { error: 'Invalid mode or missing student_ids/criteria' },
        { status: 400 }
      );
    }

    if (eligibleStudents.length === 0) {
      await connection.end();
      return NextResponse.json({
        success: true,
        message: 'No students eligible for promotion',
        promoted_count: 0,
        failed_count: 0
      });
    }

    // Start transaction
    await connection.execute('START TRANSACTION');

    try {
      const promotedStudents = [];
      const failedStudents = [];

      for (const student of eligibleStudents) {
        try {
          // Insert promotion record
          await connection.execute(
            `INSERT INTO promotions (
              school_id,
              student_id,
              from_class_id,
              to_class_id,
              from_academic_year_id,
              to_academic_year_id,
              promotion_status,
              promotion_reason,
              term_used,
              criteria_used,
              additional_notes,
              promoted_by
            ) VALUES (?, ?, ?, ?, ?, ?, 'promoted', ?, 'Term 3', ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              to_class_id = VALUES(to_class_id),
              promotion_status = 'promoted',
              updated_at = NOW()`,
            [
              school_id,
              student.id,
              from_class_id,
              to_class_id,
              academic_year_id,
              to_academic_year_id,
              promotion_reason,
              criteria ? JSON.stringify(criteria) : null,
              promotion_notes,
              promoted_by
            ]
          );

          // Update student
          await connection.execute(
            `UPDATE students SET 
              previous_class_id = ?,
              previous_year_id = ?,
              promotion_status = 'promoted',
              last_promoted_at = NOW(),
              term_promoted_in = 'Term 3',
              promotion_criteria_used = ?,
              promotion_notes = ?
            WHERE id = ? AND school_id = ?`,
            [
              from_class_id,
              academic_year_id,
              criteria ? JSON.stringify(criteria) : null,
              promotion_notes,
              student.id,
              school_id
            ]
          );

          // Update enrollment
          await connection.execute(
            `UPDATE enrollments SET 
              class_id = ?,
              academic_year_id = ?,
              updated_at = NOW()
            WHERE student_id = ? AND academic_year_id = ?`,
            [to_class_id, to_academic_year_id, student.id, academic_year_id]
          );

          // Log audit
          await connection.execute(
            `INSERT INTO promotion_audit_log (
              school_id,
              student_id,
              action_type,
              from_class_id,
              to_class_id,
              from_academic_year_id,
              to_academic_year_id,
              status_before,
              status_after,
              criteria_applied,
              performed_by,
              reason
            ) VALUES (?, ?, 'promoted', ?, ?, ?, ?, 'pending', 'promoted', ?, ?, ?)`,
            [
              school_id,
              student.id,
              from_class_id,
              to_class_id,
              academic_year_id,
              to_academic_year_id,
              criteria ? JSON.stringify(criteria) : null,
              promoted_by,
              `Bulk ${mode}`
            ]
          );

          promotedStudents.push({
            id: student.id,
            admission_no: student.admission_no,
            name: `${student.first_name} ${student.last_name || ''}`.trim(),
            from_class: student.current_class_name,
            to_class: student.destination_class_name
          });
        } catch (error) {
          console.error(`Error promoting student ${student.id}:`, error);
          failedStudents.push({
            id: student.id,
            admission_no: student.admission_no,
            name: `${student.first_name} ${student.last_name || ''}`.trim(),
            error: (error as any).message
          });
        }
      }

      await connection.execute('COMMIT');
      await connection.end();

      return NextResponse.json({
        success: promotedStudents.length > 0,
        mode,
        message: `Completed: ${promotedStudents.length} promoted, ${failedStudents.length} failed`,
        promoted_count: promotedStudents.length,
        failed_count: failedStudents.length,
        promoted_students: promotedStudents,
        failed_students: failedStudents
      });
    } catch (error) {
      await connection.execute('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error in bulk promotions:', error);
    if (connection) await connection.end();
    return NextResponse.json(
      { 
        success: false,
        error: 'Bulk promotion failed',
        details: (error as any).message 
      },
      { status: 500 }
    );
  }
}
