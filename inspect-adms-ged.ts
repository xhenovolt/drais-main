import { query } from './src/lib/db';

async function run() {
  const sn = 'GED7254601154';

  const rawLogs = await query(
    `SELECT id, device_sn, school_id, endpoint, http_method, source_ip, user_agent, raw_body, parsed_data, created_at
     FROM zk_raw_logs
     WHERE device_sn = ?
     ORDER BY id DESC
     LIMIT 40`,
    [sn],
  );
  console.log('RAW_LOGS', JSON.stringify(rawLogs, null, 2));

  const parsed = await query(
    `SELECT id, raw_log_id, device_sn, school_id, table_name, raw_line, user_id, check_time, verify_type, inout_mode, work_code, log_id, matched, student_id, staff_id, status, error_message, created_at
     FROM zk_parsed_logs
     WHERE device_sn = ?
     ORDER BY id DESC
     LIMIT 100`,
    [sn],
  );
  console.log('PARSED_LOGS', JSON.stringify(parsed, null, 2));

  const punchLogs = await query(
    `SELECT id, school_id, device_sn, device_id, student_id, staff_id, device_user_id, status, check_time, created_at, raw_event_id
     FROM zk_attendance_logs
     WHERE device_sn = ?
     ORDER BY id DESC
     LIMIT 100`,
    [sn],
  );
  console.log('ATTENDANCE_LOGS', JSON.stringify(punchLogs, null, 2));

  const device = await query(
    `SELECT id, sn, school_id, status, created_at, updated_at
     FROM devices
     WHERE sn = ?
     LIMIT 1`,
    [sn],
  );
  console.log('DEVICE', JSON.stringify(device, null, 2));
}

run().catch((err) => {
  console.error('ERROR', err);
  process.exit(1);
});
