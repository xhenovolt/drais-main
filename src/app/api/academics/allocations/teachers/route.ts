/**
 * Many-to-many teacher allocations for a subject/class (each row = one teacher).
 * Unlike POST /api/academics/allocations (which supersedes to one active teacher),
 * this ADDS teachers so a subject/class can have primary + assistants etc.
 *
 * GET    ?class_id=&subject_id=   — active teachers on this subject/class
 * POST   { class_id, subject_id, teacher_id, allocation_role?, custom_initials?, display_on_report?, stream_id?, term_id? }
 * PATCH  ?id=  { allocation_role?, custom_initials?, display_on_report? }
 * DELETE ?id=  — remove (supersede) one allocation
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query } from '@/lib/db';
import { resolveTeacherInitials } from '@/lib/reports/canonical-report-engine';

export const runtime = 'nodejs';

const ROLES = ['primary_teacher', 'assistant_teacher', 'practical_teacher', 'theory_teacher', 'examiner', 'substitute', 'hod'];

async function guard(req: NextRequest, perm: string) {
  const session = await getSessionSchoolId(req);
  if (!session) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  try { await requirePermission(session.userId, session.schoolId, perm, session.isSuperAdmin); }
  catch (e) { return { error: NextResponse.json({ error: (e as Error).message }, { status: 403 }) }; }
  return { session };
}

/** Keep at most one active primary per (class,subject): demote the others. */
async function demoteOtherPrimaries(classId: number, subjectId: number, keepId: number | null) {
  await query(
    `UPDATE class_subjects SET allocation_role='assistant_teacher'
      WHERE class_id=? AND subject_id=? AND allocation_role='primary_teacher'
        AND (valid_to IS NULL OR valid_to > CURDATE()) ${keepId ? 'AND id <> ?' : ''}`,
    keepId ? [classId, subjectId, keepId] : [classId, subjectId],
  );
}

export async function GET(req: NextRequest) {
  const g = await guard(req, 'academics.allocations.view'); if ('error' in g) return g.error;
  const sp = req.nextUrl.searchParams;
  const classId = Number(sp.get('class_id')); const subjectId = Number(sp.get('subject_id'));
  if (!classId || !subjectId) return NextResponse.json({ error: 'class_id and subject_id required' }, { status: 400 });
  const rows = await query(
    `SELECT cs.id, cs.teacher_id, cs.allocation_role, cs.custom_initials, cs.display_on_report, cs.stream_id,
            TRIM(CONCAT(COALESCE(p.first_name,''),' ',COALESCE(p.last_name,''))) AS teacher_name,
            NULLIF(CONCAT(COALESCE(LEFT(p.first_name,1),''),COALESCE(LEFT(p.last_name,1),'')),'') AS auto_initials
       FROM class_subjects cs
       LEFT JOIN staff s ON s.id = cs.teacher_id
       LEFT JOIN people p ON p.id = s.person_id
      WHERE cs.class_id=? AND cs.subject_id=? AND (cs.valid_to IS NULL OR cs.valid_to > CURDATE())
        AND (cs.status IS NULL OR cs.status='active')
      ORDER BY (cs.allocation_role='primary_teacher') DESC, cs.id ASC`,
    [classId, subjectId],
  );

  const normalizedRows = rows.map((row: any) => {
    const autoInitials = resolveTeacherInitials({
      allocationInitials: row.custom_initials,
      teacherName: row.teacher_name,
      teacherInitials: row.auto_initials,
    });

    return {
      ...row,
      auto_initials: autoInitials === 'N/A' ? '' : autoInitials,
    };
  });

  return NextResponse.json({ success: true, rows: normalizedRows });
}

export async function POST(req: NextRequest) {
  const g = await guard(req, 'academics.allocations.manage'); if ('error' in g) return g.error;
  const b = await req.json().catch(() => null);
  if (!b?.class_id || !b?.subject_id || !b?.teacher_id) return NextResponse.json({ error: 'class_id, subject_id, teacher_id required' }, { status: 400 });
  const role = ROLES.includes(b.allocation_role) ? b.allocation_role : 'assistant_teacher';
  const res: any = await query(
    `INSERT INTO class_subjects (class_id, subject_id, teacher_id, custom_initials, allocation_role, display_on_report, stream_id, term_id, valid_from, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), 'active', ?)`,
    [b.class_id, b.subject_id, b.teacher_id, b.custom_initials || null, role, b.display_on_report === false ? 0 : 1, b.stream_id ?? null, b.term_id ?? null, g.session.userId ?? null],
  );
  if (role === 'primary_teacher') await demoteOtherPrimaries(b.class_id, b.subject_id, res.insertId);
  return NextResponse.json({ success: true, id: res.insertId }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const g = await guard(req, 'academics.allocations.manage'); if ('error' in g) return g.error;
  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const sets: string[] = []; const params: any[] = [];
  if (b.allocation_role && ROLES.includes(b.allocation_role)) { sets.push('allocation_role=?'); params.push(b.allocation_role); }
  if (b.custom_initials !== undefined) { sets.push('custom_initials=?'); params.push(b.custom_initials || null); }
  if (b.display_on_report !== undefined) { sets.push('display_on_report=?'); params.push(b.display_on_report ? 1 : 0); }
  if (!sets.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  params.push(id);
  await query(`UPDATE class_subjects SET ${sets.join(', ')} WHERE id=?`, params);
  if (b.allocation_role === 'primary_teacher') {
    const [row]: any = await query(`SELECT class_id, subject_id FROM class_subjects WHERE id=?`, [id]);
    if (row) await demoteOtherPrimaries(row.class_id, row.subject_id, id);
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const g = await guard(req, 'academics.allocations.manage'); if ('error' in g) return g.error;
  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await query(`UPDATE class_subjects SET valid_to=CURDATE() WHERE id=? AND valid_to IS NULL`, [id]);
  return NextResponse.json({ success: true });
}
