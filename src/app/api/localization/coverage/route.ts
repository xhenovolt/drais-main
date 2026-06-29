export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import en from '@/locales/en.json';
import ar from '@/locales/ar.json';

/**
 * GET /api/localization/coverage — Arabic localization coverage for this school.
 * Reports learner Arabic-name coverage, reference-data Arabic-label coverage,
 * and static UI dictionary coverage (en vs ar). Read-only.
 */

// Tables whose `name`/`name_ar` we track for reference-data coverage.
const REFERENCE_TABLES: { key: string; table: string; soft: boolean }[] = [
  { key: 'classes',     table: 'classes',     soft: true },
  { key: 'subjects',    table: 'subjects',    soft: true },
  { key: 'streams',     table: 'streams',     soft: true },
  { key: 'departments', table: 'departments', soft: true },
  { key: 'terms',       table: 'terms',       soft: true },
  { key: 'programs',    table: 'programs',    soft: false },
];

function flattenKeys(obj: any, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flattenKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const conn = await getConnection();
  try {
    const schoolId = session.schoolId;

    // Learner Arabic-name coverage.
    const [[learners]]: any = await conn.execute(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN COALESCE(NULLIF(TRIM(p.full_name_ar), ''),
                                NULLIF(TRIM(p.first_name_ar), ''),
                                NULLIF(TRIM(p.last_name_ar), '')) IS NOT NULL
                  THEN 1 ELSE 0 END) AS with_arabic
       FROM students s JOIN people p ON s.person_id = p.id
       WHERE s.school_id = ? AND s.deleted_at IS NULL`,
      [schoolId],
    );
    const learnerTotal = Number(learners.total) || 0;
    const learnerWith = Number(learners.with_arabic) || 0;

    // Reference-data Arabic-label coverage per table.
    const reference: Record<string, { total: number; withArabic: number; missing: number }> = {};
    for (const t of REFERENCE_TABLES) {
      const softFilter = t.soft ? 'AND deleted_at IS NULL' : '';
      const [[row]]: any = await conn.execute(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN NULLIF(TRIM(name_ar), '') IS NOT NULL THEN 1 ELSE 0 END) AS with_arabic
           FROM ${t.table} WHERE school_id = ? ${softFilter}`,
        [schoolId],
      );
      const total = Number(row.total) || 0;
      const withArabic = Number(row.with_arabic) || 0;
      reference[t.key] = { total, withArabic, missing: total - withArabic };
    }

    // Static UI dictionary coverage (en keys present in ar).
    const enKeys = flattenKeys(en);
    const arKeySet = new Set(flattenKeys(ar));
    const uiMissing = enKeys.filter(k => !arKeySet.has(k));

    return NextResponse.json({
      success: true,
      learners: {
        total: learnerTotal,
        withArabic: learnerWith,
        missing: learnerTotal - learnerWith,
        percent: learnerTotal ? Math.round((learnerWith / learnerTotal) * 100) : 100,
      },
      reference,
      ui: {
        enKeys: enKeys.length,
        arKeys: arKeySet.size,
        missing: uiMissing.length,
        percent: enKeys.length ? Math.round(((enKeys.length - uiMissing.length) / enKeys.length) * 100) : 100,
        sampleMissing: uiMissing.slice(0, 50),
      },
    });
  } catch (e: any) {
    console.error('[localization/coverage]', e);
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
