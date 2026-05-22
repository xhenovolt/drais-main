/**
 * Allocation Validation Library
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * Provides validation and business rule enforcement for teacher-class-subject
 * allocations. Ensures data integrity, unique constraints, and ownership checks.
 */

export interface AllocationInput {
  id?: number | string | null;
  class_id: number | string;
  subject_id: number | string;
  teacher_id: number | string | null | undefined;
  custom_initials?: string | null;
}

export interface ValidatedAllocation {
  id: number | null;
  class_id: number;
  subject_id: number;
  teacher_id: number | null;
  custom_initials: string | null;
}

/**
 * Validate raw input for creating/updating an allocation.
 * Throws Error with aggregated messages if validation fails.
 */
export function validateAllocationInput(data: AllocationInput): ValidatedAllocation {
  const errors: string[] = [];

  const id = data.id !== undefined && data.id !== null && data.id !== ''
    ? Number(data.id)
    : null;
  const class_id = Number(data.class_id);
  const subject_id = Number(data.subject_id);
  const teacher_id = data.teacher_id !== undefined && data.teacher_id !== null && data.teacher_id !== ''
    ? Number(data.teacher_id)
    : null;
  const custom_initials = data.custom_initials !== undefined ? String(data.custom_initials).trim() || null : null;

  if (id !== null && (isNaN(id) || id <= 0)) {
    errors.push('Valid allocation ID is required when updating.');
  }
  if (!class_id || isNaN(class_id) || class_id <= 0) {
    errors.push('Valid class ID is required.');
  }
  if (!subject_id || isNaN(subject_id) || subject_id <= 0) {
    errors.push('Valid subject ID is required.');
  }
  if (custom_initials && custom_initials.length > 10) {
    errors.push('Custom initials must be 10 characters or less.');
  }

  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }

  return { id, class_id, subject_id, teacher_id, custom_initials };
}

/**
 * Check if a duplicate allocation exists for the same class+subject combination.
 * Optionally exclude a specific allocation ID (useful for updates).
 *
 * @returns Promise<boolean> true if duplicate exists
 */
export async function checkDuplicateAssignment(
  connection: any,
  schoolId: number,
  class_id: number,
  subject_id: number,
  excludeId?: number
): Promise<boolean> {
  const query = `
    SELECT cs.id
    FROM class_subjects cs
    JOIN classes c ON cs.class_id = c.id
    WHERE cs.class_id = ? AND cs.subject_id = ? AND c.school_id = ?
    ${excludeId ? 'AND cs.id != ?' : ''}
    LIMIT 1
  `;
  const params = excludeId ? [class_id, subject_id, schoolId, excludeId] : [class_id, subject_id, schoolId];
  const [rows] = await connection.execute(query, params);
  return rows.length > 0;
}

/**
 * Validate that the provided class, subject, and teacher (if any) belong to the school.
 * Throws Error if any ownership check fails.
 */
export async function validateOwnership(
  connection: any,
  schoolId: number,
  { class_id, subject_id, teacher_id }: { class_id: number; subject_id: number; teacher_id: number | null }
) {
  const [classRows] = await connection.execute(
    'SELECT id FROM classes WHERE id = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1',
    [class_id, schoolId]
  );
  if (!classRows.length) {
    throw new Error('The selected class does not belong to your school.');
  }

  const [subjectRows] = await connection.execute(
    'SELECT id FROM subjects WHERE id = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1',
    [subject_id, schoolId]
  );
  if (!subjectRows.length) {
    throw new Error('The selected subject does not belong to your school.');
  }

  if (teacher_id) {
    const [teacherRows] = await connection.execute(
      'SELECT id FROM staff WHERE id = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1',
      [teacher_id, schoolId]
    );
    if (!teacherRows.length) {
      throw new Error('The selected teacher does not belong to your school.');
    }
  }
}

/**
 * Ensure allocation exists and belongs to school.
 * Throws 404 if not found.
 */
export async function ensureAllocationBelongsToSchool(
  connection: any,
  schoolId: number,
  allocationId: number
) {
  const [rows] = await connection.execute(
    `SELECT cs.id
     FROM class_subjects cs
     JOIN classes c ON cs.class_id = c.id
     WHERE cs.id = ? AND c.school_id = ?
     LIMIT 1`,
    [allocationId, schoolId]
  );

  if (!rows.length) {
    throw new Error('Assignment not found for your school.');
  }
}

/**
 * Auto-generate teacher initials from name: first letter of first + last name.
 * E.g., "Hassan Musa" → "HM"
 */
export function generateTeacherInitials(firstName: string | null | undefined, lastName: string | null | undefined): string {
  const first = (firstName || '').trim().charAt(0).toUpperCase();
  const last = (lastName || '').trim().charAt(0).toUpperCase();
  return first && last ? `${first}${last}` : '';
}

/**
 * Resolve display initials following hierarchy:
 * 1. custom_initials if set
 * 2. auto-generated from teacher name if teacher assigned
 * 3. 'N/A' fallback
 */
export function resolveDisplayInitials(
  custom_initials: string | null,
  auto_generated: string | null | undefined,
  teacher_id: number | null
): string {
  if (custom_initials) return custom_initials;
  if (auto_generated) return auto_generated;
  if (teacher_id) return '??'; // teacher assigned but no name? unlikely
  return 'N/A';
}
