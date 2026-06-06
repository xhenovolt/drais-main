import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { syncParsedLogsToRawEvents } from '@/lib/attendance/engine';

export const runtime = 'nodejs';

/**
 * POST /api/attendance/sync
 *
 * Backfill any attendance logs from zk_parsed_logs that haven't been
 * synced to attendance_raw_events. This ensures all device logs are
 * visible in the attendance/logs route with learner mappings.
 *
 * Useful for catching logs that bypassed the normal ZK handler,
 * or for initial data migration.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { schoolId } = session;
    
    // Trigger the sync
    await syncParsedLogsToRawEvents(schoolId);

    return NextResponse.json({
      success: true,
      message: 'Sync completed. All parsed logs now in attendance_raw_events.',
    });
  } catch (err: any) {
    console.error('[Attendance Sync] Error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Sync failed' },
      { status: 500 },
    );
  }
}
