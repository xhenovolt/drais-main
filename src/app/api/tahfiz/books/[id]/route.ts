/**
 * /api/tahfiz/books/[id] — read, edit and retire ONE custom (school-owned) book.
 *
 * WHY THIS EXISTS
 * All three methods here returned 501 "not yet implemented" while the Books
 * screen happily let a school CREATE custom books. A book created with a typo
 * in its title, or with the wrong structure type, was permanent and
 * unremovable — and because plans, portions and records all hang off a book,
 * a wrong book quietly becomes a wrong curriculum for every learner assigned
 * to it. Creating without editing is the dangerous half of a pair.
 *
 * GLOBAL BOOKS ARE NOT EDITABLE HERE, deliberately. `tahfiz_global_books`
 * holds shared canonical reference data (the Qur'an's 114 surahs are not a
 * per-school opinion). A school changes its *local* presentation of a global
 * book — the display name and teaching order — through
 * /api/tahfiz/books/enable, which writes to tahfiz_school_books.
 *
 * DELETE is a SOFT delete. The columns exist (deleted_at / deleted_by /
 * delete_reason) and the catalogue already filters on them, so a retired book
 * disappears from the picker while any plan or record that referenced it can
 * still be read back. A hard delete would strand that history.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { checkPermission } from '@/lib/rbac';
import { checkModule } from '@/lib/auth/requireModule';
import { query } from '@/lib/db';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const TYPES = ['ordered_lessons', 'versed_poem', 'chaptered_text'] as const;

/** Session + module + (optionally) permission, or the response that refuses. */
async function gate(req: NextRequest, permission?: string) {
  const session = await getSessionSchoolId(req);
  if (!session) return { denied: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };

  const modDenied = await checkModule(session.schoolId, 'tahfiz');
  if (modDenied) return { denied: modDenied };

  if (permission) {
    // Return-based, so a permission failure reads as 403 with its own wording
    // rather than falling into a catch and being reported as a server error.
    const denied = await checkPermission(session.userId, session.schoolId, permission, session.isSuperAdmin);
    if (denied) return { denied };
  }
  return { session };
}

/** Loads a custom book scoped to the caller's school. Never trusts the id alone. */
async function loadBook(id: number, schoolId: number) {
  const rows = (await query(
    `SELECT id, school_id, title, structure_type, unit_label, total_units, teaching_order, status
       FROM tahfiz_custom_books
      WHERE id = ? AND school_id = ? AND deleted_at IS NULL
      LIMIT 1`,
    [id, schoolId],
  )) as any[];
  return rows[0] ?? null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied, session } = await gate(req, 'tahfiz.books.view');
  if (denied) return denied;

  const id = Number.parseInt((await params).id, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid book reference.' }, { status: 400 });

  const book = await loadBook(id, session!.schoolId);
  if (!book) return NextResponse.json({ error: 'That book does not exist for this school.' }, { status: 404 });

  const units = (await query(
    `SELECT id, order_index, label, page_from, page_to
       FROM tahfiz_custom_book_units
      WHERE custom_book_id = ? AND school_id = ?
      ORDER BY order_index IS NULL, order_index, id`,
    [id, session!.schoolId],
  )) as any[];

  return NextResponse.json({ success: true, book: { ...book, units } });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied, session } = await gate(req, 'tahfiz.books.manage');
  if (denied) return denied;

  const id = Number.parseInt((await params).id, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid book reference.' }, { status: 400 });

  const before = await loadBook(id, session!.schoolId);
  if (!before) return NextResponse.json({ error: 'That book does not exist for this school.' }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  // Only fields that were actually sent are touched, so a screen that edits
  // the title alone cannot blank the unit label by omission.
  const sets: string[] = [];
  const args: any[] = [];

  if (body.title !== undefined) {
    const title = String(body.title).trim().slice(0, 150);
    if (!title) return NextResponse.json({ error: 'A book needs a title.' }, { status: 400 });
    sets.push('title = ?'); args.push(title);
  }
  if (body.structure_type !== undefined) {
    if (!TYPES.includes(body.structure_type)) {
      return NextResponse.json(
        { error: `Structure must be one of: ${TYPES.join(', ')}.` }, { status: 400 },
      );
    }
    sets.push('structure_type = ?'); args.push(body.structure_type);
  }
  if (body.unit_label !== undefined) {
    sets.push('unit_label = ?'); args.push(String(body.unit_label).trim().slice(0, 40) || null);
  }
  if (body.total_units !== undefined) {
    const n = body.total_units === null || body.total_units === '' ? null : Number(body.total_units);
    if (n !== null && (!Number.isFinite(n) || n < 0)) {
      return NextResponse.json({ error: 'Total units must be a positive number.' }, { status: 400 });
    }
    sets.push('total_units = ?'); args.push(n);
  }
  if (body.teaching_order !== undefined) {
    const n = body.teaching_order === null || body.teaching_order === '' ? null : Number(body.teaching_order);
    if (n !== null && !Number.isFinite(n)) {
      return NextResponse.json({ error: 'Teaching order must be a number.' }, { status: 400 });
    }
    sets.push('teaching_order = ?'); args.push(n);
  }
  if (body.status !== undefined) {
    if (!['active', 'archived'].includes(body.status)) {
      return NextResponse.json({ error: 'Status must be active or archived.' }, { status: 400 });
    }
    sets.push('status = ?'); args.push(body.status);
  }

  if (!sets.length) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });

  sets.push('updated_at = CURRENT_TIMESTAMP');
  args.push(id, session!.schoolId);

  await query(
    `UPDATE tahfiz_custom_books SET ${sets.join(', ')} WHERE id = ? AND school_id = ?`,
    args,
  );

  const after = await loadBook(id, session!.schoolId);

  // Recorded WITH the previous values. audit_logs has no old_values column —
  // the platform-wide gap that makes the trail an activity log rather than an
  // audit trail — so before/after ride in `details`, where they are at least
  // recoverable. A book edit rewrites curriculum; it should say what it
  // changed from, not merely that something changed.
  await logAudit({
    schoolId: session!.schoolId,
    userId: session!.userId,
    action: 'TAHFIZ_BOOK_UPDATED',
    entityType: 'tahfiz_custom_book',
    entityId: id,
    details: { before, after, changed: sets.filter(s => !s.startsWith('updated_at')) },
  }).catch(() => { /* never fail the edit because the log failed */ });

  return NextResponse.json({ success: true, book: after });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied, session } = await gate(req, 'tahfiz.books.manage');
  if (denied) return denied;

  const id = Number.parseInt((await params).id, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid book reference.' }, { status: 400 });

  const book = await loadBook(id, session!.schoolId);
  if (!book) return NextResponse.json({ error: 'That book does not exist for this school.' }, { status: 404 });

  // Refuse rather than orphan. A book in use by plans, portions or records is
  // load-bearing curriculum; retiring it silently would leave that work
  // pointing at nothing. The count is returned so the message can say how much.
  const inUse = (await query(
    `SELECT
       (SELECT COUNT(*) FROM tahfiz_plans    WHERE book_id = ? AND school_id = ?) AS plans,
       (SELECT COUNT(*) FROM tahfiz_portions WHERE book_id = ? AND school_id = ?) AS portions,
       (SELECT COUNT(*) FROM tahfiz_records  WHERE book_id = ? AND school_id = ?) AS records`,
    [id, session!.schoolId, id, session!.schoolId, id, session!.schoolId],
  ).catch(() => [{ plans: 0, portions: 0, records: 0 }])) as any[];

  const used = Number(inUse[0]?.plans ?? 0) + Number(inUse[0]?.portions ?? 0) + Number(inUse[0]?.records ?? 0);
  if (used > 0) {
    return NextResponse.json({
      error: `"${book.title}" is still in use by ${used} plan/portion/record entr${used === 1 ? 'y' : 'ies'}. `
           + `Archive it instead — it will disappear from the pickers while the existing work keeps its history.`,
      in_use: inUse[0],
    }, { status: 409 });
  }

  const reason = (new URL(req.url).searchParams.get('reason') ?? '').slice(0, 255) || null;

  await query(
    `UPDATE tahfiz_custom_books
        SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?, delete_reason = ?
      WHERE id = ? AND school_id = ?`,
    [session!.userId, reason, id, session!.schoolId],
  );

  await logAudit({
    schoolId: session!.schoolId,
    userId: session!.userId,
    action: 'TAHFIZ_BOOK_DELETED',
    entityType: 'tahfiz_custom_book',
    entityId: id,
    details: { book, reason },
  }).catch(() => { /* ignore */ });

  return NextResponse.json({ success: true, deleted: book.title });
}
