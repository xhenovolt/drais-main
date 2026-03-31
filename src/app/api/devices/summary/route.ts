export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/devices/summary
 *
 * Dashboard widget data: total / online / offline counts.
 * Online = last_seen within last 2 minutes.
 */
export async function GET() {
  try {
    const rows = await query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN TIMESTAMPDIFF(SECOND, last_seen, NOW()) <= 120 THEN 1 ELSE 0 END) AS online,
         SUM(CASE WHEN TIMESTAMPDIFF(SECOND, last_seen, NOW()) > 120 THEN 1 ELSE 0 END) AS offline
       FROM devices`,
      [],
    );

    const row = (rows as any[])[0] || { total: 0, online: 0, offline: 0 };

    return NextResponse.json({
      success: true,
      data: {
        total:   Number(row.total)   || 0,
        online:  Number(row.online)  || 0,
        offline: Number(row.offline) || 0,
      },
    });
  } catch (error: any) {
    console.error('[devices/summary] Error:', error.message);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch summary', data: { total: 0, online: 0, offline: 0 } },
      { status: 500 },
    );
  }
}
