import { query } from './src/lib/db';

async function run() {
  const sn = 'GED7254601154';
  console.log('DESCRIBE zk_parsed_logs');
  const descParsed = await query('DESCRIBE zk_parsed_logs');
  console.log(JSON.stringify(descParsed, null, 2));

  console.log('DESCRIBE zk_attendance_logs');
  const descAttendance = await query('DESCRIBE zk_attendance_logs');
  console.log(JSON.stringify(descAttendance, null, 2));

  const parsed = await query(
    `SELECT id, raw_log_id, device_sn, school_id, table_name, raw_line, user_id, check_time, matched, student_id, staff_id, status, created_at
     FROM zk_parsed_logs
     WHERE device_sn = ?
     ORDER BY id DESC
     LIMIT 80`,
    [sn],
  );
  console.log('PARSED LOGS', JSON.stringify(parsed, null, 2));

  const att = await query(
    `SELECT id, device_sn, school_id, device_user_id, user_id, check_time, matched, student_id, staff_id, created_at
     FROM zk_attendance_logs
     WHERE device_sn = ?
     ORDER BY id DESC
     LIMIT 80`,
    [sn],
  );
  console.log('ATTENDANCE LOGS', JSON.stringify(att, null, 2));
}

run().catch((err) => {
  console.error('ERROR', err);
  process.exit(1);
});
