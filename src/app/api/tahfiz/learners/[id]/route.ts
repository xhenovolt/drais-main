/**
 * /api/tahfiz/learners/[id] — read, amend and withdraw ONE Tahfiz enrolment.
 *
 * `id` is a tahfiz_enrollments id, not a student id: a learner's ACADEMIC
 * record is not owned by this module, and editing here must never reach into
 * `students` or `people`. What a school changes here is the learner's
 * participation — track, programme, status, dates, notes.
 *
 * Replaces three 501 stubs. A learner enrolled onto the wrong track or
 * programme could not be corrected and could not be withdrawn, so the only
 * remedy was to leave the wrong record in place.
 *
 * DELETE is soft (the deleted_at / deleted_by / delete_reason columns exist and
 * the list route already filters on them). Withdrawal is usually the better
 * answer and is available through PUT with status = 'withdrawn', which keeps
 * the learner's history visible instead of hiding it.
 *
 * GATING: module check only, matching the sibling collection route. Every
 * tahfiz.* permission currently has zero role grants, so a stricter gate here
 * would lock out every non-super-admin.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { checkModule } from '@/lib/auth/requireModule';
import { query } from '@/lib/db';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const TRACKS = ['academic_plus_tahfiz', 'tahfiz_only'];
const STATUSES = ['active', 'suspended', 'withdrawn', 'completed'];

async function gate(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return { denied: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  const modDenied = await checkModule(session.schoolId, 'tahfiz');
  if (modDenied) return { denied: modDenied };
  return { session };
}

async function loadEnrolment(id: number, schoolId: number) {
  const rows = (await query(
    `SELECT e.id, e.school_id, e.student_id, e.track, e.program, e.status,
            e.joined_date, e.left_date, e.notes,
            TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS learner_name,
            s.admission_no
       FROM tahfiz_enrollments e
       JOIN students s ON s.id = e.student_id
       JOIN people   p ON p.id = s.person_id
      WHERE e.id = ? AND e.school_id = ? AND e.deleted_at IS NULL
      LIMIT 1`,
    [id, schoolId],
  )) as any[];
  return rows[0] ?? null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied, session } = await gate(req);
  if (denied) return denied;

  const id = Number.parseInt((await params).id, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid enrolment reference.' }, { status: 400 });

  const enrolment = await loadEnrolment(id, session!.schoolId);
  if (!enrolment) return NextResponse.json({ error: 'That enrolment does not exist for this school.' }, { status: 404 });

  return NextResponse.json({ success: true, learner: enrolment });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied, session } = await gate(req);
  if (denied) return denied;

  const id = Number.parseInt((await params).id, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid enrolment reference.' }, { status: 400 });

  const before = await loadEnrolment(id, session!.schoolId);
  if (!before) return NextResponse.json({ error: 'That enrolment does not exist for this school.' }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const sets: string[] = [];
  const args: any[] = [];

  if (body.track !== undefined) {
    if (!TRACKS.includes(body.track)) {
      return NextResponse.json({ error: `Track must be one of: ${TRACKS.join(', ')}.` }, { status: 400 });
    }
    sets.push('track = ?'); args.push(body.track);
  }
  if (body.program !== undefined) {
    const program = String(body.program).trim().slice(0, 50);
    if (!program) return NextResponse.json({ error: 'A programme is required.' }, { status: 400 });
    sets.push('program = ?'); args.push(program);
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: `Status must be one of: ${STATUSES.join(', ')}.` }, { status: 400 });
    }
    sets.push('status = ?'); args.push(body.status);
    // Leaving a programme without a leaving date makes reporting guess. Stamp
    // it if the caller did not, and clear it on a return to active.
    if ((body.status === 'withdrawn' || body.status === 'completed') && body.left_date === undefined) {
      sets.push('left_date = COALESCE(left_date, CURRENT_DATE)');
    }
    if (body.status === 'active' && body.left_date === undefined) {
      sets.push('left_date = NULL');
    }
  }
  if (body.joined_date !== undefined) {
    sets.push('joined_date = ?'); args.push(body.joined_date || null);
  }
  if (body.left_date !== undefined) {
    sets.push('left_date = ?'); args.push(body.left_date || null);
  }
  if (body.notes !== undefined) {
    sets.push('notes = ?'); args.push(body.notes ? String(body.notes) : null);
  }

  if (!sets.length) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });

  sets.push('updated_at = CURRENT_TIMESTAMP');
  args.push(id, session!.schoolId);

  await query(`UPDATE tahfiz_enrollments SET ${sets.join(', ')} WHERE id = ? AND school_id = ?`, args);
  const after = await loadEnrolment(id, session!.schoolId);

  await logAudit({
    schoolId: session!.schoolId, userId: session!.userId,
    action: 'TAHFIZ_ENROLMENT_UPDATED', entityType: 'tahfiz_enrollment', entityId: id,
    details: { before, after },
  }).catch(() => {});

  return NextResponse.json({ success: true, learner: after });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied, session } = await gate(req);
  if (denied) return denied;

  const id = Number.parseInt((await params).id, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid enrolment reference.' }, { status: 400 });

  const enrolment = await loadEnrolment(id, session!.schoolId);
  if (!enrolment) return NextResponse.json({ error: 'That enrolment does not exist for this school.' }, { status: 404 });

  // Soft delete, and only for an enrolment carrying no recorded work. Where a
  // learner has been assessed, the honest action is withdrawal (PUT status =
  // 'withdrawn'), which keeps the record and its history. Removing it would
  // hide months of memorisation from every report that should still show it.
  const recs = (await query(
    `SELECT COUNT(*) AS n FROM tahfiz_records WHERE student_id = ? AND school_id = ?`,
    [enrolment.student_id, session!.schoolId],
  ).catch(() => [{ n: 0 }])) as any[];

  const n = Number(recs[0]?.n ?? 0);
  if (n > 0) {
    return NextResponse.json({
      error: `${enrolment.learner_name} has ${n} Tahfiz record${n === 1 ? '' : 's'}. `
           + `Set the enrolment to “withdrawn” instead — that keeps the work on the learner's history.`,
      in_use: { records: n },
    }, { status: 409 });
  }

  const reason = (new URL(req.url).searchParams.get('reason') ?? '').slice(0, 255) || null;

  await query(
    `UPDATE tahfiz_enrollments
        SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?, delete_reason = ?
      WHERE id = ? AND school_id = ?`,
    [session!.userId, reason, id, session!.schoolId],
  );

  await logAudit({
    schoolId: session!.schoolId, userId: session!.userId,
    action: 'TAHFIZ_ENROLMENT_DELETED', entityType: 'tahfiz_enrollment', entityId: id,
    details: { enrolment, reason },
  }).catch(() => {});

  return NextResponse.json({ success: true, deleted: enrolment.learner_name });
}
