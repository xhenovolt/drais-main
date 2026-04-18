import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { logAudit, AuditAction } from '@/lib/audit';
import { logSystemError } from '@/lib/errorLogger';

/**
 * POST /api/enrollments/bulk-assign
 *
 * Assigns a program+class to multiple students simultaneously.
 * If a student already has an active enrollment for this program+term → update the class.
 * If not → insert a new enrollment row (existing other-program enrollments are preserved).
 *
 * Body:
 * {
 *   student_ids:      number[]   — required, min 1
 *   program_id:       number     — required
 *   class_id:         number     — required
 *   term_id:          number     — required
 *   academic_year_id: number     — required
 *   study_mode_id?:   number     — optional
 *   stream_id?:       number     — optional
 * }
 *
 * Returns:
 * { success, data: { assigned, updated, failed, errors } }
 */
export async function POST(req: NextRequest) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    let body: any;
    try { body = await req.json(); } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
    }

    const {
      student_ids,
      program_id,
      class_id,
      term_id,
      academic_year_id,
      study_mode_id,
      stream_id,
    } = body;

    // ── Validate required fields ──────────────────────────────────────────
    if (!Array.isArray(student_ids) || student_ids.length === 0) {
      return NextResponse.json({ success: false, message: 'student_ids must be a non-empty array' }, { status: 400 });
    }
    if (!program_id || !class_id || !term_id || !academic_year_id) {
      return NextResponse.json({ success: false, message: 'program_id, class_id, term_id, academic_year_id are required' }, { status: 400 });
    }

    // Limit to 500 per request (prevent abuse)
    const ids: number[] = student_ids.slice(0, 500).map(Number).filter(n => Number.isFinite(n) && n > 0);
    if (ids.length === 0) {
      return NextResponse.json({ success: false, message: 'No valid student_ids provided' }, { status: 400 });
    }

    // ── Validate class, program, term, academic_year exist ────────────────
    const [[classRow]]: any = await conn.execute(
      'SELECT id, name, curriculum_id FROM classes WHERE id = ? AND school_id = ? LIMIT 1',
      [class_id, schoolId]
    );
    if (!classRow) {
      return NextResponse.json({ success: false, message: 'Class not found' }, { status: 404 });
    }

    const [[programRow]]: any = await conn.execute(
      'SELECT id, name FROM programs WHERE id = ? AND school_id = ? AND is_active = 1 LIMIT 1',
      [program_id, schoolId]
    );
    if (!programRow) {
      return NextResponse.json({ success: false, message: 'Program not found or inactive' }, { status: 404 });
    }

    const [[termRow]]: any = await conn.execute(
      'SELECT id FROM terms WHERE id = ? AND school_id = ? LIMIT 1',
      [term_id, schoolId]
    );
    if (!termRow) {
      return NextResponse.json({ success: false, message: 'Term not found' }, { status: 404 });
    }

    const [[yearRow]]: any = await conn.execute(
      'SELECT id FROM academic_years WHERE id = ? AND school_id = ? LIMIT 1',
      [academic_year_id, schoolId]
    );
    if (!yearRow) {
      return NextResponse.json({ success: false, message: 'Academic year not found' }, { status: 404 });
    }

    // ── Resolve default study_mode_id if not provided ─────────────────────
    let resolvedStudyModeId = study_mode_id ?? null;
    if (!resolvedStudyModeId) {
      const [[sm]]: any = await conn.execute(
        'SELECT id FROM study_modes WHERE (school_id = ? OR school_id IS NULL) AND is_default = 1 ORDER BY school_id DESC LIMIT 1',
        [schoolId]
      );
      resolvedStudyModeId = sm?.id ?? null;
    }

    // ── Validate students belong to this school ───────────────────────────
    const placeholders = ids.map(() => '?').join(',');
    const [studentRows]: any = await conn.execute(
      `SELECT id FROM students WHERE id IN (${placeholders}) AND school_id = ? AND deleted_at IS NULL`,
      [...ids, schoolId]
    );
    const validStudentIds = new Set<number>(studentRows.map((r: any) => r.id));

    // ── Process each student ──────────────────────────────────────────────
    await conn.beginTransaction();
    try {
      let assigned = 0;
      let updated  = 0;
      let failed   = 0;
      const errors: { student_id: number; error: string }[] = [];

      for (const sid of ids) {
        if (!validStudentIds.has(sid)) {
          errors.push({ student_id: sid, error: 'Student not found in this school' });
          failed++;
          continue;
        }

        try {
          // Check for existing active enrollment for this student+program+term
          const [[existing]]: any = await conn.execute(
            `SELECT id, class_id FROM enrollments
             WHERE student_id = ? AND school_id = ? AND program_id = ? AND term_id = ? AND status = 'active'
             LIMIT 1`,
            [sid, schoolId, program_id, term_id]
          );

          if (existing) {
            // Update existing enrollment to the new class
            if (existing.class_id !== class_id) {
              await conn.execute(
                `UPDATE enrollments SET class_id = ?, stream_id = ?, updated_at = NOW()
                 WHERE id = ?`,
                [class_id, stream_id ?? null, existing.id]
              );
              updated++;
            } else {
              // Same class — no change needed, still counts as processed
              assigned++;
            }
          } else {
            // Insert new enrollment row for this program
            await conn.execute(
              `INSERT INTO enrollments
                 (school_id, student_id, class_id, stream_id, academic_year_id, term_id,
                  study_mode_id, curriculum_id, program_id, enrollment_type, status,
                  enrollment_date, enrolled_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'continuing', 'active', CURDATE(), NOW())`,
              [
                schoolId, sid, class_id, stream_id ?? null,
                academic_year_id, term_id,
                resolvedStudyModeId,
                classRow.curriculum_id ?? null,
                program_id,
              ]
            );
            assigned++;
          }
        } catch (rowErr: any) {
          // ER_DUP_ENTRY — unique constraint fired (race condition or resubmit)
          if (rowErr.code === 'ER_DUP_ENTRY') {
            assigned++; // treat as already-assigned success
          } else {
            failed++;
            errors.push({ student_id: sid, error: rowErr.message });
          }
        }
      }

      await conn.commit();

      // Audit (fire-and-forget)
      logAudit({
        schoolId,
        userId: session.userId,
        action: AuditAction.ENROLLED_STUDENT,
        entityType: 'enrollment',
        entityId: program_id,
        details: {
          mode: 'bulk_assign',
          program_id,
          program_name: programRow.name,
          class_id,
          class_name: classRow.name,
          term_id,
          academic_year_id,
          student_ids: ids,
          assigned,
          updated,
          failed,
        },
        ip: req.headers.get('x-forwarded-for') || null,
        userAgent: req.headers.get('user-agent') || null,
        source: 'WEB',
      }).catch(e => console.error('[bulk-assign] audit error:', e));

      return NextResponse.json({
        success: true,
        message: `Bulk assign complete: ${assigned} assigned, ${updated} updated${failed > 0 ? `, ${failed} failed` : ''}`,
        data: { assigned, updated, failed, errors: errors.length ? errors : undefined },
      });
    } catch (txErr) {
      await conn.rollback();
      throw txErr;
    }
  } catch (error: any) {
    console.error('[BULK-ASSIGN ERROR]', error);
    await logSystemError({ endpoint: '/api/enrollments/bulk-assign', method: 'POST', error, schoolId: null, userId: null });
    return NextResponse.json({
      success: false,
      message: error.message || 'Bulk assignment failed',
    }, { status: 500 });
  } finally {
    await conn.end();
  }
}
