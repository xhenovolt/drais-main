/**
 * GET /api/tahfiz/quran/reference
 * Qur'an reference data that drives the portion selector (Surah / Ayah / Page /
 * Juz / Hizb). Sourced from the seeded authoritative Tanzil metadata.
 *
 * ALWAYS answers { success, surahs: [], juz: [], hizb: [], error?, code? } — failures included — so
 * the selector never receives an object without its arrays.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';
import { isModuleEnabled } from '@/lib/school-modules';

const fail = (status: number, error: string, code: string) =>
  NextResponse.json({ success: false, error, code, page_count: 604, counts: { surahs: 0, juz: 0, hizb: 0 }, surahs: [], juz: [], hizb: [] }, { status });

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return fail(401, 'Not authenticated', 'NOT_AUTHENTICATED');
  try {
    if (!(await isModuleEnabled(session.schoolId, 'tahfiz'))) {
      return fail(403, "Module 'tahfiz' is not enabled for this school", 'MODULE_DISABLED');
    }
    const [surahs, juz, hizb] = await Promise.all([
      query(`SELECT number, name_ar, name_translit, name_en, ayah_count, revelation_type, juz_start, start_page, end_page
               FROM tahfiz_quran_surahs ORDER BY number`) as Promise<any[]>,
      query(`SELECT juz_number, start_surah, start_ayah, start_page FROM tahfiz_quran_juz ORDER BY juz_number`) as Promise<any[]>,
      query(`SELECT hizb_number, juz_number, start_surah, start_ayah, start_page FROM tahfiz_quran_hizb ORDER BY hizb_number`) as Promise<any[]>,
    ]);
    const arr = (x: unknown) => (Array.isArray(x) ? x : []);
    return NextResponse.json({
      success: true,
      page_count: 604,
      counts: { surahs: arr(surahs).length, juz: arr(juz).length, hizb: arr(hizb).length },
      surahs: arr(surahs), juz: arr(juz), hizb: arr(hizb),
    });
  } catch (e: any) {
    console.error('[tahfiz/quran/reference] failed', e);
    return fail(500, "Could not load the Qur'an reference data", 'SERVER_ERROR');
  }
}
