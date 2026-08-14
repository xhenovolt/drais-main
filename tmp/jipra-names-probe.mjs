import 'dotenv/config';
import mysql from 'mysql2/promise';
const conn = await mysql.createConnection({
  host: process.env.TIDB_HOST, port: 4000, user: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD, database: process.env.TIDB_DB || 'drais',
  ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }, timezone: 'Z',
});
const SN='GED7254601154', SCHOOL=12004;
const [nameless] = await conn.query(`
  SELECT COUNT(*) c, SUM(display_name IS NULL) nameless, SUM(matched=0) unmatched
    FROM attendance_raw_events WHERE school_id=? AND device_sn=?`, [SCHOOL, SN]);
console.log('raw events:', JSON.stringify(nameless[0]));
const [byPin] = await conn.query(`
  SELECT device_user_id pin, COUNT(*) c, SUM(display_name IS NULL) nameless, MAX(display_name) sample_name, MAX(matched) matched
    FROM attendance_raw_events WHERE school_id=? AND device_sn=?
    GROUP BY device_user_id ORDER BY nameless DESC, c DESC LIMIT 15`, [SCHOOL, SN]);
for (const r of byPin) console.log(JSON.stringify(r));
const [dir] = await conn.query(`
  SELECT COUNT(*) c, SUM(device_name IS NULL OR device_name LIKE 'PIN %') no_name, SUM(has_recent_echo=1) echoed
    FROM device_user_directory WHERE device_sn=?`, [SN]);
console.log('directory:', JSON.stringify(dir[0]));
const [dirSample] = await conn.query(`
  SELECT school_id, device_user_id pin, device_name, has_recent_echo
    FROM device_user_directory WHERE device_sn=? ORDER BY device_user_id+0 LIMIT 12`, [SN]);
for (const r of dirSample) console.log('dir:', JSON.stringify(r));
const [enr] = await conn.query(`
  SELECT COUNT(*) c FROM biometric_enrollments WHERE school_id=? AND status IN ('active','pending_capture')`, [SCHOOL]);
console.log('JIPRA active enrollments:', enr[0].c);
const [staff] = await conn.query(`SELECT COUNT(*) c FROM staff WHERE school_id=? AND deleted_at IS NULL`, [SCHOOL]);
console.log('JIPRA staff:', staff[0].c);
await conn.end();
