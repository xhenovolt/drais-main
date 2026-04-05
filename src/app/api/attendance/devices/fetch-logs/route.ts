import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import axios from 'axios';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * Device Log Fetching Service
 * Handles fetching logs from biometric/attendance devices
 */

interface DeviceLog {
  RecNo: number;
  CardNo?: string;
  CardName?: string;
  UserID?: number;
  CreateTime: number; // Unix timestamp
  Type: string; // 'Entry' | 'Exit'
  Method?: number;
  Door?: string;
  ReaderID?: number;
  ErrorCode?: number;
  [key: string]: any;
}

interface ParsedLog {
  device_id: number;
  schoolId: number;
  device_user_id: number | null;
  scan_timestamp: Date;
  received_timestamp: Date;
  verification_status: 'success' | 'failed' | 'unknown';
  device_log_id: string;
  card_no?: string;
  user_id?: number;
  type: string; // entry, exit
  method?: number;
  door?: string;
  reader_id?: number;
  error_code?: number;
  raw_data: object;
}

/**
 * POST /api/attendance/devices/fetch-logs
 * Fetch logs from a specific device
 */
export async function POST(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const { device_id, force_refresh = false } = await req.json();

    if (!device_id) {
      return NextResponse.json(
        { success: false, error: 'Device ID is required' },
        { status: 400 }
      );
    }

    connection = await getConnection();

    // Get device configuration
    const [devices] = await connection.execute(
      'SELECT * FROM biometric_devices WHERE id = ?',
      [device_id]
    );

    if (!Array.isArray(devices) || devices.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Device not found' },
        { status: 404 }
      );
    }

    const device = (devices as any[])[0];

    // Fetch logs from device API
    const logs = await fetchDeviceLogs(device, force_refresh);

    if (!logs || logs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No new logs from device',
        logs_count: 0,
        stored_count: 0,
      });
    }

    // Parse and store logs
    const parsed = parseLogs(logs, device.id, device.schoolId);
    const stored = await storeLogs(connection, parsed);

    // Update device sync status
    await connection.execute(
      'UPDATE biometric_devices SET last_sync_time = NOW(), sync_status = ? WHERE id = ?',
      ['online', device_id]
    );

    return NextResponse.json({
      success: true,
      message: `Fetched and stored ${stored} logs`,
      logs_count: logs.length,
      stored_count: stored,
    });

  } catch (error: any) {
    console.error('Device log fetch error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch device logs' },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * Fetch logs from device API
 */
async function fetchDeviceLogs(device: any, force_refresh: boolean): Promise<DeviceLog[]> {
  try {
    const url = `http://${device.ip_address}:${device.port || 80}/cgi-bin/recordFinder.cgi`;

    // Build query parameters
    const params = new URLSearchParams({
      action: 'findNext',
      name: 'AccessControlCardRec',
      count: '100',
    });

    if (!force_refresh && device.last_sync_time) {
      // Fetch only new logs since last sync
      const lastSyncUnix = Math.floor(new Date(device.last_sync_time).getTime() / 1000);
      params.append('RecNo', lastSyncUnix.toString());
    }

    const response = await axios.get(`${url}?${params}`, {
      timeout: 10000,
      headers: {
        'User-Agent': 'DRAIS-Attendance/1.0',
      },
    });

    // Parse the response
    const logs = parseDeviceResponse(response.data);
    return logs;

  } catch (error: any) {
    console.error('Error fetching from device:', error.message);
    throw new Error(`Device API Error: ${error.message}`);
  }
}

/**
 * Parse device API response format
 * Expected format:
 * found=10
 * records[0].RecNo=1
 * records[0].CardNo=...
 */
function parseDeviceResponse(responseText: string): DeviceLog[] {
  const logs: DeviceLog[] = [];

  const lines = responseText.toString().split('\n');
  const found = parseInt(lines[0]?.split('=', 10)[1] || '0');

  const recordMap: { [key: string]: any } = {};

  for (const line of lines.slice(1)) {
    const match = line.match(/records\[(\d+)\]\.(\w+)=(.*)/);
    if (match) {
      const [, indexStr, field, value] = match;
      const index = parseInt(indexStr, 10);

      if (!recordMap[index]) {
        recordMap[index] = { RecNo: index };
      }

      // Convert types
      if (field === 'CreateTime' || field === 'RecNo') {
        recordMap[index][field] = parseInt(value, 10);
      } else if (field === 'Method' || field === 'UserID' || field === 'ReaderID' || field === 'ErrorCode') {
        recordMap[index][field] = parseInt(value, 10) || undefined;
      } else {
        recordMap[index][field] = value;
      }
    }
  }

  // Convert to array of logs
  for (let i = 0; i < found; i++) {
    if (recordMap[i]) {
      logs.push(recordMap[i]);
    }
  }

  return logs;
}

/**
 * Parse logs into internal format
 */
function parseLogs(logs: DeviceLog[], deviceId: number, schoolId: number): ParsedLog[] {
  return logs.map((log) => ({
    device_id: deviceId,
    schoolId: schoolId,
    device_user_id: null, // Will be resolved later via device_users table
    scan_timestamp: new Date(log.CreateTime * 1000),
    received_timestamp: new Date(),
    verification_status: log.ErrorCode ? 'failed' : 'success',
    device_log_id: `${deviceId}-${log.RecNo}-${log.CreateTime}`,
    card_no: log.CardNo || undefined,
    user_id: log.UserID,
    type: log.Type?.toLowerCase() || 'entry',
    method: log.Method,
    door: log.Door,
    reader_id: log.ReaderID,
    error_code: log.ErrorCode,
    raw_data: log,
  }));
}

/**
 * Store logs in database
 */
async function storeLogs(connection: any, logs: ParsedLog[]): Promise<number> {
  let stored = 0;

  for (const log of logs) {
    try {
      // Check for duplicates
      const [existing] = await connection.execute(
        `SELECT id FROM attendance_logs 
         WHERE school_id = ? AND device_id = ? AND device_log_id = ? 
         LIMIT 1`,
        [log.schoolId, log.device_id, log.device_log_id]
      );

      if ((existing as any[]).length > 0) {
        continue; // Skip duplicate
      }

      // Store log
      await connection.execute(
        `INSERT INTO attendance_logs 
         (schoolId, device_id, device_user_id, scan_timestamp, received_timestamp, 
          verification_status, device_log_id, processing_status, raw_data) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          log.schoolId,
          log.device_id,
          log.device_user_id,
          log.scan_timestamp,
          log.received_timestamp,
          log.verification_status,
          log.device_log_id,
          'pending',
          JSON.stringify(log.raw_data),
        ]
      );

      stored++;
    } catch (error: any) {
      console.error('Error storing log:', error);
      // Continue with next log
    }
  }

  return stored;
}
