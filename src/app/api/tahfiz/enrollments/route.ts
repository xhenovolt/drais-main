/**
 * Tahfiz participation (enrollment) — the canonical "who is in Tahfiz" surface.
 *
 * GET  /api/tahfiz/enrollments            list participants (+ ?summary=1 for counts)
 * POST /api/tahfiz/enrollments            enroll an EXISTING student as a participant
 *
 * Participation is independent of academic enrollment (supports academic-only,
 * academic+tahfiz, and tahfiz-only learners). Removing a participant is a
 * status change / soft-delete here — never a delete of the students row.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query } from '@/lib/db';

const TRACKS   = ['academic_plus_tahfiz', 'tahfiz_only'];
const STATUSES = ['active', 'suspended', 'withdrawn', 'completed'];

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;
  const url = new URL(req.url);

  if (url.searchParams.get('summary') === '1') {
    const rows = (await query(
      `SELECT status, track, COUNT(*) AS n
         FROM tahfiz_enrollments
        WHERE school_id = ? AND deleted_at IS NULL
        GROUP BY status, track`,
      [schoolId],
    )) as any[];
    const summary = { total: 0, active: 0, suspended: 0, withdrawn: 0, completed: 0, academic_plus_tahfiz: 0, tahfiz_only: 0 };
    for (const r of rows) {
      const n = Number(r.n);
      summary.total += n;
      if (r.status in summary) (summary as any)[r.status] += n;
      if (r.track in summary) (summary as any)[r.track] += n;
    }
    return NextResponse.json({ success: true, summary });
  }

  const status = url.searchParams.get('status');
  const statusClause = status && STATUSES.includes(status) ? 'AND te.status = ?' : '';
  const params: any[] = [schoolId];
  if (statusClause) params.push(status);

  const rows = (await query(
    `SELECT te.id, te.student_id, te.track, te.program, te.status,
            te.joined_date, te.left_date, te.notes,
            TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS learner_name,
            s.admission_no, c.name AS class_name
       FROM tahfiz_enrollments te
       JOIN students s ON s.id = te.student_id AND s.deleted_at IS NULL
       LEFT JOIN people p  ON p.id = s.person_id
       LEFT JOIN classes c ON c.id = s.class_id
      WHERE te.school_id = ? AND te.deleted_at IS NULL ${statusClause}
      ORDER BY te.status ASC, learner_name ASC
      LIMIT 1000`,
    params,
  )) as any[];

  return NextResponse.json({
    success: true,
    participants: rows.map(r => ({
      id: r.id, student_id: r.student_id,
      learner_name: r.learner_name || `Learner #${r.student_id}`,
      admission_no: r.admission_no, class_name: r.class_name,
      track: r.track, program: r.program, status: r.status,
      joined_date: r.joined_date, left_date: r.left_date, notes: r.notes,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'tahfiz.records.manage', session.isSuperAdmin);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const schoolId = session.schoolId;
  const body = await req.json().catch(() => null);
  const studentId = Number(body?.student_id);
  const track = TRACKS.includes(body?.track) ? body.track : 'academic_plus_tahfiz';
  const program = (body?.program ? String(body.program) : 'hifz').slice(0, 50);
  const notes = body?.notes ? String(body.notes) : null;
  if (!studentId) return NextResponse.json({ error: 'student_id is required' }, { status: 400 });

  // The student must exist in THIS school (no cross-school enrollment).
  const stu = (await query(
    `SELECT id FROM students WHERE id = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1`,
    [studentId, schoolId],
  )) as any[];
  if (!stu.length) return NextResponse.json({ error: 'Student not found in this school' }, { status: 404 });

  // Idempotent: re-enrolling an existing (incl. withdrawn) participant reactivates them.
  await query(
    `INSERT INTO tahfiz_enrollments (school_id, student_id, track, program, status, joined_date, notes, created_by)
       VALUES (?, ?, ?, ?, 'active', CURDATE(), ?, ?)
     ON DUPLICATE KEY UPDATE
       status = 'active', track = VALUES(track), program = VALUES(program),
       left_date = NULL, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL,
       notes = VALUES(notes), updated_at = NOW()`,
    [schoolId, studentId, track, program, notes, session.userId],
  );

  return NextResponse.json({ success: true, message: 'Learner enrolled in Tahfiz.' });
}
