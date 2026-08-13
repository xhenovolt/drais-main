/**
 * /api/tahfiz/records/[id] — read, correct and remove ONE daily Tahfiz record.
 *
 * Replaces three 501 stubs. A record is a teacher's assessment of what a
 * learner recited on a given day; entering one with the wrong mark or against
 * the wrong learner is ordinary and frequent, and until now there was no way
 * to put it right from the record itself.
 *
 * The collection route already accepts a PATCH carrying `id` in the body; this
 * is the addressable form the register UI expects, and both write to the same
 * columns.
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

/** Columns a caller may set. Anything not listed here is not writable. */
const EDITABLE = [
  'plan_id', 'portion_id', 'group_id', 'book_id', 'teacher_id',
  'date', 'type', 'portion_text', 'rating', 'score', 'notes', 'status',
  'presented', 'presented_length', 'retention_score', 'mark',
] as const;

/** Numeric marks are bounded by the column (decimal(5,2)) and by meaning. */
const NUMERIC = new Set(['score', 'retention_score', 'mark', 'presented_length',
  'plan_id', 'portion_id', 'group_id', 'book_id', 'teacher_id']);

async function gate(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return { denied: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  const modDenied = await checkModule(session.schoolId, 'tahfiz');
  if (modDenied) return { denied: modDenied };
  return { session };
}

async function loadRecord(id: number, schoolId: number) {
  const rows = (await query(
    `SELECT r.*, TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS learner_name, s.admission_no
       FROM tahfiz_records r
       JOIN students s ON s.id = r.student_id
       JOIN people   p ON p.id = s.person_id
      WHERE r.id = ? AND r.school_id = ? LIMIT 1`,
    [id, schoolId],
  )) as any[];
  return rows[0] ?? null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied, session } = await gate(req);
  if (denied) return denied;

  const id = Number.parseInt((await params).id, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid record reference.' }, { status: 400 });

  const record = await loadRecord(id, session!.schoolId);
  if (!record) return NextResponse.json({ error: 'That record does not exist for this school.' }, { status: 404 });

  return NextResponse.json({ success: true, record });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied, session } = await gate(req);
  if (denied) return denied;

  const id = Number.parseInt((await params).id, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid record reference.' }, { status: 400 });

  const before = await loadRecord(id, session!.schoolId);
  if (!before) return NextResponse.json({ error: 'That record does not exist for this school.' }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const sets: string[] = [];
  const args: any[] = [];

  for (const col of EDITABLE) {
    if (body[col] === undefined) continue;
    let value: any = body[col];

    if (value === '' || value === null) {
      value = null;
    } else if (NUMERIC.has(col)) {
      const n = Number(value);
      if (!Number.isFinite(n)) {
        return NextResponse.json({ error: `${col.replace(/_/g, ' ')} must be a number.` }, { status: 400 });
      }
      // A mark outside 0–100 is a typo, not a grade. Refusing it here beats
      // storing it and having it distort a term's averages silently.
      if (['score', 'retention_score', 'mark'].includes(col) && (n < 0 || n > 100)) {
        return NextResponse.json({ error: `${col.replace(/_/g, ' ')} must be between 0 and 100.` }, { status: 400 });
      }
      value = n;
    } else if (col === 'presented') {
      value = value ? 1 : 0;
    } else {
      value = String(value);
    }

    sets.push(`${col} = ?`);
    args.push(value);
  }

  if (!sets.length) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });

  sets.push('updated_at = CURRENT_TIMESTAMP');
  args.push(id, session!.schoolId);

  await query(`UPDATE tahfiz_records SET ${sets.join(', ')} WHERE id = ? AND school_id = ?`, args);
  const after = await loadRecord(id, session!.schoolId);

  // A changed mark is exactly the kind of edit someone may later question, so
  // the previous values are recorded alongside the new ones.
  await logAudit({
    schoolId: session!.schoolId, userId: session!.userId,
    action: 'TAHFIZ_RECORD_UPDATED', entityType: 'tahfiz_record', entityId: id,
    details: { before, after },
  }).catch(() => {});

  return NextResponse.json({ success: true, record: after });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied, session } = await gate(req);
  if (denied) return denied;

  const id = Number.parseInt((await params).id, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid record reference.' }, { status: 400 });

  const record = await loadRecord(id, session!.schoolId);
  if (!record) return NextResponse.json({ error: 'That record does not exist for this school.' }, { status: 404 });

  // tahfiz_records carries no soft-delete columns, so this is permanent. The
  // whole record is written into the audit detail first — that log entry is
  // the only remaining copy, so it is written BEFORE the delete rather than
  // after, where a failure would lose it.
  await logAudit({
    schoolId: session!.schoolId, userId: session!.userId,
    action: 'TAHFIZ_RECORD_DELETED', entityType: 'tahfiz_record', entityId: id,
    details: { record, reason: (new URL(req.url).searchParams.get('reason') ?? '').slice(0, 255) || null },
  }).catch(() => {});

  await query(`DELETE FROM tahfiz_records WHERE id = ? AND school_id = ?`, [id, session!.schoolId]);

  return NextResponse.json({ success: true, deleted: id });
}
