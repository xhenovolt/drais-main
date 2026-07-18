import { query } from './src/lib/db';

async function run() {
  const sn = 'GED7254601154';

  const latestPunches = await query(
    `SELECT id, device_sn, device_user_id, user_id, check_time, matched, student_id, staff_id, created_at
     FROM zk_attendance_logs
     WHERE device_sn = ?
     ORDER BY id DESC
     LIMIT 20`,
    [sn],
  );
  console.log('LATEST ATTENDANCE LOGS', JSON.stringify(latestPunches, null, 2));

  const latestParsedPunches = await query(
    `SELECT id, raw_log_id, table_name, raw_line, user_id, check_time, matched, student_id, staff_id, status, created_at
     FROM zk_parsed_logs
     WHERE device_sn = ?
       AND table_name = 'ATTLOG'
     ORDER BY id DESC
     LIMIT 40`,
    [sn],
  );
  console.log('LATEST PARSED ATTLOGS', JSON.stringify(latestParsedPunches, null, 2));

  const latestParsedOperlogs = await query(
    `SELECT id, raw_log_id, table_name, raw_line, user_id, created_at
     FROM zk_parsed_logs
     WHERE device_sn = ?
       AND table_name = 'OPERLOG'
     ORDER BY id DESC
     LIMIT 40`,
    [sn],
  );
  console.log('LATEST PARSED OPERLOGS', JSON.stringify(latestParsedOperlogs, null, 2));

  const saabaName = await query(
    `SELECT id, raw_log_id, table_name, raw_line, created_at
     FROM zk_parsed_logs
     WHERE device_sn = ?
       AND raw_line LIKE '%SAABA%'
     ORDER BY id DESC
     LIMIT 20`,
    [sn],
  );
  console.log('SAABA PARSED', JSON.stringify(saabaName, null, 2));
}

run().catch((err) => {
  console.error('ERROR', err);
  process.exit(1);
});
