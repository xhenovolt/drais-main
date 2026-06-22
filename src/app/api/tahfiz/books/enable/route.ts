/**
 * POST /api/tahfiz/books/enable
 * Body: { global_book_id, enabled, local_name_override?, teaching_order? }
 * Turn a global canonical book on/off for THIS school (no data duplication).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query } from '@/lib/db';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try { await requirePermission(session.userId, session.schoolId, 'tahfiz.books.manage', session.isSuperAdmin); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const body = await req.json().catch(() => null);
  const globalBookId = Number(body?.global_book_id);
  const enabled = body?.enabled ? 1 : 0;
  if (!globalBookId) return NextResponse.json({ error: 'global_book_id is required' }, { status: 400 });

  const exists = (await query(`SELECT id FROM tahfiz_global_books WHERE id = ? AND is_active = 1 LIMIT 1`, [globalBookId])) as any[];
  if (!exists.length) return NextResponse.json({ error: 'Global book not found' }, { status: 404 });

  await query(
    `INSERT INTO tahfiz_school_books (school_id, global_book_id, enabled, local_name_override, teaching_order)
       VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE enabled = VALUES(enabled),
       local_name_override = VALUES(local_name_override), teaching_order = VALUES(teaching_order), updated_at = NOW()`,
    [session.schoolId, globalBookId, enabled, body?.local_name_override ?? null, body?.teaching_order ?? null],
  );
  return NextResponse.json({ success: true, global_book_id: globalBookId, enabled: !!enabled });
}
