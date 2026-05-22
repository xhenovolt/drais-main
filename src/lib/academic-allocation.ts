/**
 * DRAIS Academic Allocation Service
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * SINGLE SOURCE OF TRUTH for all teacher-subject-class relationships in DRAIS.
 * 
 * All pages, reports, initials, and dashboards must read from this authoritative
 * module instead of implementing their own SQL derivations.
 * 
 * RELATIONSHIP MODEL:
 *   class_subjects (allocations)
 *     ├─ class_id ──> classes
 *     ├─ subject_id ──> subjects
 *     ├─ teacher_id ──> staff ──> people (person_id)
 *     └─ custom_initials (overrides auto-generated)
 * 
 * CANONICAL ALLOCATION SHAPE:
 *   {
 *     id: class_subjects.id (allocation key)
 *     class_id: number
 *     subject_id: number
 *     teacher_id: number | null
 *     class_name: string
 *     subject_name: string
 *     subject_code: string | null
 *     teacher_name: string | "Unassigned"
 *     custom_initials: string | null
 *     auto_generated_initials: string | null
 *     display_initials: string (custom or auto-generated)
 *   }
 */

import { getConnection } from '@/lib/db';

export interface Allocation {
  id: number;
  class_id: number;
  subject_id: number;
  teacher_id: number | null;
  class_name: string;
  subject_name: string;
  subject_code: string | null;
  subject_type: string | null;
  academic_type: string | null;
  teacher_name: string;
  custom_initials: string | null;
  auto_generated_initials: string | null;
  display_initials: string;
}

export interface AllocationFilter {
  classId?: number;
  subjectId?: number;
  teacherId?: number;
  limit?: number;
  offset?: number;
}

export interface SubjectAllocationSummary {
  subjectId: number;
  subjectName: string;
  subjectCode: string | null;
  allocations: Allocation[];
  allocatedClasses: string[];
  allocatedTeachers: string[];
  allocationCount: number;
}

/**
 * AUTHORITATIVE QUERY: Fetch allocations with all related data
 * This query MUST be used by all consumers to ensure consistency
 */
async function buildAllocationQuery(
  schoolId: number,
  filters?: AllocationFilter
): Promise<{ sql: string; params: any[] }> {
  let sql = `
    SELECT
      cs.id,
      cs.class_id,
      cs.subject_id,
      cs.teacher_id,
      cs.custom_initials,
      c.name AS class_name,
      sub.name AS subject_name,
      sub.code AS subject_code,
      sub.subject_type,
      sub.academic_type,
      CONCAT(UPPER(LEFT(p.first_name, 1)), UPPER(LEFT(p.last_name, 1))) AS auto_generated_initials,
      CONCAT(p.first_name, ' ', p.last_name) AS teacher_name
    FROM class_subjects cs
    JOIN classes c ON cs.class_id = c.id
    JOIN subjects sub ON cs.subject_id = sub.id
    LEFT JOIN staff s ON cs.teacher_id = s.id
    LEFT JOIN people p ON s.person_id = p.id
    WHERE c.school_id = ? AND sub.school_id = ?
  `;

  const params: any[] = [schoolId, schoolId];

  if (filters?.classId) {
    sql += ' AND cs.class_id = ?';
    params.push(filters.classId);
  }

  if (filters?.subjectId) {
    sql += ' AND cs.subject_id = ?';
    params.push(filters.subjectId);
  }

  if (filters?.teacherId) {
    sql += ' AND cs.teacher_id = ?';
    params.push(filters.teacherId);
  }

  sql += ' ORDER BY c.name ASC, sub.name ASC';

  if (filters?.limit) {
    sql += ` LIMIT ${filters.limit}`;
    if (filters?.offset) {
      sql += ` OFFSET ${filters.offset}`;
    }
  }

  return { sql, params };
}

/**
 * Fetch all allocations with optional filters
 */
export async function getAllocations(
  schoolId: number,
  filters?: AllocationFilter
): Promise<Allocation[]> {
  const connection = await getConnection();
  try {
    const { sql, params } = await buildAllocationQuery(schoolId, filters);
    const [rows] = await connection.execute(sql, params);

    return (rows as any[]).map(r => ({
      id: r.id,
      class_id: r.class_id,
      subject_id: r.subject_id,
      teacher_id: r.teacher_id,
      class_name: r.class_name,
      subject_name: r.subject_name,
      subject_code: r.subject_code,
      subject_type: r.subject_type,
      academic_type: r.academic_type,
      teacher_name: r.teacher_name || 'Unassigned',
      custom_initials: r.custom_initials,
      auto_generated_initials: r.auto_generated_initials || '',
      display_initials: r.custom_initials || r.auto_generated_initials || ''
    }));
  } finally {
    await connection.end();
  }
}

/**
 * Get allocations grouped by subject for subject dashboard view
 */
export async function getAllocationsBySubject(
  schoolId: number
): Promise<SubjectAllocationSummary[]> {
  const allocations = await getAllocations(schoolId);

  // Group by subject
  const bySubject = new Map<number, Allocation[]>();
  for (const alloc of allocations) {
    if (!bySubject.has(alloc.subject_id)) {
      bySubject.set(alloc.subject_id, []);
    }
    bySubject.get(alloc.subject_id)!.push(alloc);
  }

  // Transform to summary format
  const summaries: SubjectAllocationSummary[] = [];
  for (const [subjectId, allocs] of bySubject) {
    const classes = Array.from(new Set(allocs.map(a => a.class_name)));
    const teachers = Array.from(
      new Set(
        allocs
          .filter(a => a.teacher_id)
          .map(a => a.teacher_name)
      )
    );

    summaries.push({
      subjectId,
      subjectName: allocs[0].subject_name,
      subjectCode: allocs[0].subject_code,
      allocations: allocs,
      allocatedClasses: classes,
      allocatedTeachers: teachers,
      allocationCount: allocs.length
    });
  }

  return summaries.sort((a, b) =>
    a.subjectName.localeCompare(b.subjectName)
  );
}

/**
 * Get allocations for a specific class
 */
export async function getClassAllocations(
  schoolId: number,
  classId: number
): Promise<Allocation[]> {
  return getAllocations(schoolId, { classId });
}

/**
 * Get allocations for a specific subject
 */
export async function getSubjectAllocations(
  schoolId: number,
  subjectId: number
): Promise<Allocation[]> {
  return getAllocations(schoolId, { subjectId });
}

/**
 * Get allocations for a specific teacher
 */
export async function getTeacherAllocations(
  schoolId: number,
  teacherId: number
): Promise<Allocation[]> {
  return getAllocations(schoolId, { teacherId });
}

/**
 * Get a specific allocation (by class and subject)
 */
export async function getAllocation(
  schoolId: number,
  classId: number,
  subjectId: number
): Promise<Allocation | null> {
  const allocations = await getAllocations(schoolId, { classId, subjectId });
  return allocations.length > 0 ? allocations[0] : null;
}

/**
 * Count allocations with optional filters
 */
export async function countAllocations(
  schoolId: number,
  filters?: AllocationFilter
): Promise<number> {
  const connection = await getConnection();
  try {
    let sql = `
      SELECT COUNT(DISTINCT cs.id) as total
      FROM class_subjects cs
      JOIN classes c ON cs.class_id = c.id
      JOIN subjects sub ON cs.subject_id = sub.id
      WHERE c.school_id = ? AND sub.school_id = ?
    `;
    const params: any[] = [schoolId, schoolId];

    if (filters?.classId) {
      sql += ' AND cs.class_id = ?';
      params.push(filters.classId);
    }

    if (filters?.subjectId) {
      sql += ' AND cs.subject_id = ?';
      params.push(filters.subjectId);
    }

    if (filters?.teacherId) {
      sql += ' AND cs.teacher_id = ?';
      params.push(filters.teacherId);
    }

    const [result] = await connection.execute(sql, params);
    return (result as any[])[0]?.total || 0;
  } finally {
    await connection.end();
  }
}

/**
 * Derive display initials for an allocation (custom > auto-generated)
 */
export function deriveDisplayInitials(
  customInitials: string | null,
  autoGeneratedInitials: string | null
): string {
  return customInitials || autoGeneratedInitials || '';
}

/**
 * Get initials for all subjects in a class (used for report headers)
 */
export async function getClassInitialsMap(
  schoolId: number,
  classId: number
): Promise<Map<number, string>> {
  const allocations = await getClassAllocations(schoolId, classId);
  const initialsMap = new Map<number, string>();

  for (const alloc of allocations) {
    initialsMap.set(
      alloc.subject_id,
      deriveDisplayInitials(alloc.custom_initials, alloc.auto_generated_initials)
    );
  }

  return initialsMap;
}
