/**
 * Phase E — Class-teacher assignment service.
 *
 * Time-bounded per-(class, term, stream) assignments. A stream_id NULL
 * row applies to every stream within the class. Reassignments don't
 * mutate the previous row — they set its `valid_until` and append a
 * new row, preserving the historical chain.
 *
 * The snapshot generator consults `getClassTeacherForSnapshot` at
 * generation time and writes the resolved staff name into
 * snapshot.classes[].classTeacher, keeping the renderer unchanged.
 */
import { query } from '@/lib/db';

export interface ClassTeacherAssignment {
  id:           number;
  schoolId:     number;
  classId:      number;
  streamId:     number | null;
  termId:       number;
  staffId:      number;
  staffName:    string;
  assignedBy:   number;
  assignedAt:   string;
  validUntil:   string | null;
  notes:        string | null;
}

interface RawRow {
  id:           number;
  school_id:    number;
  class_id:     number;
  stream_id:    number | null;
  term_id:      number;
  staff_id:     number;
  staff_name:   string;
  assigned_by:  number;
  assigned_at:  string | Date;
  valid_until:  string | Date | null;
  notes:        string | null;
}

const toIso = (v: string | Date) => typeof v === 'string' ? v : new Date(v).toISOString();

function toAssignment(r: RawRow): ClassTeacherAssignment {
  return {
    id:         r.id,
    schoolId:   r.school_id,
    classId:    r.class_id,
    streamId:   r.stream_id,
    termId:     r.term_id,
    staffId:    r.staff_id,
    staffName:  r.staff_name,
    assignedBy: r.assigned_by,
    assignedAt: toIso(r.assigned_at),
    validUntil: r.valid_until === null ? null : toIso(r.valid_until),
    notes:      r.notes,
  };
}

/**
 * List every assignment for a class (current + historical), most-recent
 * first. Used by the class detail page's "Class teacher history" panel.
 */
export async function listClassTeachers(args: {
  classId:  number;
  schoolId: number;
}): Promise<ClassTeacherAssignment[]> {
  const rows = (await query(
    `SELECT ct.id, ct.school_id, ct.class_id, ct.stream_id, ct.term_id,
            ct.staff_id, ct.assigned_by, ct.assigned_at, ct.valid_until, ct.notes,
            CONCAT_WS(' ', p.first_name, p.last_name) AS staff_name
       FROM class_teachers ct
       JOIN staff s  ON s.id = ct.staff_id
       JOIN people p ON p.id = s.person_id
      WHERE ct.class_id  = ?
        AND ct.school_id = ?
      ORDER BY ct.assigned_at DESC, ct.id DESC`,
    [args.classId, args.schoolId],
  )) as RawRow[];
  return rows.map(toAssignment);
}

/**
 * Resolve the class teacher for a snapshot's (class, term) pair. Returns
 * the assignment whose `valid_until` is NULL or in the future. Stream-
 * specific rows take precedence over class-wide rows when both exist
 * for the same term.
 */
export async function getClassTeacherForSnapshot(args: {
  classId:  number;
  termId:   number;
  schoolId: number;
  streamId?: number | null;
}): Promise<ClassTeacherAssignment | null> {
  const rows = (await query(
    `SELECT ct.id, ct.school_id, ct.class_id, ct.stream_id, ct.term_id,
            ct.staff_id, ct.assigned_by, ct.assigned_at, ct.valid_until, ct.notes,
            CONCAT_WS(' ', p.first_name, p.last_name) AS staff_name
       FROM class_teachers ct
       JOIN staff s  ON s.id = ct.staff_id
       JOIN people p ON p.id = s.person_id
      WHERE ct.class_id  = ?
        AND ct.term_id   = ?
        AND ct.school_id = ?
        AND (ct.valid_until IS NULL OR ct.valid_until > NOW())
        AND (ct.stream_id IS NULL OR ct.stream_id = ?)
      ORDER BY ct.stream_id IS NULL ASC, ct.assigned_at DESC
      LIMIT 1`,
    [args.classId, args.termId, args.schoolId, args.streamId ?? null],
  )) as RawRow[];
  return rows.length ? toAssignment(rows[0]) : null;
}

/**
 * Assign a new class teacher. If an active assignment exists for the
 * same (class, stream, term) it is closed first (`valid_until = NOW()`).
 * Append-only at the row level; reassignment never UPDATEs the staff_id.
 */
export async function assignClassTeacher(args: {
  classId:    number;
  streamId:   number | null;
  termId:     number;
  staffId:    number;
  schoolId:   number;
  assignedBy: number;
  notes?:     string | null;
}): Promise<number> {
  // Verify class belongs to school and staff belongs to school
  const owned = (await query(
    `SELECT
       (SELECT 1 FROM classes WHERE id = ? AND school_id = ? LIMIT 1) AS class_ok,
       (SELECT 1 FROM staff   WHERE id = ? AND school_id = ? LIMIT 1) AS staff_ok`,
    [args.classId, args.schoolId, args.staffId, args.schoolId],
  )) as Array<{ class_ok: number | null; staff_ok: number | null }>;
  if (!owned.length || !owned[0].class_ok) {
    const err: Error & { statusCode?: number } = new Error('Class not found in this school');
    err.statusCode = 404;
    throw err;
  }
  if (!owned[0].staff_ok) {
    const err: Error & { statusCode?: number } = new Error('Staff not found in this school');
    err.statusCode = 404;
    throw err;
  }

  // Close any active assignment for the same (class, stream, term).
  await query(
    `UPDATE class_teachers
        SET valid_until = NOW()
      WHERE class_id    = ?
        AND term_id     = ?
        AND school_id   = ?
        AND ${args.streamId === null ? 'stream_id IS NULL' : 'stream_id = ?'}
        AND valid_until IS NULL`,
    args.streamId === null
      ? [args.classId, args.termId, args.schoolId]
      : [args.classId, args.termId, args.schoolId, args.streamId],
  );

  const result = (await query(
    `INSERT INTO class_teachers
       (school_id, class_id, stream_id, term_id, staff_id,
        assigned_by, assigned_at, notes)
     VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)`,
    [
      args.schoolId, args.classId, args.streamId, args.termId, args.staffId,
      args.assignedBy, args.notes ?? null,
    ],
  )) as { insertId?: number };
  return Number(result?.insertId ?? 0);
}
