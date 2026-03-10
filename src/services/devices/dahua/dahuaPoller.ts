import { getConnection } from '@/lib/db';
import { processAttendanceBatch, mapDeviceUserToStudent } from '@/services/attendance/attendanceEngine';
import type { AttendanceRecord } from '@/services/attendance/attendanceEngine';

/**
 * DAHUA DEVICE POLLER
 * Polls Dahua Access Control devices via HTTP and processes attendance records
 * 
 * Architecture: Dahua Device → Dahua Adapter → Attendance Engine → Database
 * 
 * Dahua API endpoint: http://<device-ip>/cgi-bin/attendanceRecord.cgi?action=getRecords
 * Response format (plain text):
 * found=3
 * records[0].RecNo=1
 * records[0].UserID=101
 * records[0].CreateTime=1771782789
 * records[0].Method=21
 * records[0].Type=Entry
 */

interface DahuaDevice {
  id: number;
  school_id: number;
  device_name: string;
  device_ip: string;
  device_port: number;
  device_username?: string;
  device_password?: string;
  poll_interval: number; // seconds
  status: 'active' | 'inactive' | 'error';
  last_poll_at?: Date;
  last_error?: string;
}

interface DahuaRawRecord {
  RecNo: number;
  UserID: string;
  CreateTime: number; // Unix timestamp
  Method: number; // 0=unknown, 6=card, 21=fingerprint
  Type: string; // 'Entry' or 'Exit'
}

/**
 * Parse Dahua plain text response into structured records
 * 
 * Example input:
 * found=2
 * records[0].RecNo=1
 * records[0].UserID=101
 * records[0].CreateTime=1771782789
 * records[0].Method=21
 * records[0].Type=Entry
 */
function parseDahuaResponse(responseText: string): DahuaRawRecord[] {
  const lines = responseText.trim().split('\n');
  const records: DahuaRawRecord[] = [];
  
  // First line should be "found=N"
  const foundMatch = lines[0].match(/^found=(\d+)$/);
  if (!foundMatch) {
    throw new Error('Invalid Dahua response format: missing "found=" line');
  }
  
  const foundCount = parseInt(foundMatch[1], 10);
  if (foundCount === 0) {
    return []; // No records
  }
  
  // Parse records
  let currentRecord: Partial<DahuaRawRecord> = {};
  let currentIndex = -1;
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^records\[(\d+)\]\.(\w+)=(.+)$/);
    
    if (!match) continue;
    
    const index = parseInt(match[1], 10);
    const field = match[2];
    const value = match[3];
    
    // New record started
    if (index !== currentIndex) {
      if (currentIndex >= 0 && currentRecord.RecNo) {
        records.push(currentRecord as DahuaRawRecord);
      }
      currentIndex = index;
      currentRecord = {};
    }
    
    // Parse field
    switch (field) {
      case 'RecNo':
        currentRecord.RecNo = parseInt(value, 10);
        break;
      case 'UserID':
        currentRecord.UserID = value;
        break;
      case 'CreateTime':
        currentRecord.CreateTime = parseInt(value, 10);
        break;
      case 'Method':
        currentRecord.Method = parseInt(value, 10);
        break;
      case 'Type':
        currentRecord.Type = value;
        break;
    }
  }
  
  // Add last record
  if (currentRecord.RecNo) {
    records.push(currentRecord as DahuaRawRecord);
  }
  
  return records;
}

/**
 * Convert Dahua method code to human-readable string
 */
function mapDahuaMethod(methodCode: number): string {
  switch (methodCode) {
    case 6: return 'card';
    case 21: return 'fingerprint';
    case 0:
    default: return 'unknown';
  }
}

/**
 * Fetch attendance records from Dahua device
 */
async function fetchDahuaRecords(device: DahuaDevice): Promise<DahuaRawRecord[]> {
  const url = `http://${device.device_ip}:${device.device_port}/cgi-bin/attendanceRecord.cgi?action=getRecords`;
  
  const fetchOptions: RequestInit = {
    method: 'GET',
    headers: {
      'Content-Type': 'text/plain'
    }
  };
  
  // Add basic auth if credentials provided
  if (device.device_username && device.device_password) {
    const credentials = Buffer.from(`${device.device_username}:${device.device_password}`).toString('base64');
    fetchOptions.headers = {
      ...fetchOptions.headers,
      'Authorization': `Basic ${credentials}`
    };
  }
  
  const response = await fetch(url, fetchOptions);
  
  if (!response.ok) {
    throw new Error(`Dahua device responded with status ${response.status}`);
  }
  
  const responseText = await response.text();
  return parseDahuaResponse(responseText);
}

/**
 * Process Dahua records through attendance engine
 */
async function processDahuaRecords(
  device: DahuaDevice,
  dahuaRecords: DahuaRawRecord[]
): Promise<{ processed: number; duplicates: number; failed: number }> {
  
  // Map Dahua records to attendance engine format
  const attendanceRecords: AttendanceRecord[] = [];
  
  for (const dahuaRecord of dahuaRecords) {
    // Map device_user_id to student_id
    const studentId = await mapDeviceUserToStudent(
      device.id,
      dahuaRecord.UserID,
      device.school_id
    );
    
    if (!studentId) {
      console.warn(
        `[Dahua Poller] Device user ${dahuaRecord.UserID} not mapped to student (device: ${device.device_name})`
      );
      continue; // Skip unmapped users
    }
    
    // Convert Unix timestamp to MySQL datetime
    const timestamp = new Date(dahuaRecord.CreateTime * 1000);
    
    attendanceRecords.push({
      schoolId: device.school_id,
      studentId: studentId,
      deviceId: device.id,
      deviceType: 'dahua',
      method: mapDahuaMethod(dahuaRecord.Method),
      scanType: dahuaRecord.Type.toLowerCase(), // 'entry' or 'exit'
      timestamp: timestamp
    });
  }
  
  // Process batch through attendance engine
  if (attendanceRecords.length === 0) {
    return { processed: 0, duplicates: 0, failed: 0 };
  }
  
  const batchResult = await processAttendanceBatch(attendanceRecords);
  
  return {
    processed: batchResult.processed,
    duplicates: batchResult.duplicates,
    failed: batchResult.failed
  };
}

/**
 * Log sync operation to database
 */
async function logSync(
  deviceId: number,
  schoolId: number,
  recordsFetched: number,
  recordsProcessed: number,
  recordsFailed: number,
  errorMessage?: string
): Promise<void> {
  const connection = await getConnection();
  try {
    await connection.execute(
      `INSERT INTO device_sync_log 
       (device_id, school_id, sync_started_at, sync_completed_at, 
        records_fetched, records_processed, records_failed, status, error_message)
       VALUES (?, ?, NOW(), NOW(), ?, ?, ?, ?, ?)`,
      [
        deviceId,
        schoolId,
        recordsFetched,
        recordsProcessed,
        recordsFailed,
        errorMessage ? 'failed' : 'success',
        errorMessage || null
      ]
    );
  } finally {
    await connection.end();
  }
}

/**
 * Update device status and last poll time
 */
async function updateDeviceStatus(
  deviceId: number,
  status: 'active' | 'inactive' | 'error',
  errorMessage?: string
): Promise<void> {
  const connection = await getConnection();
  try {
    await connection.execute(
      `UPDATE devices 
       SET status = ?, last_poll_at = NOW(), last_error = ?
       WHERE id = ?`,
      [status, errorMessage || null, deviceId]
    );
  } finally {
    await connection.end();
  }
}

/**
 * Poll single Dahua device
 */
export async function pollDahuaDevice(device: DahuaDevice): Promise<void> {
  const startTime = Date.now();
  
  try {
    console.log(`[Dahua Poller] Polling device: ${device.device_name} (${device.device_ip}:${device.device_port})`);
    
    // Fetch records from device
    const dahuaRecords = await fetchDahuaRecords(device);
    console.log(`[Dahua Poller] Fetched ${dahuaRecords.length} records from ${device.device_name}`);
    
    // Process through attendance engine
    const result = await processDahuaRecords(device, dahuaRecords);
    
    console.log(
      `[Dahua Poller] Processed ${result.processed} records ` +
      `(${result.duplicates} duplicates, ${result.failed} failed) ` +
      `in ${Date.now() - startTime}ms`
    );
    
    // Update device status
    await updateDeviceStatus(device.id, 'active');
    
    // Log sync
    await logSync(
      device.id,
      device.school_id,
      dahuaRecords.length,
      result.processed,
      result.failed
    );
    
  } catch (error: any) {
    console.error(`[Dahua Poller] Error polling ${device.device_name}:`, error.message);
    
    // Update device status
    await updateDeviceStatus(device.id, 'error', error.message);
    
    // Log failed sync
    await logSync(
      device.id,
      device.school_id,
      0,
      0,
      0,
      error.message
    );
  }
}

/**
 * Poll all active Dahua devices for a school
 */
export async function pollAllDahuaDevices(schoolId?: number): Promise<void> {
  const connection = await getConnection();
  try {
    let query = `
      SELECT id, school_id, device_name, device_ip, device_port, 
             device_username, device_password, poll_interval, status, 
             last_poll_at, last_error
      FROM devices
      WHERE device_type = 'dahua' AND status IN ('active', 'error')
    `;
    
    const params: any[] = [];
    
    if (schoolId) {
      query += ' AND school_id = ?';
      params.push(schoolId);
    }
    
    const [devices] = await connection.execute<any[]>(query, params);
    
    console.log(`[Dahua Poller] Found ${devices.length} Dahua devices to poll`);
    
    // Poll each device sequentially (to avoid overwhelming network)
    for (const device of devices) {
      await pollDahuaDevice(device);
      
      // Small delay between devices
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
  } catch (error: any) {
    console.error('[Dahua Poller] Error polling devices:', error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

/**
 * Start continuous polling loop for Dahua devices
 * This would typically run in a separate worker process or cron job
 */
export async function startDahuaPollingLoop(intervalSeconds: number = 30): Promise<void> {
  console.log(`[Dahua Poller] Starting polling loop (interval: ${intervalSeconds}s)`);
  
  // Poll immediately on start
  await pollAllDahuaDevices();
  
  // Then poll at regular intervals
  setInterval(async () => {
    await pollAllDahuaDevices();
  }, intervalSeconds * 1000);
}
