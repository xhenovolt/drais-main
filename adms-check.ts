import { query } from './src/lib/db';

async function run() {
  const sn = 'GED7254601154';

  console.log('DESCRIBE zk_parsed_logs');
  console.log(JSON.stringify(await query('DESCRIBE zk_parsed_logs'), null, 2));

  console.log('DESCRIBE zk_attendance_logs');
  console.log(JSON.stringify(await query('DESCRIBE zk_attendance_logs'), null, 2));

  const parsed = await query(
    `SELECT id, raw_log_id, device_sn, school_id, table_name, raw_line, user_id, check_time, matched, student_id, staff_id, status, created_at
     FROM zk_parsed_logs
     WHERE device_sn = ?
     ORDER BY id DESC
     LIMIT 50`,
    [sn],
  );
  console.log('LATEST zk_parsed_logs', JSON.stringify(parsed, null, 2));

  const att = await query(
    `SELECT id, device_sn, device_user_id, user_id, check_time, matched, student_id, staff_id, created_at
     FROM zk_attendance_logs
     WHERE device_sn = ?
     ORDER BY id DESC
     LIMIT 50`,
    [sn],
  );
  console.log('LATEST zk_attendance_logs', JSON.stringify(att, null, 2));

  const saabaParsed = await query(
    `SELECT id, table_name, raw_line, created_at FROM zk_parsed_logs WHERE device_sn = ? AND raw_line LIKE ? ORDER BY id DESC LIMIT 50`,
    [sn, '%SAABA%'],
  );
  console.log('SAABA_PARSED', JSON.stringify(saabaParsed, null, 2));

  const saabaAttendance = await query(
    `SELECT al.id, al.device_sn, al.device_user_id, al.check_time, al.matched, al.student_id, al.staff_id, p.first_name, p.last_name, al.created_at
     FROM zk_attendance_logs al
     LEFT JOIN students s ON al.student_id = s.id
     LEFT JOIN people p ON s.person_id = p.id
     WHERE al.device_sn = ? AND (p.first_name LIKE ? OR p.last_name LIKE ?)
     ORDER BY al.id DESC
     LIMIT 50`,
    [sn, '%Saaba%', '%Saaba%'],
  );
  console.log('SAABA_ATTENDANCE', JSON.stringify(saabaAttendance, null, 2));
}

run().catch((err) => {
  console.error('ERROR', err);
  process.exit(1);
});
