import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { processAttendance, mapDeviceUserToStudent } from '@/services/attendance/attendanceEngine';
import type { AttendanceRecord } from '@/services/attendance/attendanceEngine';

/**
 * ZKTECO WEBHOOK RECEIVER
 * Receives real-time attendance events pushed from ZKTeco K40 devices
 * 
 * Architecture: ZKTeco Device → Webhook → Attendance Engine → Database
 * 
 * ZKTeco devices push attendance events immediately when a fingerprint/card is scanned.
 * This is different from Dahua which requires polling.
 * 
 * Expected webhook payload:
 * {
 *   "device_id": "ZKTECO-K40-001",
 *   "user_id": "105",
 *   "timestamp": 1771783000,
 *   "method": "fingerprint",
 *   "scan_type": "entry",
 *   "webhook_secret": "your-secret-key"
 * }
 */

interface ZKTecoWebhookPayload {
  device_id: string; // Device identifier (must match database)
  user_id: string; // Device user ID (numeric, maps to student)
  timestamp: number; // Unix timestamp
  method?: string; // 'fingerprint', 'card', 'face', etc.
  scan_type?: string; // 'entry' or 'exit'
  webhook_secret: string; // For security
}

/**
 * Validate webhook secret
 */
async function validateWebhookSecret(
  deviceIdentifier: string,
  providedSecret: string
): Promise<{ valid: boolean; device?: any }> {
  const connection = await getConnection();
  try {
    const [devices] = await connection.execute<any[]>(
      `SELECT id, school_id, device_name, device_identifier, webhook_secret, status
       FROM devices
       WHERE device_identifier = ? AND device_type = 'zkteco'`,
      [deviceIdentifier]
    );
    
    if (devices.length === 0) {
      return { valid: false };
    }
    
    const device = devices[0];
    
    if (device.status !== 'active') {
      console.warn(`[ZKTeco Webhook] Device ${deviceIdentifier} is not active (status: ${device.status})`);
      return { valid: false };
    }
    
    if (device.webhook_secret !== providedSecret) {
      console.warn(`[ZKTeco Webhook] Invalid webhook secret for device ${deviceIdentifier}`);
      return { valid: false };
    }
    
    return { valid: true, device };
    
  } catch (error: any) {
    console.error('[ZKTeco Webhook] Error validating webhook secret:', error);
    return { valid: false };
  } finally {
    await connection.end();
  }
}

/**
 * Log webhook event to database
 */
async function logWebhookEvent(
  deviceId: number,
  schoolId: number,
  success: boolean,
  errorMessage?: string
): Promise<void> {
  const connection = await getConnection();
  try {
    await connection.execute(
      `INSERT INTO device_sync_log 
       (device_id, school_id, sync_started_at, sync_completed_at, 
        records_fetched, records_processed, records_failed, status, error_message)
       VALUES (?, ?, NOW(), NOW(), 1, ?, ?, ?, ?)`,
      [
        deviceId,
        schoolId,
        success ? 1 : 0,
        success ? 0 : 1,
        success ? 'success' : 'failed',
        errorMessage || null
      ]
    );
  } catch (error: any) {
    console.error('[ZKTeco Webhook] Error logging webhook event:', error);
  } finally {
    await connection.end();
  }
}

/**
 * Update device last activity timestamp
 */
async function updateDeviceActivity(deviceId: number): Promise<void> {
  const connection = await getConnection();
  try {
    await connection.execute(
      `UPDATE devices 
       SET last_poll_at = NOW(), status = 'active', last_error = NULL
       WHERE id = ?`,
      [deviceId]
    );
  } catch (error: any) {
    console.error('[ZKTeco Webhook] Error updating device activity:', error);
  } finally {
    await connection.end();
  }
}

/**
 * POST /api/device/zkteco/webhook
 * 
 * Receives attendance events from ZKTeco K40 devices
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Parse webhook payload
    const payload: ZKTecoWebhookPayload = await req.json();
    
    console.log('[ZKTeco Webhook] Received event:', {
      device_id: payload.device_id,
      user_id: payload.user_id,
      timestamp: payload.timestamp,
      method: payload.method,
      scan_type: payload.scan_type
    });
    
    // Validate required fields
    if (!payload.device_id || !payload.user_id || !payload.timestamp || !payload.webhook_secret) {
      return NextResponse.json(
        { error: 'Missing required fields: device_id, user_id, timestamp, webhook_secret' },
        { status: 400 }
      );
    }
    
    // Validate webhook secret and get device
    const validation = await validateWebhookSecret(payload.device_id, payload.webhook_secret);
    
    if (!validation.valid || !validation.device) {
      return NextResponse.json(
        { error: 'Invalid device_id or webhook_secret' },
        { status: 401 }
      );
    }
    
    const device = validation.device;
    
    // Map device_user_id to student_id
    const studentId = await mapDeviceUserToStudent(
      device.id,
      payload.user_id,
      device.school_id
    );
    
    if (!studentId) {
      const errorMsg = `Device user ${payload.user_id} not mapped to student`;
      console.warn(`[ZKTeco Webhook] ${errorMsg} (device: ${device.device_name})`);
      
      await logWebhookEvent(device.id, device.school_id, false, errorMsg);
      
      return NextResponse.json(
        { 
          error: errorMsg,
          hint: 'Please enroll this user in device settings'
        },
        { status: 404 }
      );
    }
    
    // Convert Unix timestamp to Date
    const timestamp = new Date(payload.timestamp * 1000);
    const date = timestamp.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Build attendance record
    const attendanceRecord: AttendanceRecord = {
      schoolId: device.school_id,
      studentId: studentId,
      deviceId: device.id,
      deviceType: 'zkteco',
      method: payload.method || 'unknown',
      scanType: payload.scan_type || 'entry',
      timestamp: timestamp
    };
    
    // Process through attendance engine
    const result = await processAttendance(attendanceRecord);
    
    if (result.success) {
      console.log(
        `[ZKTeco Webhook] Processed attendance for student ${studentId} ` +
        `(${result.isDuplicate ? 'duplicate' : 'new'}) in ${Date.now() - startTime}ms`
      );
      
      // Update device activity
      await updateDeviceActivity(device.id);
      
      // Log successful webhook
      await logWebhookEvent(device.id, device.school_id, true);
      
      return NextResponse.json(
        { 
          success: true,
          message: result.message,
          is_duplicate: result.isDuplicate,
          attendance_id: result.attendanceId
        },
        { status: 200 }
      );
      
    } else {
      console.warn(`[ZKTeco Webhook] Failed to process attendance: ${result.message}`);
      
      await logWebhookEvent(device.id, device.school_id, false, result.message);
      
      return NextResponse.json(
        { 
          error: result.message
        },
        { status: 400 }
      );
    }
    
  } catch (error: any) {
    console.error('[ZKTeco Webhook] Error processing webhook:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error.message
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for testing webhook connectivity
 */
export async function GET(req: NextRequest) {
  return NextResponse.json(
    {
      service: 'ZKTeco Webhook Receiver',
      status: 'online',
      endpoint: '/api/device/zkteco/webhook',
      method: 'POST',
      expected_payload: {
        device_id: 'ZKTECO-K40-001',
        user_id: '105',
        timestamp: 1771783000,
        method: 'fingerprint',
        scan_type: 'entry',
        webhook_secret: 'your-secret-key'
      }
    },
    { status: 200 }
  );
}
