import { query } from './src/lib/db';

async function run() {
  const sn = 'GED7254601154';

  const attlog = await query(
    `SELECT id, device_sn, device_user_id, user_id, check_time, verify_type, matched, student_id, staff_id, created_at
     FROM zk_parsed_logs
     WHERE device_sn = ? AND table_name = 'ATTLOG'
     ORDER BY id DESC
     LIMIT 50`,
    [sn],
  );
  console.log('ATTLOG_PARSED', JSON.stringify(attlog, null, 2));

  const operlog = await query(
    `SELECT id, device_sn, raw_line, created_at
     FROM zk_parsed_logs
     WHERE device_sn = ? AND table_name = 'OPERLOG'
     ORDER BY id DESC
     LIMIT 50`,
    [sn],
  );
  console.log('OPERLOG_PARSED', JSON.stringify(operlog, null, 2));

  const attlogLogs = await query(
    `SELECT id, device_sn, device_user_id, student_id, staff_id, check_time, matched, created_at
     FROM zk_attendance_logs
     WHERE device_sn = ?
     ORDER BY id DESC
     LIMIT 50`,
    [sn],
  );
  console.log('ZK_ATTENDANCE_LOGS', JSON.stringify(attlogLogs, null, 2));

  const devices = await query(
    `SELECT id, sn, school_id, status, last_seen, updated_at
     FROM devices WHERE sn = ? LIMIT 1`,
    [sn],
  );
  console.log('DEVICE', JSON.stringify(devices, null, 2));
}

run().catch((err) => {
  console.error('ERROR', err);
  process.exit(1);
});
