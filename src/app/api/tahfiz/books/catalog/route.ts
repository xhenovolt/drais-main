/**
 * GET /api/tahfiz/books/catalog
 * Book Structure Engine catalog for the school:
 *   - global: canonical books (e.g. Qur'an) with this school's enabled state
 *   - custom: this school's own books
 *
 * ALWAYS answers { success, global: [], custom: [], error?, code? } — every outcome, including
 * not-authenticated, module-disabled and server errors, carries both arrays. The page used to put an
 * error body ({ error }) straight into state and crash on `catalog.global.length`
 * ("Cannot read properties of undefined (reading 'length')").
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';
import { isModuleEnabled } from '@/lib/school-modules';

const fail = (status: number, error: string, code: string) =>
  NextResponse.json({ success: false, error, code, global: [], custom: [] }, { status });

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return fail(401, 'Not authenticated', 'NOT_AUTHENTICATED');
  try {
    if (!(await isModuleEnabled(session.schoolId, 'tahfiz'))) {
      return fail(403, "Module 'tahfiz' is not enabled for this school", 'MODULE_DISABLED');
    }
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
      global: (Array.isArray(global) ? global : []).map(g => ({ ...g, enabled: Number(g.enabled) === 1 })),
      custom: Array.isArray(custom) ? custom : [],
    });
  } catch (e: any) {
    console.error('[tahfiz/books/catalog] failed', e);
    return fail(500, 'Could not load the books catalog', 'SERVER_ERROR');
  }
}
