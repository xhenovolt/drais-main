import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
/**
 * PROMOTIONS API - Enhanced to show ALL learners by default
 * GET - Fetch students with optional filters
 * Support for academic year OPTIONAL, status filtering, search
 */

export async function GET(req: NextRequest) {
  let connection;
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const academicYearId = req.nextUrl.searchParams.get('academic_year_id'); // Now OPTIONAL
    const classId = req.nextUrl.searchParams.get('class_id');
    const statusFilter = req.nextUrl.searchParams.get('status'); // promoted|not_promoted|demoted|dropped_out|completed|pending|all
    const searchQuery = req.nextUrl.searchParams.get('search')?.toLowerCase() || '';

    connection = await getConnection();

    // Build base query - Show ALL learners regardless of academic year (simplified like students/full)
    let query = `
      SELECT
        s.id,
        s.admission_no,
        s.person_id,
        s.promotion_status,
        s.last_promoted_at,
        s.previous_class_id,
        s.previous_year_id,
        p.first_name,
        p.last_name,
        p.other_name,
        CONCAT(p.first_name, ' ', COALESCE(p.last_name, '')) as full_name,
        COALESCE(e.class_id, s.class_id) as class_id,
        COALESCE(c.name, (SELECT name FROM classes WHERE id = s.class_id)) as class_name,
        ay.id as academic_year_id,
        ay.name as academic_year_name
      FROM students s
      JOIN people p ON s.person_id = p.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN classes c ON COALESCE(e.class_id, s.class_id) = c.id
      LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
      WHERE 
        s.school_id = ? 
        AND s.deleted_at IS NULL 
        AND s.status = 'active'
    `;

    const params: any[] = [schoolId];

    // Add academic year filter (OPTIONAL - only if provided)
    if (academicYearId) {
      query += ` AND e.academic_year_id = ?`;
      params.push(academicYearId);
    }

    // Add class filter
    if (classId) {
      query += ` AND c.id = ?`;
      params.push(classId);
    }

    // Add status filter
    if (statusFilter && statusFilter !== 'all') {
      query += ` AND s.promotion_status = ?`;
      params.push(statusFilter);
    }

    // Add search filter (name or admission number)
    if (searchQuery) {
      query += ` AND (
        p.first_name LIKE ? 
        OR p.last_name LIKE ? 
        OR p.other_name LIKE ? 
        OR s.admission_no LIKE ?
      )`;
      const searchTerm = `%${searchQuery}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    query += ` ORDER BY p.first_name ASC, p.last_name ASC`;

    const [rows] = await connection.execute(query, params);

    // Calculate statistics
    const stats = {
      total: (rows as any[]).length,
      promoted: (rows as any[]).filter(r => r.promotion_status === 'promoted').length,
      not_promoted: (rows as any[]).filter(r => r.promotion_status === 'not_promoted').length,
      demoted: (rows as any[]).filter(r => r.promotion_status === 'demoted').length,
      dropped_out: (rows as any[]).filter(r => r.promotion_status === 'dropped_out').length,
      completed: (rows as any[]).filter(r => r.promotion_status === 'completed').length,
      pending: (rows as any[]).filter(r => r.promotion_status === 'pending').length
    };

    await connection.end();

    return NextResponse.json({
      success: true,
      data: rows,
      stats,
      filters: {
        academic_year_id: academicYearId,
        class_id: classId,
        status: statusFilter,
        search: searchQuery
      }
    });
  } catch (error) {
    console.error('Error fetching students for promotion:', error);
    if (connection) await connection.end();
    return NextResponse.json(
      { error: 'Failed to fetch students for promotion', details: (error as any).message },
      { status: 500 }
    );
  }
}

/**
 * POST - Promote a student to a new class
 * 
 * CRITICAL LOGIC:
 * 1. Update students.class_id (PRIMARY - MUST succeed)
 * 2. Update enrollments.class_id (SECONDARY - MUST succeed)
 * 3. Update students promotion tracking fields
 * 4. Insert into promotions table (AUDIT - can fail without affecting UI)
 * 5. Insert into promotion_audit_log (AUDIT - can fail without affecting UI)
 * 
 * If steps 1-3 succeed, UI shows "Promoted Successfully"
 * Steps 4-5 failing only logs warnings, doesn't stop the success
 */
export async function POST(req: NextRequest) {
  let connection;
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const body = await req.json();
    const { student_id,
      from_class_id,
      to_class_id,
      from_academic_year_id = null,
      to_academic_year_id = null,
      promotion_status = 'promoted',
      criteria_used,
      promotion_reason = 'manual',
      term_used = 'Term 3',
      promotion_notes = '',
      user_id,
      user_ip = null } = body;

    // Validate required fields
    if (!student_id || !to_class_id) {
      return NextResponse.json(
        { error: 'Missing required fields: student_id, to_class_id' },
        { status: 400 }
      );
    }

    // from_class_id can be null for new class assignments (students without current class)
    // but to_class_id is required

    if (!['promoted', 'not_promoted', 'demoted', 'dropped_out', 'completed', 'pending'].includes(promotion_status)) {
      return NextResponse.json(
        { error: 'Invalid promotion_status' },
        { status: 400 }
      );
    }

    connection = await getConnection();

    // Verify student exists
    const [studentCheck] = await connection.execute(
      'SELECT id, admission_no FROM students WHERE id = ? AND school_id = ?',
      [student_id, schoolId]
    );

    if ((studentCheck as any[]).length === 0) {
      await connection.end();
      return NextResponse.json(
        { error: 'Student not found' },
        { status: 404 }
      );
    }

    const studentAdmissionNo = (studentCheck as any[])[0].admission_no;

    // ============================================================================
    // CRITICAL SECTION: Class Update (MUST succeed for promotion to be valid)
    // ============================================================================
    try {
      // STEP 1: Update students.class_id (PRIMARY reference for student's class)
      // This is the main point of promotion - move student to new class
      await connection.execute(
        `UPDATE students SET 
          class_id = ?,
          promotion_status = ?,
          last_promoted_at = NOW(),
          previous_class_id = ?,
          previous_year_id = ?
        WHERE id = ? AND school_id = ?`,
        [
          to_class_id,
          promotion_status,
          from_class_id || null, // Ensure null if from_class_id is undefined or null
          from_academic_year_id || null, // Ensure null is passed, not empty string
          student_id,
          schoolId
        ]
      );

      // STEP 2: Update ALL active enrollments for this student to the new class
      // CRITICAL: Update enrollments regardless of academic_year_id to keep enrollments in sync
      // This ensures the GET query shows the correct class for the student
      await connection.execute(
        `UPDATE enrollments SET 
          class_id = ?
        WHERE student_id = ? AND status = 'active'`,
        [to_class_id, student_id]
      );

      // ============================================================================
      // SECONDARY SECTION: Audit & History (can fail without affecting core promotion)
      // ============================================================================
      try {
        // Get previous promotion status for audit
        const [prevStatus] = await connection.execute(
          'SELECT promotion_status FROM students WHERE id = ?',
          [student_id]
        );
        const previousStatus = (prevStatus as any[])[0]?.promotion_status || 'pending';

        // STEP 3: Insert into promotions table (history record)
        // This is for tracking promotion history - can fail
        try {
          const [existingPromo] = await connection.execute(
            `SELECT id FROM promotions 
             WHERE school_id = ? AND student_id = ? AND (from_academic_year_id <=> ?)`,
            [schoolId, student_id, from_academic_year_id]
          );

          if ((existingPromo as any[]).length > 0) {
            // Update existing
            await connection.execute(
              `UPDATE promotions SET 
                to_class_id = ?,
                to_academic_year_id = ?,
                promotion_status = ?,
                criteria_used = ?,
                promotion_reason = ?,
                term_used = ?,
                additional_notes = ?,
                updated_at = NOW()
              WHERE school_id = ? AND student_id = ? AND (from_academic_year_id <=> ?)`,
              [
                to_class_id,
                to_academic_year_id,
                promotion_status,
                criteria_used ? JSON.stringify(criteria_used) : null,
                promotion_reason,
                term_used,
                promotion_notes,
                schoolId,
                student_id,
                from_academic_year_id
              ]
            );
          } else {
            // Insert new - build dynamic query based on available fields
            const insertCols = [
              'school_id',
              'student_id',
              'to_class_id',
              'promotion_status',
              'promotion_reason',
              'term_used'
            ];
            const insertVals = [
              schoolId,
              student_id,
              to_class_id,
              promotion_status,
              promotion_reason,
              term_used
            ];

            // Add optional fields only if provided
            if (from_class_id) {
              insertCols.push('from_class_id');
              insertVals.push(from_class_id);
            }
            if (from_academic_year_id) {
              insertCols.push('from_academic_year_id');
              insertVals.push(from_academic_year_id);
            }
            if (to_academic_year_id) {
              insertCols.push('to_academic_year_id');
              insertVals.push(to_academic_year_id);
            }
            if (criteria_used) {
              insertCols.push('criteria_used');
              insertVals.push(JSON.stringify(criteria_used));
            }
            if (promotion_notes) {
              insertCols.push('additional_notes');
              insertVals.push(promotion_notes);
            }

            const placeholders = insertVals.map(() => '?').join(', ');
            await connection.execute(
              `INSERT INTO promotions (${insertCols.join(', ')}) VALUES (${placeholders})`,
              insertVals
            );
          }
        } catch (promoError) {
          // Log but don't fail - promotions table error shouldn't stop the promotion
          console.warn('Warning: Failed to update/insert promotions table:', promoError);
        }

        // STEP 4: Insert into audit log (secondary audit - can also fail)
        try {
          await connection.execute(
            `INSERT INTO promotion_audit_log (
              schoolId,
              student_id,
              action_type,
              from_class_id,
              to_class_id,
              from_academic_year_id,
              to_academic_year_id,
              status_before,
              status_after,
              criteria_applied,
              reason,
              performed_by,
              ip_address
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              schoolId,
              student_id,
              'promoted',
              from_class_id || null,
              to_class_id,
              from_academic_year_id || null,
              to_academic_year_id || null,
              previousStatus || null,
              promotion_status,
              criteria_used ? JSON.stringify(criteria_used) : null,
              promotion_notes || null,
              user_id || 1, // Default to user 1 if not provided
              user_ip || null
            ]
          );
        } catch (auditError) {
          // Log but don't fail - audit log error shouldn't stop the promotion
          console.warn('Warning: Failed to insert promotion_audit_log:', auditError);
        }
      } catch (secondaryError) {
        // Secondary operations failed but core promotion succeeded
        console.warn('Warning in secondary operations:', secondaryError);
      }

      await connection.end();

      return NextResponse.json({
        success: true,
        message: `Student ${studentAdmissionNo} promoted from class ${from_class_id} to ${to_class_id}`,
        data: {
          student_id,
          student_admission: studentAdmissionNo,
          from_class_id,
          to_class_id,
          promotion_status,
          timestamp: new Date().toISOString()
        }
      });
    } catch (criticalError) {
      // Critical section failed - promotion cannot proceed
      await connection.end();
      throw criticalError;
    }
  } catch (error) {
    console.error('Error processing promotion:', error);
    if (connection) await connection.end();
    return NextResponse.json(
      { error: 'Failed to process promotion', details: (error as any).message },
      { status: 500 }
    );
  }
}
