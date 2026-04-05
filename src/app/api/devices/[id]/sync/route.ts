import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { pollDahuaDevice } from '@/services/devices/dahua/dahuaPoller';

/**
 * DEVICE SYNC API
 * Manually trigger device sync and view sync history
 * 
 * Route: /api/devices/[id]/sync
 */

/**
 * GET /api/devices/[id]/sync
 * Get sync history for a device
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const connection = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    
    if (!session?.schoolId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const schoolId = session.schoolId;
    const { id: deviceId } = await params;
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit', 10) || '50', 10);
    
    // Verify device belongs to school
    const [devices] = await connection.execute<any[]>(
      'SELECT id, device_name, device_type FROM devices WHERE id = ? AND school_id = ?',
      [deviceId, schoolId]
    );
    
    if (devices.length === 0) {
      return NextResponse.json(
        { error: 'Device not found or access denied' },
        { status: 404 }
      );
    }
    
    const device = devices[0];
    
    // Get sync history
    const [syncLogs] = await connection.execute<any[]>(
      `SELECT 
        id,
        sync_started_at,
        sync_completed_at,
        records_fetched,
        records_processed,
        records_failed,
        status,
        error_message
      FROM device_sync_log
      WHERE device_id = ? AND school_id = ?
      ORDER BY sync_started_at DESC
      LIMIT ?`,
      [deviceId, schoolId, limit]
    );
    
    // Calculate stats
    const [stats] = await connection.execute<any[]>(
      `SELECT 
        COUNT(*) as total_syncs,
        SUM(records_fetched) as total_fetched,
        SUM(records_processed) as total_processed,
        SUM(records_failed) as total_failed,
        AVG(TIMESTAMPDIFF(SECOND, sync_started_at, sync_completed_at)) as avg_duration_seconds
      FROM device_sync_log
      WHERE device_id = ? AND school_id = ?`,
      [deviceId, schoolId]
    );
    
    return NextResponse.json({
      device: {
        id: device.id,
        name: device.device_name,
        type: device.device_type
      },
      stats: stats[0] || {
        total_syncs: 0,
        total_fetched: 0,
        total_processed: 0,
        total_failed: 0,
        avg_duration_seconds: 0
      },
      sync_history: syncLogs,
      total_logs: syncLogs.length
    });
    
  } catch (error: any) {
    console.error('[Device Sync API] Error fetching sync history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sync history', message: error.message },
      { status: 500 }
    );
  } finally {
    await connection.end();
  }
}

/**
 * POST /api/devices/[id]/sync
 * Manually trigger a sync for this device
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const connection = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    
    if (!session?.schoolId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const schoolId = session.schoolId;
    const { id: deviceId } = await params;
    
    // Get device details with school isolation
    const [devices] = await connection.execute<any[]>(
      `SELECT id, school_id, device_name, device_type, device_ip, device_port,
              device_identifier, device_username, device_password, webhook_secret,
              poll_interval, status, last_poll_at, last_error
       FROM devices
       WHERE id = ? AND school_id = ?`,
      [deviceId, schoolId]
    );
    
    if (devices.length === 0) {
      return NextResponse.json(
        { error: 'Device not found or access denied' },
        { status: 404 }
      );
    }
    
    const device = devices[0];
    
    // Check device status
    if (device.status === 'inactive') {
      return NextResponse.json(
        { error: 'Cannot sync inactive device. Please activate it first.' },
        { status: 400 }
      );
    }
    
    // Trigger sync based on device type
    if (device.device_type === 'dahua') {
      // Dahua uses polling
      console.log(`[Device Sync API] Manually triggering Dahua sync for device ${device.device_name}`);
      
      // Run sync in background (don't block response)
      pollDahuaDevice(device).then(() => {
        console.log(`[Device Sync API] Dahua sync completed for ${device.device_name}`);
      }).catch((error: any) => {
        console.error(`[Device Sync API] Dahua sync failed for ${device.device_name}:`, error);
      });
      
      return NextResponse.json({
        success: true,
        message: 'Dahua device sync triggered. Check sync history for results.',
        device_name: device.device_name,
        device_type: device.device_type
      });
      
    } else if (device.device_type === 'zkteco') {
      // ZKTeco uses webhook push, cannot manually trigger
      return NextResponse.json(
        { 
          error: 'ZKTeco devices use webhook push model. Cannot manually trigger sync.',
          hint: 'Attendance events will be received automatically when users scan.'
        },
        { status: 400 }
      );
      
    } else {
      return NextResponse.json(
        { error: `Unsupported device type: ${device.device_type}` },
        { status: 400 }
      );
    }
    
  } catch (error: any) {
    console.error('[Device Sync API] Error triggering sync:', error);
    return NextResponse.json(
      { error: 'Failed to trigger sync', message: error.message },
      { status: 500 }
    );
  } finally {
    await connection.end();
  }
}
