/**
 * POST /api/admin/parents/[id]/merge   body: { into: <targetParentId> }
 *
 * Merge a duplicate parent identity [id] (source) INTO another account (target):
 * moves links + sessions to the target, dropping links that would duplicate one
 * the target already has, then deletes the source account. Super-admin only
 * (global, destructive). Idempotent-ish: re-running after delete is a 404.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query } from '@/lib/db';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try { await requirePermission(session.userId, session.schoolId, 'students.manage', session.isSuperAdmin); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }
  if (!session.isSuperAdmin) return NextResponse.json({ error: 'Merge requires a super-admin.' }, { status: 403 });

  const source = Number((await params).id);
  const body = await req.json().catch(() => null);
  const target = Number(body?.into);
  if (!target || !source || target === source) {
    return NextResponse.json({ error: 'Provide a different target account id in "into".' }, { status: 400 });
  }

  const accs = (await query(`SELECT id FROM parent_accounts WHERE id IN (?, ?)`, [source, target])) as any[];
  if (accs.length < 2) return NextResponse.json({ error: 'Source or target account not found' }, { status: 404 });

  // Move each source link unless the target already covers that (school, student).
  const links = (await query(`SELECT id, school_id, student_id FROM parent_student_links WHERE parent_account_id = ?`, [source])) as any[];
  let moved = 0, dropped = 0;
  for (const l of links) {
    const dup = (await query(
      `SELECT id FROM parent_student_links WHERE parent_account_id = ? AND school_id = ? AND student_id = ? LIMIT 1`,
      [target, l.school_id, l.student_id],
    )) as any[];
    if (dup.length) { await query(`DELETE FROM parent_student_links WHERE id = ?`, [l.id]); dropped++; }
    else { await query(`UPDATE parent_student_links SET parent_account_id = ? WHERE id = ?`, [target, l.id]); moved++; }
  }

  // Reassign sessions, then remove the source account.
  await query(`UPDATE parent_sessions SET parent_account_id = ? WHERE parent_account_id = ?`, [target, source]);
  await query(`DELETE FROM parent_accounts WHERE id = ?`, [source]);

  return NextResponse.json({ success: true, source, target, links_moved: moved, links_dropped_as_duplicate: dropped });
}
