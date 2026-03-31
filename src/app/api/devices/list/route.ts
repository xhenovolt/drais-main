export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/devices/list
 *
 * Returns all registered devices with a computed `seconds_ago` field.
 * UI determines online/offline: seconds_ago <= 120 → ONLINE.
 * No auth required — this is a system-health endpoint.
 */
export async function GET() {
  try {
    const rows = await query(
      `SELECT
         id,
         sn,
         device_name,
         model_name,
         location,
         last_seen,
         ip_address,
         is_online,
         status,
         firmware_version,
         push_version,
         last_activity,
         TIMESTAMPDIFF(SECOND, last_seen, NOW()) AS seconds_ago,
         created_at
       FROM devices
       ORDER BY last_seen DESC`,
      [],
    );

    return NextResponse.json({ success: true, data: rows });
  } catch (error: any) {
    console.error('[devices/list] Error:', error.message);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch devices', data: [] },
      { status: 500 },
    );
  }
}
