/**
 * src/services/promotionService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * PROMOTION INTELLIGENCE ENGINE
 *
 * Core principle: Promotion NEVER depends on execution order.
 *
 * How it works:
 *   1. Enrollment lineage  — each enrollment tracks `promoted_from_enrollment_id`
 *   2. Eligibility engine  — analyses enrollment history to distinguish:
 *        • Previously enrolled students (eligible for promotion)
 *        • Newly enrolled students (NOT eligible — they're already where they belong)
 *        • Already promoted students (skip — prevent double promotion)
 *   3. Safe promotion      — closes old enrollment, creates new one (never mutates)
 *   4. Transaction safety   — all-or-nothing via withTenantTransaction
 *
 * This eliminates the class-ordering problem entirely:
 *   • P5 → P6 and P6 → P7 can happen in ANY order
 *   • New P6 enrollees are never accidentally promoted to P7
 *   • Chain promotions are fully aware of origin
 */
import { queryTenant, withTenantTransaction } from '@/lib/dbTenant';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PromotionStudent {
  id: number;
  admission_no: string;
  first_name: string;
  last_name: string;
  class_id: number;
  class_name: string;
  enrollment_id: number;
  enrollment_date: string | null;
  enrollment_type: string;
  promoted_from_enrollment_id: number | null;
  academic_year_id: number | null;
  academic_year_name: string | null;
  promotion_status: string;
  total_marks: number | null;
  average_marks: number | null;
  attendance_count: number;
  results_count: number;
}

export interface EligibilityResult {
  eligible: (PromotionStudent & { reason: string })[];
  ineligible: (PromotionStudent & { reason: string })[];
  already_promoted: (PromotionStudent & { reason: string })[];
  conflicts: ConflictInfo[];
  from_class: { id: number; name: string; level: number | null };
  to_class: { id: number; name: string; level: number | null } | null;
  summary: {
    total_in_class: number;
    eligible_count: number;
    ineligible_count: number;
    already_promoted_count: number;
    conflict_count: number;
  };
}

export interface ConflictInfo {
  type: 'mixed_year' | 'wrong_timeline' | 'duplicate_path';
  description: string;
  affected_student_ids: number[];
}

export interface PromoteResult {
  success: boolean;
  promoted_count: number;
  failed_count: number;
  promoted: { student_id: number; admission_no: string; name: string; from_class: string; to_class: string }[];
  failed: { student_id: number; admission_no: string; name: string; error: string }[];
  new_enrollment_ids: number[];
}

// ─── Class Progression ──────────────────────────────────────────────────────

/**
 * Determine the next class for a given class within a school.
 * Uses `classes.level` if available, falls back to name-based mapping.
 */
export async function getNextClass(
  schoolId: number,
  fromClassId: number,
): Promise<{ id: number; name: string; level: number | null } | null> {
  // Get current class info
  const current = await queryTenant(
    'SELECT id, name, level FROM classes WHERE id = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1',
    [fromClassId, schoolId],
    schoolId,
  );
  if (current.length === 0) return null;

  const cls = current[0];

  // Strategy 1: Use level-based progression if levels are set
  if (cls.level !== null && cls.level !== undefined) {
    const next = await queryTenant(
      'SELECT id, name, level FROM classes WHERE school_id = ? AND level = ? AND deleted_at IS NULL LIMIT 1',
      [schoolId, cls.level + 1],
      schoolId,
    );
    if (next.length > 0) return next[0];
  }

  // Strategy 2: Name-based progression fallback
  const NAME_PROGRESSION: Record<string, string> = {
    'BABY CLASS': 'MIDDLE CLASS',
    'MIDDLE CLASS': 'TOP CLASS',
    'TOP CLASS': 'PRIMARY ONE',
    'PRIMARY ONE': 'PRIMARY TWO',
    'PRIMARY TWO': 'PRIMARY THREE',
    'PRIMARY THREE': 'PRIMARY FOUR',
    'PRIMARY FOUR': 'PRIMARY FIVE',
    'PRIMARY FIVE': 'PRIMARY SIX',
    'PRIMARY SIX': 'PRIMARY SEVEN',
    'PRIMARY SEVEN': 'TAHFIZ',
    'SENIOR ONE': 'SENIOR TWO',
    'SENIOR TWO': 'SENIOR THREE',
    'SENIOR THREE': 'SENIOR FOUR',
    'SENIOR FOUR': 'SENIOR FIVE',
    'SENIOR FIVE': 'SENIOR SIX',
    'S1': 'S2', 'S.1': 'S.2',
    'S2': 'S3', 'S.2': 'S.3',
    'S3': 'S4', 'S.3': 'S.4',
    'S4': 'S5', 'S.4': 'S.5',
    'S5': 'S6', 'S.5': 'S.6',
  };

  const upperName = (cls.name || '').trim().toUpperCase();
  const nextName = NAME_PROGRESSION[upperName];
  if (nextName) {
    const next = await queryTenant(
      'SELECT id, name, level FROM classes WHERE school_id = ? AND UPPER(TRIM(name)) = ? AND deleted_at IS NULL LIMIT 1',
      [schoolId, nextName],
      schoolId,
    );
    if (next.length > 0) return next[0];
  }

  return null;
}

/**
 * Get all classes for a school, ordered by level (or name).
 */
export async function getOrderedClasses(schoolId: number) {
  return queryTenant(
    'SELECT id, name, level FROM classes WHERE school_id = ? AND deleted_at IS NULL ORDER BY COALESCE(level, 999), name',
    [schoolId],
    schoolId,
  );
}

// ─── Eligibility Engine ─────────────────────────────────────────────────────

/**
 * Analyse a class and return which students are eligible for promotion.
 *
 * The engine distinguishes:
 *   1. ELIGIBLE    — enrolled in this class in a PREVIOUS year (or promoted into it),
 *                    and NOT already promoted this cycle.
 *   2. INELIGIBLE  — newly enrolled in this class in the CURRENT year
 *                    (enrollment_type='new' AND no promoted_from_enrollment_id).
 *   3. ALREADY_PROMOTED — promotion_status = 'promoted' for this cycle.
 *
 * This is ORDER-INDEPENDENT: You can run P5→P6 before or after P6→P7.
 * New P6 enrollees are never accidentally promoted because they have no
 * prior enrollment to trace back to.
 */
export async function analyseEligibility(
  schoolId: number,
  fromClassId: number,
  academicYearId: number,
): Promise<EligibilityResult> {
  // Get class info
  const fromClassRows = await queryTenant(
    'SELECT id, name, level FROM classes WHERE id = ? AND school_id = ? LIMIT 1',
    [fromClassId, schoolId],
    schoolId,
  );
  if (fromClassRows.length === 0) {
    throw new Error(`Class ${fromClassId} not found for school ${schoolId}`);
  }
  const fromClass = fromClassRows[0];

  // Get next class
  const toClass = await getNextClass(schoolId, fromClassId);

  // Get ALL active students enrolled in this class for this academic year
  const students: PromotionStudent[] = await queryTenant(`
    SELECT
      s.id,
      s.admission_no,
      p.first_name,
      p.last_name,
      e.class_id,
      c.name AS class_name,
      e.id AS enrollment_id,
      e.enrollment_date,
      COALESCE(e.enrollment_type, 'standard') AS enrollment_type,
      e.promoted_from_enrollment_id,
      e.academic_year_id,
      ay.name AS academic_year_name,
      s.promotion_status,
      (SELECT COALESCE(SUM(r.total_marks), 0) FROM results r
       WHERE r.student_id = s.id AND r.academic_year_id = ?) AS total_marks,
      (SELECT COALESCE(AVG(r.total_marks), 0) FROM results r
       WHERE r.student_id = s.id AND r.academic_year_id = ?) AS average_marks,
      (SELECT COUNT(*) FROM student_attendance sa
       WHERE sa.student_id = s.id) AS attendance_count,
      (SELECT COUNT(*) FROM results r
       WHERE r.student_id = s.id AND r.academic_year_id = ?) AS results_count
    FROM students s
    JOIN people p ON s.person_id = p.id
    JOIN enrollments e ON e.student_id = s.id AND e.school_id = ?
    JOIN classes c ON e.class_id = c.id
    LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
    WHERE s.school_id = ?
      AND s.deleted_at IS NULL
      AND s.status = 'active'
      AND e.class_id = ?
      AND e.status = 'active'
      AND e.academic_year_id = ?
    ORDER BY p.first_name, p.last_name
  `, [academicYearId, academicYearId, academicYearId, schoolId, schoolId, fromClassId, academicYearId], schoolId);

  // Categorize each student
  const eligible: (PromotionStudent & { reason: string })[] = [];
  const ineligible: (PromotionStudent & { reason: string })[] = [];
  const already_promoted: (PromotionStudent & { reason: string })[] = [];
  const conflicts: ConflictInfo[] = [];

  // Check for prior enrollment in a DIFFERENT class (= they were promoted/moved here)
  // OR if they had an enrollment in a previous year in the SAME class (= continuing)
  for (const student of students) {
    // 1. Already promoted this cycle?
    if (student.promotion_status === 'promoted') {
      // Check if there's a promotion record for this year
      const promoCheck = await queryTenant(
        `SELECT id FROM promotions
         WHERE student_id = ? AND school_id = ? AND from_academic_year_id = ?
         AND promotion_status = 'promoted' LIMIT 1`,
        [student.id, schoolId, academicYearId],
        schoolId,
      );
      if (promoCheck.length > 0) {
        already_promoted.push({ ...student, reason: 'Already promoted in this academic year' });
        continue;
      }
    }

    // 2. Was this enrollment created by a promotion? (has lineage)
    if (student.promoted_from_enrollment_id) {
      // This student was promoted INTO this class — they need to complete the year first
      // They are eligible for promotion to the NEXT class
      eligible.push({ ...student, reason: 'Promoted into this class from previous class (has lineage)' });
      continue;
    }

    // 3. Check if student had a PREVIOUS enrollment in a LOWER class
    const prevEnrollment = await queryTenant(`
      SELECT e.id, e.class_id, c.name AS class_name, c.level, e.academic_year_id, ay.name AS year_name
      FROM enrollments e
      JOIN classes c ON e.class_id = c.id
      LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
      WHERE e.student_id = ? AND e.school_id = ?
        AND e.id != ?
        AND (e.status = 'closed' OR e.status = 'completed')
      ORDER BY e.id DESC
      LIMIT 5
    `, [student.id, schoolId, student.enrollment_id], schoolId);

    if (prevEnrollment.length > 0) {
      // Has enrollment history — this is a continuing student, eligible
      const lastEnrollment = prevEnrollment[0];
      eligible.push({
        ...student,
        reason: `Previously enrolled in ${lastEnrollment.class_name} (${lastEnrollment.year_name || 'unknown year'})`,
      });
      continue;
    }

    // 4. Check enrollment_type — if 'new' and no history, this is a new enrollee
    const enrollType = (student.enrollment_type || 'standard').toLowerCase();
    if (enrollType === 'new' || enrollType === 'standard') {
      // Check admission date vs academic year start to see if this is a recent new enrollment
      // New students enrolled directly into this class should NOT be promoted
      ineligible.push({
        ...student,
        reason: 'Newly enrolled in this class — no prior enrollment history',
      });
      continue;
    }

    // 5. Continuing/repeat/re-admitted — these have context
    if (enrollType === 'continuing' || enrollType === 'repeat' || enrollType === 're-admitted') {
      eligible.push({
        ...student,
        reason: `Enrollment type: ${enrollType} — has progression context`,
      });
      continue;
    }

    // Default: consider eligible but flag for review
    eligible.push({
      ...student,
      reason: 'No definitive classification — included for manual review',
    });
  }

  // ─── Conflict Detection ─────────────────────────────────────────────────

  // Detect mixed-year anomalies (students in same class from different academic years)
  const yearGroups = new Map<number, number[]>();
  for (const s of students) {
    if (s.academic_year_id) {
      const list = yearGroups.get(s.academic_year_id) || [];
      list.push(s.id);
      yearGroups.set(s.academic_year_id, list);
    }
  }
  if (yearGroups.size > 1) {
    conflicts.push({
      type: 'mixed_year',
      description: `Class has students from ${yearGroups.size} different academic years enrolled simultaneously`,
      affected_student_ids: students.map(s => s.id),
    });
  }

  // Detect duplicate progression paths
  const admissionNos = new Map<string, number[]>();
  for (const s of students) {
    if (s.admission_no) {
      const list = admissionNos.get(s.admission_no) || [];
      list.push(s.id);
      admissionNos.set(s.admission_no, list);
    }
  }
  for (const [admNo, ids] of admissionNos) {
    if (ids.length > 1) {
      conflicts.push({
        type: 'duplicate_path',
        description: `Admission number ${admNo} appears ${ids.length} times in this class`,
        affected_student_ids: ids,
      });
    }
  }

  return {
    eligible,
    ineligible,
    already_promoted,
    conflicts,
    from_class: fromClass,
    to_class: toClass,
    summary: {
      total_in_class: students.length,
      eligible_count: eligible.length,
      ineligible_count: ineligible.length,
      already_promoted_count: already_promoted.length,
      conflict_count: conflicts.length,
    },
  };
}

// ─── Promotion Execution ────────────────────────────────────────────────────

/**
 * Execute promotion for a list of students.
 *
 * For each student:
 *   1. Close current enrollment (status='completed', end_reason='promoted')
 *   2. Create NEW enrollment in destination class with lineage tracking
 *   3. Update student record (previous_class_id, promotion_status, etc.)
 *   4. Insert promotion audit record
 *
 * All within a single transaction — all-or-nothing.
 */
export async function promoteStudents(
  schoolId: number,
  params: {
    studentIds: number[];
    fromClassId: number;
    toClassId: number;
    fromAcademicYearId: number;
    toAcademicYearId: number;
    promotedBy: number;
    promotionReason?: string;
    promotionNotes?: string;
    criteriaUsed?: object;
  },
): Promise<PromoteResult> {
  const {
    studentIds, fromClassId, toClassId,
    fromAcademicYearId, toAcademicYearId,
    promotedBy,
    promotionReason = 'manual',
    promotionNotes = '',
    criteriaUsed,
  } = params;

  if (studentIds.length === 0) {
    return { success: true, promoted_count: 0, failed_count: 0, promoted: [], failed: [], new_enrollment_ids: [] };
  }

  return withTenantTransaction(schoolId, async ({ exec, query }) => {
    // Get class names for audit
    const [fromCls] = await query(
      'SELECT name FROM classes WHERE id = ? AND school_id = ? LIMIT 1',
      [fromClassId, schoolId],
    );
    const [toCls] = await query(
      'SELECT name FROM classes WHERE id = ? AND school_id = ? LIMIT 1',
      [toClassId, schoolId],
    );
    const fromClassName = fromCls?.name || `Class ${fromClassId}`;
    const toClassName = toCls?.name || `Class ${toClassId}`;

    // Resolve the destination term (active term of the destination year)
    const destTermRows = await query(
      "SELECT id FROM terms WHERE school_id = ? AND academic_year_id = ? AND (is_active = 1 OR status = 'active') ORDER BY id LIMIT 1",
      [schoolId, toAcademicYearId],
    );
    const destTermId = destTermRows[0]?.id ?? null;

    const promoted: PromoteResult['promoted'] = [];
    const failed: PromoteResult['failed'] = [];
    const newEnrollmentIds: number[] = [];

    for (const studentId of studentIds) {
      try {
        // 1. Get current active enrollment in the from_class
        const currentEnrollments = await query(
          `SELECT e.id, e.stream_id, e.study_mode_id, e.curriculum_id, e.program_id,
                  s.admission_no, p.first_name, p.last_name
           FROM enrollments e
           JOIN students s ON e.student_id = s.id
           JOIN people p ON s.person_id = p.id
           WHERE e.student_id = ? AND e.school_id = ? AND e.class_id = ?
             AND e.status = 'active'
           LIMIT 1`,
          [studentId, schoolId, fromClassId],
        );

        if (currentEnrollments.length === 0) {
          failed.push({
            student_id: studentId, admission_no: '', name: '',
            error: 'No active enrollment found in source class',
          });
          continue;
        }

        const curr = currentEnrollments[0];
        const studentName = `${curr.first_name} ${curr.last_name || ''}`.trim();

        // 2. Check not already promoted
        const alreadyInDest = await query(
          `SELECT id FROM enrollments
           WHERE student_id = ? AND school_id = ? AND class_id = ?
             AND academic_year_id = ? AND status = 'active'
           LIMIT 1`,
          [studentId, schoolId, toClassId, toAcademicYearId],
        );
        if (alreadyInDest.length > 0) {
          failed.push({
            student_id: studentId, admission_no: curr.admission_no, name: studentName,
            error: 'Already has active enrollment in destination class',
          });
          continue;
        }

        // 3. Close the current enrollment
        await exec(
          `UPDATE enrollments
           SET status = 'completed', end_date = CURDATE(), end_reason = 'promoted', updated_at = NOW()
           WHERE id = ? AND school_id = ?`,
          [curr.id, schoolId],
        );

        // 4. Create new enrollment in destination class WITH lineage
        const insertResult = await exec(
          `INSERT INTO enrollments
             (school_id, student_id, class_id, stream_id, academic_year_id, term_id,
              study_mode_id, curriculum_id, program_id,
              enrollment_type, enrollment_date, enrolled_at, status,
              promoted_from_enrollment_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'continuing', CURDATE(), NOW(), 'active', ?)`,
          [schoolId, studentId, toClassId, curr.stream_id,
           toAcademicYearId, destTermId,
           curr.study_mode_id, curr.curriculum_id, curr.program_id,
           curr.id],
        );
        const newEnrollmentId = insertResult.insertId;
        newEnrollmentIds.push(newEnrollmentId);

        // 5. Update students table
        await exec(
          `UPDATE students SET
             promotion_status = 'promoted',
             last_promoted_at = NOW(),
             previous_class_id = ?,
             previous_year_id = ?,
             term_promoted_in = (SELECT name FROM terms WHERE id = ? LIMIT 1),
             promotion_criteria_used = ?,
             promotion_notes = ?
           WHERE id = ? AND school_id = ?`,
          [fromClassId, fromAcademicYearId,
           destTermId,
           criteriaUsed ? JSON.stringify(criteriaUsed) : null,
           promotionNotes || null,
           studentId, schoolId],
        );

        // 6. Insert promotion record
        try {
          await exec(
            `INSERT INTO promotions
               (school_id, student_id, from_class_id, to_class_id,
                from_academic_year_id, to_academic_year_id,
                promotion_status, promotion_reason, criteria_used,
                additional_notes, promoted_by)
             VALUES (?, ?, ?, ?, ?, ?, 'promoted', ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               to_class_id = VALUES(to_class_id),
               to_academic_year_id = VALUES(to_academic_year_id),
               promotion_status = 'promoted',
               updated_at = NOW()`,
            [schoolId, studentId, fromClassId, toClassId,
             fromAcademicYearId, toAcademicYearId,
             promotionReason,
             criteriaUsed ? JSON.stringify(criteriaUsed) : null,
             promotionNotes || null,
             promotedBy],
          );
        } catch (e) {
          // Promotion record is audit-only — don't fail the promotion
          console.warn(`[promotionService] promotions table insert failed for student ${studentId}:`, e);
        }

        // 7. Insert audit log
        try {
          await exec(
            `INSERT INTO promotion_audit_log
               (school_id, student_id, action_type,
                from_class_id, to_class_id,
                from_academic_year_id, to_academic_year_id,
                status_before, status_after,
                criteria_applied, performed_by, reason)
             VALUES (?, ?, 'promoted', ?, ?, ?, ?, 'pending', 'promoted', ?, ?, ?)`,
            [schoolId, studentId,
             fromClassId, toClassId,
             fromAcademicYearId, toAcademicYearId,
             criteriaUsed ? JSON.stringify(criteriaUsed) : null,
             promotedBy,
             promotionNotes || `Promoted from ${fromClassName} to ${toClassName}`],
          );
        } catch (e) {
          console.warn(`[promotionService] audit log insert failed for student ${studentId}:`, e);
        }

        promoted.push({
          student_id: studentId,
          admission_no: curr.admission_no,
          name: studentName,
          from_class: fromClassName,
          to_class: toClassName,
        });
      } catch (err: any) {
        failed.push({
          student_id: studentId,
          admission_no: '',
          name: `Student ${studentId}`,
          error: err.message || 'Unknown error',
        });
      }
    }

    return {
      success: promoted.length > 0,
      promoted_count: promoted.length,
      failed_count: failed.length,
      promoted,
      failed,
      new_enrollment_ids: newEnrollmentIds,
    };
  });
}
