import { NextResponse } from 'next/server';
import { resolveTeacherInitials } from '@/lib/reports/canonical-report-engine';

/**
 * local-sqlite branch — Phase 7 sub-effort 42, same §25a pattern as
 * src/app/api/class-subjects/route.ts (sub-effort 40). Mirrors the online
 * route's exact Phase D semantics (supersede-on-write, valid_from/valid_to
 * history, as_of time-travel) rather than the simpler offline-academics
 * module's status/superseded_by model — the two are deliberately different
 * features (see docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md's
 * sub-effort 42 entry) and this route's online contract is what the real
 * Teacher Allocation page and History page actually depend on.
 *
 * `getSqliteDb()` is better-sqlite3 — synchronous, no `connection.execute()`
 * round-trips — so these helpers inline the same ownership checks
 * `@/lib/allocation-validation` does for the online path rather than
 * reusing it directly (its functions are written against an async
 * MySQL-style connection).
 */

async function db() {
  const { getSqliteDb } = await import('@/lib/repo/sqlite/singleton');
  return getSqliteDb();
}

interface OwnershipArgs {
  class_id: number;
  subject_id: number;
  teacher_id: number | null;
}

function assertOwnership(sdb: any, schoolId: number, { class_id, subject_id, teacher_id }: OwnershipArgs): string | null {
  const cls = sdb.prepare(`SELECT id FROM classes WHERE id = ? AND school_id = ? AND deleted_at IS NULL`).get(class_id, schoolId);
  if (!cls) return 'The selected class does not belong to your school.';
  const subj = sdb.prepare(`SELECT id FROM subjects WHERE id = ? AND school_id = ? AND deleted_at IS NULL`).get(subject_id, schoolId);
  if (!subj) return 'The selected subject does not belong to your school.';
  if (teacher_id) {
    const staff = sdb.prepare(`SELECT id FROM staff WHERE id = ? AND school_id = ? AND deleted_at IS NULL`).get(teacher_id, schoolId);
    if (!staff) return 'The selected teacher does not belong to your school.';
  }
  return null;
}

function mapAllocationRow(r: any) {
  const displayInitials = resolveTeacherInitials({
    allocationInitials: r.custom_initials,
    teacherName: r.teacher_name,
    teacherInitials: r.auto_generated_initials,
  });
  return {
    id: r.id,
    class_id: r.class_id,
    subject_id: r.subject_id,
    teacher_id: r.teacher_id,
    custom_initials: r.custom_initials,
    class_name: r.class_name,
    subject_name: r.subject_name,
    subject_code: r.subject_code ?? undefined,
    teacher_name: r.teacher_name || 'Unassigned',
    display_initials: displayInitials === 'N/A' ? '' : displayInitials,
  };
}

const ALLOCATION_SELECT = `
  SELECT
    cs.id, cs.class_id, cs.subject_id, cs.teacher_id, cs.custom_initials,
    cs.valid_from, cs.valid_to, cs.term_id,
    c.name AS class_name,
    sub.name AS subject_name,
    sub.code AS subject_code,
    (UPPER(SUBSTR(p.first_name,1,1)) || UPPER(SUBSTR(p.last_name,1,1))) AS auto_generated_initials,
    (p.first_name || ' ' || p.last_name) AS teacher_name
  FROM class_subjects cs
  JOIN classes c ON cs.class_id = c.id
  JOIN subjects sub ON cs.subject_id = sub.id
  LEFT JOIN staff s ON cs.teacher_id = s.id
  LEFT JOIN people p ON s.person_id = p.id
`;

export async function offlineGetAllocations(
  schoolId: number,
  opts: { classId: string | null; subjectId: string | null; teacherId: string | null; asOfTerm: string | null; asOfDate: string | null; showHistory: boolean },
) {
  const sdb = await db();

  let resolvedAsOf: string | null = null;
  if (opts.asOfTerm) {
    const t = sdb.prepare(`SELECT start_date FROM terms WHERE id = ? AND school_id = ?`).get(opts.asOfTerm, schoolId) as any;
    if (t) resolvedAsOf = t.start_date;
  } else if (opts.asOfDate) {
    resolvedAsOf = opts.asOfDate;
  }

  const whereClauses: string[] = ['c.school_id = ?'];
  const params: any[] = [schoolId];

  if (resolvedAsOf) {
    whereClauses.push('cs.valid_from <= ?');
    whereClauses.push('(cs.valid_to IS NULL OR cs.valid_to > ?)');
    params.push(resolvedAsOf, resolvedAsOf);
  } else if (!opts.showHistory) {
    whereClauses.push('cs.valid_to IS NULL');
  }

  if (opts.classId) { whereClauses.push('cs.class_id = ?'); params.push(opts.classId); }
  if (opts.subjectId) { whereClauses.push('cs.subject_id = ?'); params.push(opts.subjectId); }
  if (opts.teacherId) { whereClauses.push('cs.teacher_id = ?'); params.push(opts.teacherId); }

  const rows = sdb.prepare(
    `${ALLOCATION_SELECT} WHERE ${whereClauses.join(' AND ')} ORDER BY c.name ASC, sub.name ASC, cs.valid_from DESC`
  ).all(...params) as any[];

  const allocations = rows.map(mapAllocationRow);
  return NextResponse.json({ success: true, data: allocations, count: allocations.length });
}

export async function offlineCreateAllocation(
  schoolId: number,
  input: { class_id: number; subject_id: number; teacher_id: number | null; custom_initials: string | null },
) {
  const sdb = await db();
  const ownershipError = assertOwnership(sdb, schoolId, input);
  if (ownershipError) return NextResponse.json({ success: false, message: ownershipError }, { status: 400 });

  const newId = sdb.transaction(() => {
    sdb.prepare(
      `UPDATE class_subjects SET valid_to = date('now') WHERE class_id = ? AND subject_id = ? AND valid_to IS NULL`
    ).run(input.class_id, input.subject_id);
    const result = sdb.prepare(
      `INSERT INTO class_subjects (class_id, subject_id, teacher_id, custom_initials, valid_from, valid_to)
       VALUES (?, ?, ?, ?, date('now'), NULL)`
    ).run(input.class_id, input.subject_id, input.teacher_id, input.custom_initials);
    return result.lastInsertRowid as number;
  })();

  const record = sdb.prepare(`${ALLOCATION_SELECT} WHERE cs.id = ?`).get(newId) as any;
  if (!record) {
    return NextResponse.json({ success: false, message: 'Failed to create allocation.' }, { status: 400 });
  }
  return NextResponse.json({ success: true, data: mapAllocationRow(record) }, { status: 201 });
}

export async function offlineUpdateAllocation(
  schoolId: number,
  input: { id: number; class_id: number; subject_id: number; teacher_id: number | null; custom_initials: string | null },
) {
  const sdb = await db();

  const owned = sdb.prepare(
    `SELECT cs.id FROM class_subjects cs JOIN classes c ON cs.class_id = c.id WHERE cs.id = ? AND c.school_id = ?`
  ).get(input.id, schoolId);
  if (!owned) return NextResponse.json({ success: false, message: 'Assignment not found for your school.' }, { status: 404 });

  const ownershipError = assertOwnership(sdb, schoolId, input);
  if (ownershipError) return NextResponse.json({ success: false, message: ownershipError }, { status: 400 });

  const newId = sdb.transaction(() => {
    sdb.prepare(`UPDATE class_subjects SET valid_to = date('now') WHERE id = ?`).run(input.id);
    const result = sdb.prepare(
      `INSERT INTO class_subjects (class_id, subject_id, teacher_id, custom_initials, valid_from, valid_to)
       VALUES (?, ?, ?, ?, date('now'), NULL)`
    ).run(input.class_id, input.subject_id, input.teacher_id, input.custom_initials);
    return result.lastInsertRowid as number;
  })();

  const record = sdb.prepare(`${ALLOCATION_SELECT} WHERE cs.id = ?`).get(newId) as any;
  if (!record) {
    return NextResponse.json({ success: false, message: 'Failed to update allocation.' }, { status: 400 });
  }
  return NextResponse.json({ success: true, data: mapAllocationRow(record) });
}

export async function offlineDeleteAllocation(schoolId: number, id: number) {
  const sdb = await db();
  const owned = sdb.prepare(
    `SELECT cs.id FROM class_subjects cs JOIN classes c ON cs.class_id = c.id WHERE cs.id = ? AND c.school_id = ?`
  ).get(id, schoolId);
  if (!owned) return NextResponse.json({ success: false, message: 'Assignment not found for your school.' }, { status: 404 });

  sdb.prepare(`DELETE FROM class_subjects WHERE id = ?`).run(id);
  return NextResponse.json({ success: true, message: 'Allocation deleted successfully.' });
}
