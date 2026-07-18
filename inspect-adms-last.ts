import { query } from './src/lib/db';

async function run() {
  const sn = 'GED7254601154';

  const raw = await query(
    `SELECT id, endpoint, raw_body, parsed_data, created_at
     FROM zk_raw_logs
     WHERE device_sn = ?
     ORDER BY id DESC
     LIMIT 20`,
    [sn],
  );
  console.log('RAW_LOGS', JSON.stringify(raw, null, 2));

  const parsed = await query(
    `SELECT id, raw_log_id, table_name, raw_line, user_id, check_time, matched, student_id, staff_id, status, created_at
     FROM zk_parsed_logs
     WHERE device_sn = ?
     ORDER BY id DESC
     LIMIT 40`,
    [sn],
  );
  console.log('PARSED_LOGS', JSON.stringify(parsed, null, 2));

  const punch = await query(
    `SELECT id, student_id, staff_id, device_user_id, check_time, matched, created_at
     FROM zk_attendance_logs
     WHERE device_sn = ?
     ORDER BY id DESC
     LIMIT 20`,
    [sn],
  );
  console.log('ATTENDANCE_LOGS', JSON.stringify(punch, null, 2));
}

run().catch((err) => {
  console.error('ERROR', err);
  process.exit(1);
});
