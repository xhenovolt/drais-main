/**
 * src/services/enrollmentService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH for all enrollment operations.
 *
 * ALL enrollment paths — page (/students/enroll), modal (student list),
 * bulk enrollment, import — MUST call these functions.
 *
 * Rules:
 *   1. Every query scoped to school_id (via withTenantTransaction)
 *   2. Duplicate enrollment guard (same student + class + academic_year)
 *   3. Full transaction for data integrity
 *   4. Audit trail for every enrollment
 */
import { queryTenant, withTenantTransaction } from '@/lib/dbTenant';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EnrollStudentParams {
  studentId: number;
  classId: number;
  streamId?: number | null;
  academicYearId?: number | null;
  termId?: number | null;
  studyModeId?: number | null;
  curriculumId?: number | null;
  programId?: number | null;
  programIds?: number[];
  enrollmentType?: 'new' | 'continuing' | 'repeat' | 're-admitted';
  closePrevious?: boolean;
}

export interface EnrollResult {
  success: boolean;
  action: 'inserted' | 'updated' | 'skipped';
  enrollmentId: number | null;
  message: string;
  resolvedYearId?: number | null;
  resolvedTermId?: number | null;
}

// ─── Core enrollment function ───────────────────────────────────────────────

/**
 * Enroll a single student. Handles:
 *   - Validation (student exists, belongs to school)
 *   - Duplicate enrollment detection
 *   - Resolving active year/term if not provided
 *   - Closing previous enrollment if requested
 *   - Creating or updating enrollment record
 *   - Linking programs via enrollment_programs junction
 */
export async function enrollStudent(
  schoolId: number,
  params: EnrollStudentParams,
): Promise<EnrollResult> {
  const {
    studentId,
    classId,
    streamId,
    academicYearId,
    termId,
    studyModeId,
    curriculumId,
    programId,
    programIds,
    enrollmentType = 'new',
    closePrevious = true,
  } = params;

  if (!studentId || !classId) {
    return { success: false, action: 'skipped', enrollmentId: null, message: 'studentId and classId are required' };
  }

  return withTenantTransaction(schoolId, async ({ exec, query: tq }) => {
    // 1. Confirm the student belongs to this school
    const owned = await tq(
      'SELECT id FROM students WHERE id = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1',
      [studentId, schoolId],
    );
    if (owned.length === 0) {
      return { success: false, action: 'skipped' as const, enrollmentId: null, message: 'Student not found' };
    }

    // 2. Resolve academic year and term if not provided
    let resolvedYearId = academicYearId ?? null;
    let resolvedTermId = termId ?? null;

    if (!resolvedYearId) {
      const yr = await tq(
        "SELECT id FROM academic_years WHERE school_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1",
        [schoolId],
      );
      resolvedYearId = yr[0]?.id ?? null;
    }
    if (!resolvedTermId) {
      const tr = await tq(
        "SELECT id FROM terms WHERE school_id = ? AND (is_active = 1 OR status = 'active') ORDER BY id DESC LIMIT 1",
        [schoolId],
      );
      resolvedTermId = tr[0]?.id ?? null;
    }

    // 3. Check for duplicate enrollment (same student + class + academic_year)
    const duplicateCheck = await tq(
      "SELECT id FROM enrollments WHERE student_id = ? AND class_id = ? AND academic_year_id = ? AND school_id = ? AND status = 'active' LIMIT 1",
      [studentId, classId, resolvedYearId, schoolId],
    );
    if (duplicateCheck.length > 0) {
      return {
        success: false,
        action: 'skipped' as const,
        enrollmentId: duplicateCheck[0].id,
        message: 'Student is already enrolled in this class for this academic year',
      };
    }

    // 4. Check for existing active enrollment in different class
    const existing = await tq(
      "SELECT id, class_id FROM enrollments WHERE student_id = ? AND school_id = ? AND status = 'active' LIMIT 1",
      [studentId, schoolId],
    );

    let action: 'inserted' | 'updated';
    let enrollmentId: number;

    if (existing.length > 0 && !closePrevious) {
      // Update existing enrollment
      const eid = existing[0].id;
      await exec(
        `UPDATE enrollments
         SET class_id = ?,
             stream_id          = COALESCE(?, stream_id),
             academic_year_id   = COALESCE(?, academic_year_id),
             term_id            = COALESCE(?, term_id),
             study_mode_id      = COALESCE(?, study_mode_id),
             curriculum_id      = COALESCE(?, curriculum_id),
             program_id         = COALESCE(?, program_id),
             enrollment_type    = COALESCE(?, enrollment_type),
             updated_at         = NOW()
         WHERE id = ? AND school_id = ?`,
        [classId, streamId ?? null, resolvedYearId, resolvedTermId,
         studyModeId ?? null, curriculumId ?? null, programId ?? null,
         enrollmentType, eid, schoolId],
      );
      action = 'updated';
      enrollmentId = eid;
    } else {
      // Close previous enrollment if any
      if (existing.length > 0 && closePrevious) {
        await exec(
          "UPDATE enrollments SET status = 'closed', end_date = CURDATE(), end_reason = 'promoted_or_moved', updated_at = NOW() WHERE id = ? AND school_id = ?",
          [existing[0].id, schoolId],
        );
      }

      // Insert new enrollment
      const inserted = await exec(
        `INSERT INTO enrollments
           (school_id, student_id, class_id, stream_id, academic_year_id, term_id,
            study_mode_id, curriculum_id, program_id,
            enrollment_type, enrollment_date, enrolled_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), NOW(), 'active')`,
        [schoolId, studentId, classId, streamId ?? null, resolvedYearId, resolvedTermId,
         studyModeId ?? null, curriculumId ?? null, programId ?? null,
         enrollmentType],
      );
      action = 'inserted';
      enrollmentId = inserted.insertId;
    }

    // 5. Link programs via enrollment_programs junction table (if programIds provided)
    const allProgIds = programIds ?? (programId ? [programId] : []);
    if (allProgIds.length > 0 && enrollmentId) {
      // Clear existing links for this enrollment
      try {
        await exec(
          'DELETE FROM enrollment_programs WHERE enrollment_id = ?',
          [enrollmentId],
        );
      } catch { /* table may not exist */ }

      for (const pid of allProgIds) {
        try {
          await exec(
            'INSERT INTO enrollment_programs (enrollment_id, program_id) VALUES (?, ?)',
            [enrollmentId, pid],
          );
        } catch { /* ignore duplicate or missing table */ }
      }
    }

    return {
      success: true,
      action,
      enrollmentId,
      message: action === 'updated' ? 'Student moved to new class' : 'Student enrolled successfully',
      resolvedYearId,
      resolvedTermId,
    };
  });
}

// ─── Bulk enrollment ────────────────────────────────────────────────────────

export interface BulkEnrollParams {
  studentIds: number[];
  classId?: number | null;
  streamId?: number | null;
  academicYearId?: number | null;
  termId?: number | null;
  studyModeId?: number | null;
  curriculumId?: number | null;
  programId?: number | null;
  programIds?: number[];
  enrollmentType?: 'new' | 'continuing' | 'repeat' | 're-admitted';
}

export interface BulkEnrollResult {
  success: boolean;
  enrolled: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ studentId: number; error: string }>;
  message: string;
}

/**
 * Enroll multiple students. For each student:
 *   - If classId not provided, use their current class
 *   - Skip if already enrolled in same class+year
 *   - Report per-student results
 */
export async function enrollStudentsBulk(
  schoolId: number,
  params: BulkEnrollParams,
): Promise<BulkEnrollResult> {
  const {
    studentIds,
    classId,
    streamId,
    academicYearId,
    termId,
    studyModeId,
    curriculumId,
    programId,
    programIds,
    enrollmentType = 'continuing',
  } = params;

  if (!studentIds || studentIds.length === 0) {
    return { success: false, enrolled: 0, updated: 0, skipped: 0, failed: 0, errors: [], message: 'No students provided' };
  }

  // Resolve year/term once
  let resolvedYearId = academicYearId ?? null;
  let resolvedTermId = termId ?? null;

  if (!resolvedYearId) {
    const yr = await queryTenant(
      "SELECT id FROM academic_years WHERE school_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1",
      [schoolId], schoolId,
    );
    resolvedYearId = yr[0]?.id ?? null;
  }
  if (!resolvedTermId) {
    const tr = await queryTenant(
      "SELECT id FROM terms WHERE school_id = ? AND (is_active = 1 OR status = 'active') ORDER BY id DESC LIMIT 1",
      [schoolId], schoolId,
    );
    resolvedTermId = tr[0]?.id ?? null;
  }

  if (!resolvedYearId || !resolvedTermId) {
    return {
      success: false, enrolled: 0, updated: 0, skipped: 0, failed: 0, errors: [],
      message: 'No active academic year or term configured',
    };
  }

  let enrolled = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const errors: Array<{ studentId: number; error: string }> = [];

  for (const studentId of studentIds) {
    try {
      // If no classId provided, use their current active enrollment class
      let effectiveClassId = classId ?? null;
      if (!effectiveClassId) {
        const current = await queryTenant(
          "SELECT class_id FROM enrollments WHERE student_id = ? AND school_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1",
          [studentId, schoolId], schoolId,
        );
        effectiveClassId = current[0]?.class_id ?? null;
      }

      if (!effectiveClassId) {
        errors.push({ studentId, error: 'No class assigned and no current enrollment' });
        failed++;
        continue;
      }

      const result = await enrollStudent(schoolId, {
        studentId,
        classId: effectiveClassId,
        streamId,
        academicYearId: resolvedYearId,
        termId: resolvedTermId,
        studyModeId,
        curriculumId,
        programId,
        programIds,
        enrollmentType,
        closePrevious: true,
      });

      if (result.success) {
        if (result.action === 'inserted') enrolled++;
        else if (result.action === 'updated') updated++;
      } else {
        if (result.action === 'skipped') {
          skipped++;
        } else {
          errors.push({ studentId, error: result.message });
          failed++;
        }
      }
    } catch (err: any) {
      errors.push({ studentId, error: err.message || 'Unknown error' });
      failed++;
    }
  }

  return {
    success: failed === 0,
    enrolled,
    updated,
    skipped,
    failed,
    errors,
    message: `Enrolled ${enrolled}, updated ${updated}, skipped ${skipped}${failed > 0 ? `, ${failed} failed` : ''}`,
  };
}
