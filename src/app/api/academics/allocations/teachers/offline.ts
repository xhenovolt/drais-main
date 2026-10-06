import { NextResponse } from 'next/server';
import { resolveTeacherInitials } from '@/lib/reports/canonical-report-engine';

/**
 * local-sqlite branch — Phase 7 sub-effort 42, same §25a pattern as the
 * sibling allocations/offline.ts and allocations/bulk/offline.ts. SQLite
 * accepts the online route's own `ORDER BY (expr) DESC` boolean-as-integer
 * idiom unchanged; only CONCAT/LEFT/CURDATE() needed translating to
 * `||`/SUBSTR/`date('now')`.
 */
async function db() {
  const { getSqliteDb } = await import('@/lib/repo/sqlite/singleton');
  return getSqliteDb();
}

async function demoteOtherPrimaries(classId: number, subjectId: number, keepId: number | null) {
  const sdb = await db();
  const sql = `UPDATE class_subjects SET allocation_role='assistant_teacher'
      WHERE class_id=? AND subject_id=? AND allocation_role='primary_teacher'
        AND (valid_to IS NULL OR valid_to > date('now')) ${keepId ? 'AND id <> ?' : ''}`;
  sdb.prepare(sql).run(...(keepId ? [classId, subjectId, keepId] : [classId, subjectId]));
}

export async function getTeachers(classId: number, subjectId: number) {
  const sdb = await db();
  const rows = sdb.prepare(
    `SELECT cs.id, cs.teacher_id, cs.allocation_role, cs.custom_initials, cs.display_on_report, cs.stream_id,
            TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')) AS teacher_name,
            NULLIF(COALESCE(SUBSTR(p.first_name,1,1),'') || COALESCE(SUBSTR(p.last_name,1,1),''), '') AS auto_initials
       FROM class_subjects cs
       LEFT JOIN staff s ON s.id = cs.teacher_id
       LEFT JOIN people p ON p.id = s.person_id
      WHERE cs.class_id=? AND cs.subject_id=? AND (cs.valid_to IS NULL OR cs.valid_to > date('now'))
        AND (cs.status IS NULL OR cs.status='active')
      ORDER BY (cs.allocation_role='primary_teacher') DESC, cs.id ASC`
  ).all(classId, subjectId) as any[];

  const normalizedRows = rows.map((row) => {
    const autoInitials = resolveTeacherInitials({
      allocationInitials: row.custom_initials,
      teacherName: row.teacher_name,
      teacherInitials: row.auto_initials,
    });
    return { ...row, auto_initials: autoInitials === 'N/A' ? '' : autoInitials };
  });

  return NextResponse.json({ success: true, rows: normalizedRows });
}

export async function addTeacher(schoolId: number, userId: number | null, role: string, b: any) {
  const sdb = await db();
  const result = sdb.prepare(
    `INSERT INTO class_subjects (class_id, subject_id, teacher_id, custom_initials, allocation_role, display_on_report, stream_id, term_id, valid_from, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, date('now'), 'active', ?)`
  ).run(b.class_id, b.subject_id, b.teacher_id, b.custom_initials || null, role, b.display_on_report === false ? 0 : 1, b.stream_id ?? null, b.term_id ?? null, userId ?? null);

  if (role === 'primary_teacher') await demoteOtherPrimaries(b.class_id, b.subject_id, result.lastInsertRowid as number);
  return NextResponse.json({ success: true, id: result.lastInsertRowid }, { status: 201 });
}

export async function patchTeacher(id: number, b: any) {
  const ROLES = ['primary_teacher', 'assistant_teacher', 'practical_teacher', 'theory_teacher', 'examiner', 'substitute', 'hod'];
  const sdb = await db();
  const sets: string[] = []; const params: any[] = [];
  if (b.allocation_role && ROLES.includes(b.allocation_role)) { sets.push('allocation_role=?'); params.push(b.allocation_role); }
  if (b.custom_initials !== undefined) { sets.push('custom_initials=?'); params.push(b.custom_initials || null); }
  if (b.display_on_report !== undefined) { sets.push('display_on_report=?'); params.push(b.display_on_report ? 1 : 0); }
  if (!sets.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  params.push(id);
  sdb.prepare(`UPDATE class_subjects SET ${sets.join(', ')} WHERE id=?`).run(...params);

  if (b.allocation_role === 'primary_teacher') {
    const row = sdb.prepare(`SELECT class_id, subject_id FROM class_subjects WHERE id=?`).get(id) as any;
    if (row) await demoteOtherPrimaries(row.class_id, row.subject_id, id);
  }
  return NextResponse.json({ success: true });
}

export async function removeTeacher(id: number) {
  const sdb = await db();
  sdb.prepare(`UPDATE class_subjects SET valid_to=date('now') WHERE id=? AND valid_to IS NULL`).run(id);
  return NextResponse.json({ success: true });
}
