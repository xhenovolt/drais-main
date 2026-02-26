/**
 * Device Sync Worker
 * Polls biometric devices for new attendance logs
 * 
 * Usage: node workers/syncDeviceLogs.js
 * 
 * Cron: Run every minute via crontab
 */

const mysql = require('mysql2/promise');

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'drais_school',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0
};

let pool;

// Initialize database connection
async function initDb() {
  pool = mysql.createPool(dbConfig);
}

// Fetch new logs from a device
async function fetchDeviceLogs(device) {
  try {
    const { parseDahuaRawData } = require('../src/lib/dahua');
    
    const url = `${device.protocol}://${device.ip_address}:${device.port}${device.api_url}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${device.username || ''}:${device.password || ''}`).toString('base64')}`,
        'Content-Type': 'text/plain'
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      throw new Error(`Device returned ${response.status}`);
    }

    const rawData = await response.text();
    
    // Parse the raw data
    const parsed = parseDahuaRawData(rawData);
    
    return {
      success: true,
      records: parsed.records,
      count: parsed.found
    };
  } catch (error) {
    console.error(`Error fetching logs from device ${device.id}:`, error.message);
    return {
      success: false,
      error: error.message,
      records: []
    };
  }
}

// Store logs in database
async function storeLogs(deviceId, records) {
  if (!pool) await initDb();
  
  const connection = await pool.getConnection();
  
  try {
    const results = {
      stored: 0,
      duplicates: 0,
      failed: 0
    };

    for (const record of records) {
      try {
        // Check for duplicates
        const [existing] = await connection.execute(
          `SELECT id FROM device_logs 
           WHERE device_id = ? AND user_identifier = ? AND timestamp = ?`,
          [deviceId, record.cardNo || record.userId, new Date(record.createTime * 1000)]
        );

        if (existing.length > 0) {
          results.duplicates++;
          continue;
        }

        // Determine event type (entry/exit)
        const eventType = record.type === 'Exit' ? 'exit' : 'entry';
        
        // Determine method
        let method = 'unknown';
        if (record.method === '1' || record.methodType === 'fingerprint') method = 'fingerprint';
        else if (record.method === '21' || record.methodType === 'card') method = 'card';
        else if (record.methodType === 'face') method = 'face';
        else if (record.methodType === 'password') method = 'password';

        // Insert the log
        await connection.execute(
          `INSERT INTO device_logs 
           (device_id, device_type, user_identifier, timestamp, event_type, method, raw_payload, synced_at, processed) 
           VALUES (?, 'dahua', ?, ?, ?, ?, ?, NOW(), 0)`,
          [
            deviceId,
            record.cardNo || record.userId || '',
            new Date(record.createTime * 1000),
            eventType,
            method,
            JSON.stringify(record)
          ]
        );

        results.stored++;
      } catch (err) {
        console.error('Error storing log:', err.message);
        results.failed++;
      }
    }

    return results;
  } finally {
    connection.release();
  }
}

// Update sync checkpoint
async function updateCheckpoint(deviceId, timestamp, recordCount, status, error = null) {
  if (!pool) await initDb();
  
  await pool.execute(
    `INSERT INTO device_sync_checkpoints 
     (device_id, last_sync_timestamp, last_sync_record_count, sync_status, sync_error) 
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE 
     last_sync_timestamp = VALUES(last_sync_timestamp),
     last_sync_record_count = VALUES(last_sync_record_count),
     sync_status = VALUES(sync_status),
     sync_error = VALUES(sync_error)`,
    [deviceId, timestamp, recordCount, status, error]
  );
}

// Process attendance from logs
async function processAttendance() {
  if (!pool) await initDb();
  
  const connection = await pool.getConnection();
  
  try {
    // Get unprocessed logs with user matches
    const [logs] = await connection.execute(
      `SELECT dl.*, s.id as student_id, st.id as staff_id
       FROM device_logs dl
       LEFT JOIN students s ON dl.user_identifier = s.card_no AND dl.user_type = 'unknown'
       LEFT JOIN staff st ON dl.user_identifier = st.card_no AND dl.user_type = 'unknown'
       WHERE dl.processed = 0
       AND (s.id IS NOT NULL OR st.id IS NOT NULL)
       ORDER BY dl.timestamp ASC
       LIMIT 1000`
    );

    if (logs.length === 0) return { processed: 0 };

    const results = { processed: 0 };

    for (const log of logs) {
      try {
        const userId = log.student_id || log.staff_id;
        const userType = log.student_id ? 'learner' : 'staff';
        const date = log.timestamp.toISOString().split('T')[0];
        const time = log.timestamp.toTimeString().split(' ')[0];

        // Check if attendance session exists for this user/date
        const [existing] = await connection.execute(
          `SELECT id, first_scan_time, last_scan_time FROM attendance_sessions_v2 
           WHERE user_id = ? AND user_type = ? AND date = ?`,
          [userId, userType, date]
        );

        if (existing.length > 0) {
          // Update existing session
          const session = existing[0];
          
          // Update first_scan_time if this is earlier
          if (!session.first_scan_time || time < session.first_scan_time) {
            await connection.execute(
              `UPDATE attendance_sessions_v2 SET first_scan_time = ? WHERE id = ?`,
              [time, session.id]
            );
          }
          
          // Update last_scan_time if this is later
          if (!session.last_scan_time || time > session.last_scan_time) {
            await connection.execute(
              `UPDATE attendance_sessions_v2 SET last_scan_time = ? WHERE id = ?`,
              [time, session.id]
            );
          }
        } else {
          // Get attendance rules for this user type
          const [rules] = await connection.execute(
            `SELECT * FROM attendance_rules 
             WHERE user_type = ? AND day_of_week = LOWER(DAYNAME(?)) AND is_active = 1
             LIMIT 1`,
            [userType, date]
          );

          let status = 'Present';
          let arrivalStatus = 'present';

          if (rules.length > 0) {
            const rule = rules[0];
            const arrivalTime = new Date(`${date}T${time}`);
            const expectedStart = new Date(`${date}T${rule.start_time}`);
            const lateThreshold = new Date(expectedStart.getTime() + rule.late_threshold_minutes * 60000);

            if (arrivalTime > lateThreshold) {
              status = 'Late';
              arrivalStatus = 'late';
            }
          }

          // Create new session
          await connection.execute(
            `INSERT INTO attendance_sessions_v2 
             (user_id, user_type, date, first_scan_time, last_scan_time, status, source) 
             VALUES (?, ?, ?, ?, ?, ?, 'device')`,
            [userId, userType, date, time, time, status]
          );
        }

        // Mark log as processed
        await connection.execute(
          `UPDATE device_logs SET processed = 1 WHERE id = ?`,
          [log.id]
        );

        results.processed++;
      } catch (err) {
        console.error('Error processing log:', err.message);
      }
    }

    return results;
  } finally {
    connection.release();
  }
}

// Main sync function
async function syncAllDevices() {
  console.log(`[${new Date().toISOString()}] Starting device sync...`);
  
  if (!pool) await initDb();
  
  try {
    // Get devices with auto_sync enabled
    const [devices] = await pool.execute(
      `SELECT * FROM dahua_devices 
       WHERE status = 'active' AND auto_sync_enabled = 1 
       AND (last_poll_at IS NULL OR last_poll_at < DATE_SUB(NOW(), INTERVAL poll_interval_seconds SECOND))`
    );

    console.log(`Found ${devices.length} devices to sync`);

    for (const device of devices) {
      console.log(`Syncing device: ${device.device_name} (${device.ip_address})`);
      
      // Update poll status
      await pool.execute(
        `UPDATE dahua_devices SET poll_status = 'polling' WHERE id = ?`,
        [device.id]
      );

      // Fetch logs
      const fetchResult = await fetchDeviceLogs(device);
      
      if (fetchResult.success) {
        // Store logs
        const storeResult = await storeLogs(device.id, fetchResult.records);
        
        // Update checkpoint
        await updateCheckpoint(
          device.id,
          new Date(),
          storeResult.stored,
          'success'
        );

        // Update device status
        await pool.execute(
          `UPDATE dahua_devices SET 
           last_poll_at = NOW(), 
           poll_status = 'idle',
           last_sync = NOW(),
           last_sync_status = 'success'
           WHERE id = ?`,
          [device.id]
        );

        console.log(`  - Fetched ${fetchResult.count} records, stored ${storeResult.stored} new logs`);
      } else {
        // Update checkpoint with error
        await updateCheckpoint(
          device.id,
          new Date(),
          0,
          'failed',
          fetchResult.error
        );

        // Update device status
        await pool.execute(
          `UPDATE dahua_devices SET 
           poll_status = 'error',
           last_sync_status = 'failed',
           last_error_message = ?
           WHERE id = ?`,
          [fetchResult.error, device.id]
        );

        console.log(`  - Error: ${fetchResult.error}`);
      }
    }

    // Process attendance from new logs
    console.log('Processing attendance from new logs...');
    const processResult = await processAttendance();
    console.log(`Processed ${processResult.processed} attendance records`);

    console.log(`[${new Date().toISOString()}] Device sync completed`);
  } catch (error) {
    console.error('Sync error:', error);
  }
}

// Run if called directly
if (require.main === module) {
  initDb()
    .then(() => syncAllDevices())
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { syncAllDevices, fetchDeviceLogs, storeLogs, processAttendance };
