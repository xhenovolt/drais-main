/**
 * GET /api/devices/summary — this school's device counts (total / online / offline).
 * AUTHENTICATED and SCHOOL-SCOPED (restored from a wrongful retirement — the
 * Topbar and dashboard widget depend on it). Online = last_seen within 2 min.
 */
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { getDbMode } from '@/lib/db/db-mode';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ success: false, message: 'Not authenticated', data: { total: 0, online: 0, offline: 0 } }, { status: 401 });
  }

  // local-sqlite branch — Phase 7 sub-effort 39. "Online" (seen in the last
  // 2 minutes) is a live-heartbeat concept that means nothing read from a
  // static local snapshot — every device honestly reads as offline, but
  // `total` (how many devices are registered) is real local data.
  if (getDbMode() === 'local-sqlite') {
    const { getSqliteDb } = await import('@/lib/repo/sqlite/singleton');
    const row = getSqliteDb().prepare(
      `SELECT COUNT(*) AS total FROM devices WHERE school_id = ? AND deleted_at IS NULL`
    ).get(session.schoolId) as any;
    const total = Number(row?.total) || 0;
    return NextResponse.json({ success: true, data: { total, online: 0, offline: total } });
  }

  try {
    const rows = await query(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN TIMESTAMPDIFF(SECOND, last_seen, NOW()) <= 120 THEN 1 ELSE 0 END) AS online,
              SUM(CASE WHEN TIMESTAMPDIFF(SECOND, last_seen, NOW()) > 120 THEN 1 ELSE 0 END) AS offline
         FROM devices WHERE school_id = ? AND deleted_at IS NULL`,
      [session.schoolId],
    );
    const row = (rows as any[])[0] || { total: 0, online: 0, offline: 0 };
    return NextResponse.json({
      success: true,
      data: { total: Number(row.total) || 0, online: Number(row.online) || 0, offline: Number(row.offline) || 0 },
    });
  } catch (error: any) {
    console.error('[devices/summary] Error:', error.message);
    return NextResponse.json({ success: false, message: error.message || 'Failed', data: { total: 0, online: 0, offline: 0 } }, { status: 500 });
  }
}
