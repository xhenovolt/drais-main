/**
 * GET /api/devices/summary — this school's device counts (total / online / offline).
 * AUTHENTICATED and SCHOOL-SCOPED (restored from a wrongful retirement — the
 * Topbar and dashboard widget depend on it). Online = last_seen within 2 min.
 */
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ success: false, message: 'Not authenticated', data: { total: 0, online: 0, offline: 0 } }, { status: 401 });
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
