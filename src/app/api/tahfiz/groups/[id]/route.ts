/**
 * /api/tahfiz/groups/[id] — read, rename and remove ONE halaqa group.
 *
 * Replaces three 501 "not yet implemented" stubs. Groups could be created and
 * listed but never corrected: a group with the wrong teacher or a mistyped
 * name stayed that way permanently, and there was no way to remove one made in
 * error. Combined with the same gap on learners and records, that is why
 * Tahfiz felt like it "did not work" — everything could be entered and
 * nothing could be changed.
 *
 * GATING: module check only, matching the sibling collection route
 * (/api/tahfiz/groups). Adding a permission gate here would lock the screen
 * for every non-super-admin, because every tahfiz.* permission currently has
 * zero role grants — a separate problem that must be fixed in the data, not
 * papered over by inconsistent gates.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { checkModule } from '@/lib/auth/requireModule';
import { query } from '@/lib/db';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

async function gate(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return { denied: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  const modDenied = await checkModule(session.schoolId, 'tahfiz');
  if (modDenied) return { denied: modDenied };
  return { session };
}

async function loadGroup(id: number, schoolId: number) {
  const rows = (await query(
    `SELECT id, school_id, name, teacher_id, notes, created_at, updated_at
       FROM tahfiz_groups WHERE id = ? AND school_id = ? LIMIT 1`,
    [id, schoolId],
  )) as any[];
  return rows[0] ?? null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied, session } = await gate(req);
  if (denied) return denied;

  const id = Number.parseInt((await params).id, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid group reference.' }, { status: 400 });

  const group = await loadGroup(id, session!.schoolId);
  if (!group) return NextResponse.json({ error: 'That group does not exist for this school.' }, { status: 404 });

  const members = (await query(
    `SELECT gm.id, gm.student_id, gm.status, gm.role, gm.joined_date,
            TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS learner_name,
            s.admission_no
       FROM tahfiz_group_members gm
       JOIN students s ON s.id = gm.student_id AND s.deleted_at IS NULL
       JOIN people   p ON p.id = s.person_id AND p.deleted_at IS NULL
      WHERE gm.group_id = ? AND gm.school_id = ?
      ORDER BY learner_name`,
    [id, session!.schoolId],
  ).catch(() => [])) as any[];

  return NextResponse.json({ success: true, group: { ...group, members } });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied, session } = await gate(req);
  if (denied) return denied;

  const id = Number.parseInt((await params).id, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid group reference.' }, { status: 400 });

  const before = await loadGroup(id, session!.schoolId);
  if (!before) return NextResponse.json({ error: 'That group does not exist for this school.' }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const sets: string[] = [];
  const args: any[] = [];

  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 100);
    if (!name) return NextResponse.json({ error: 'A group needs a name.' }, { status: 400 });
    sets.push('name = ?'); args.push(name);
  }
  if (body.teacher_id !== undefined) {
    const t = Number(body.teacher_id);
    // teacher_id is NOT NULL, so an empty selection must be refused rather
    // than written as null and rejected by the database as a 500.
    if (!Number.isFinite(t)) return NextResponse.json({ error: 'Choose a teacher for this group.' }, { status: 400 });
    sets.push('teacher_id = ?'); args.push(t);
  }
  if (body.notes !== undefined) {
    sets.push('notes = ?'); args.push(body.notes ? String(body.notes) : null);
  }

  if (!sets.length) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });

  sets.push('updated_at = CURRENT_TIMESTAMP');
  args.push(id, session!.schoolId);

  await query(`UPDATE tahfiz_groups SET ${sets.join(', ')} WHERE id = ? AND school_id = ?`, args);
  const after = await loadGroup(id, session!.schoolId);

  await logAudit({
    schoolId: session!.schoolId, userId: session!.userId,
    action: 'TAHFIZ_GROUP_UPDATED', entityType: 'tahfiz_group', entityId: id,
    details: { before, after },
  }).catch(() => {});

  return NextResponse.json({ success: true, group: after });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied, session } = await gate(req);
  if (denied) return denied;

  const id = Number.parseInt((await params).id, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid group reference.' }, { status: 400 });

  const group = await loadGroup(id, session!.schoolId);
  if (!group) return NextResponse.json({ error: 'That group does not exist for this school.' }, { status: 404 });

  // tahfiz_groups has no soft-delete columns, so removal is permanent. Refuse
  // while the group still holds members or recorded work — a halaqa's daily
  // records are the evidence a learner was taught, and deleting the group out
  // from under them strands that history with no way back.
  const counts = (await query(
    `SELECT
       (SELECT COUNT(*) FROM tahfiz_group_members WHERE group_id = ? AND school_id = ?) AS members,
       (SELECT COUNT(*) FROM tahfiz_records       WHERE group_id = ? AND school_id = ?) AS records`,
    [id, session!.schoolId, id, session!.schoolId],
  ).catch(() => [{ members: 0, records: 0 }])) as any[];

  const members = Number(counts[0]?.members ?? 0);
  const records = Number(counts[0]?.records ?? 0);
  if (members || records) {
    return NextResponse.json({
      error: `“${group.name}” still has ${members} member${members === 1 ? '' : 's'} and ${records} record${records === 1 ? '' : 's'}. `
           + `Move the learners to another group first — deleting it here is permanent and would strand that work.`,
      in_use: { members, records },
    }, { status: 409 });
  }

  await query(`DELETE FROM tahfiz_groups WHERE id = ? AND school_id = ?`, [id, session!.schoolId]);

  await logAudit({
    schoolId: session!.schoolId, userId: session!.userId,
    action: 'TAHFIZ_GROUP_DELETED', entityType: 'tahfiz_group', entityId: id,
    details: { group },
  }).catch(() => {});

  return NextResponse.json({ success: true, deleted: group.name });
}
