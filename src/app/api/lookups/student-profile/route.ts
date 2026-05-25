import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * GET /api/lookups/student-profile
 * Returns the small lookup lists feeding the student extended-profile edit forms:
 *   - orphan_statuses
 *   - living_statuses
 *   - districts
 *   - nationalities
 *
 * These tables are global (no school scoping); auth still required so the route
 * stays inside the authenticated surface.
 */
export async function GET(req: NextRequest) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const [orphan]:      any = await conn.execute(`SELECT id, code, label FROM orphan_statuses ORDER BY id`);
    const [living]:      any = await conn.execute(`SELECT id, code, label FROM living_statuses ORDER BY id`);
    const [districts]:   any = await conn.execute(`SELECT id, name FROM districts ORDER BY name`);
    const [nationalities]: any = await conn.execute(`SELECT id, code, name FROM nationalities ORDER BY name`);

    return NextResponse.json({
      success: true,
      data: {
        orphan_statuses: orphan,
        living_statuses: living,
        districts,
        nationalities,
      },
    });
  } catch (e) {
    console.error('lookup error', e);
    return NextResponse.json({ error: 'Failed to load lookups' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
