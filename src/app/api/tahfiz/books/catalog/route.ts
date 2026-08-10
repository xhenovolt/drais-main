/**
 * GET /api/tahfiz/books/catalog
 * Book Structure Engine catalog for the school:
 *   - global: canonical books (e.g. Qur'an) with this school's enabled state
 *   - custom: this school's own books
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';
import { checkModule } from '@/lib/auth/requireModule';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'tahfiz');
  if (modDenied) return modDenied;
  const schoolId = session.schoolId;

  const global = (await query(
    `SELECT gb.id, gb.code, gb.title_ar, gb.title_en, gb.structure_type, gb.total_units, gb.unit_label,
            gb.source_note, gb.version,
            COALESCE(sb.enabled, 0) AS enabled, sb.local_name_override, sb.teaching_order
       FROM tahfiz_global_books gb
       LEFT JOIN tahfiz_school_books sb ON sb.global_book_id = gb.id AND sb.school_id = ?
      WHERE gb.is_active = 1
      ORDER BY gb.title_en`,
    [schoolId],
  )) as any[];

  const custom = (await query(
    `SELECT id, title, structure_type, unit_label, total_units, teaching_order, status
       FROM tahfiz_custom_books
      WHERE school_id = ? AND deleted_at IS NULL AND status = 'active'
      ORDER BY teaching_order IS NULL, teaching_order, title`,
    [schoolId],
  )) as any[];

  return NextResponse.json({
    success: true,
    // db.ts uses bigNumberStrings, so COALESCE(...) can arrive as "1"/"0" —
    // coerce robustly (string | number | boolean).
    global: global.map(g => ({ ...g, enabled: Number(g.enabled) === 1 })),
    custom,
  });
}
