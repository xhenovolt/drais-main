/**
 * GET /api/tahfiz/quran/reference
 * Qur'an reference data that drives the portion selector (Surah / Ayah / Page /
 * Juz / Hizb). Sourced from the seeded authoritative Tanzil metadata.
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

  const [surahs, juz, hizb] = await Promise.all([
    query(`SELECT number, name_ar, name_translit, name_en, ayah_count, revelation_type, juz_start, start_page, end_page
             FROM tahfiz_quran_surahs ORDER BY number`) as Promise<any[]>,
    query(`SELECT juz_number, start_surah, start_ayah, start_page FROM tahfiz_quran_juz ORDER BY juz_number`) as Promise<any[]>,
    query(`SELECT hizb_number, juz_number, start_surah, start_ayah, start_page FROM tahfiz_quran_hizb ORDER BY hizb_number`) as Promise<any[]>,
  ]);

  return NextResponse.json({
    success: true,
    page_count: 604,
    counts: { surahs: surahs.length, juz: juz.length, hizb: hizb.length },
    surahs, juz, hizb,
  });
}
