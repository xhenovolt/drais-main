// Restore the device's REAL user set (186 users from its own OPERLOG
// pushes, archived 2026-07-17) into device_user_directory as current.
import 'dotenv/config';
import fs from 'fs';
import mysql from 'mysql2/promise';
const conn = await mysql.createConnection({
  host: process.env.TIDB_HOST, port: 4000, user: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD, database: process.env.TIDB_DB || 'drais',
  ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }, timezone: 'Z',
});
const SN='GED7254601154', SCHOOL=12004;
const pins = new Map();
for (const f of ['archive/data-dumps/ged7254601154-raw-logs.json','archive/data-dumps/ged7254601154-raw-logs-2026-07-17.json']) {
  const data = JSON.parse(fs.readFileSync(f,'utf8'));
  for (const rec of data) {
    const body = rec.raw_body || '';
    for (const m of body.matchAll(/USER PIN=(\d+)\tName=([^\t\n]*)/g)) {
      if (m[2].trim()) pins.set(m[1], m[2].trim());
    }
  }
}
console.log('device users from OPERLOG:', pins.size);
let updated=0, inserted=0;
for (const [pin, name] of pins) {
  const r = await conn.query(
    `UPDATE device_user_directory SET has_recent_echo=1, device_name=COALESCE(NULLIF(device_name,''), ?), school_id=?
      WHERE device_sn=? AND device_user_id=?`, [name, SCHOOL, SN, pin]);
  if (r[0].affectedRows) { updated++; continue; }
  await conn.query(
    `INSERT INTO device_user_directory (school_id, device_sn, device_user_id, device_name, has_recent_echo, directory_status)
     VALUES (?, ?, ?, ?, 1, 'active')
     ON DUPLICATE KEY UPDATE has_recent_echo=1`, [SCHOOL, SN, pin, name]);
  inserted++;
}
// Pins NOT in the device's own user table are not current → unecho them.
const list = [...pins.keys()];
const [dem] = await conn.query(
  `UPDATE device_user_directory SET has_recent_echo=0
    WHERE device_sn=? AND device_user_id NOT IN (${list.map(()=>'?').join(',')})`, [SN, ...list]);
console.log(`echoed/updated: ${updated}, inserted: ${inserted}, demoted stale: ${dem.affectedRows}`);
const [chk] = await conn.query(`SELECT SUM(has_recent_echo=1) cur FROM device_user_directory WHERE device_sn=?`, [SN]);
console.log('current users in directory now:', chk[0].cur);
await conn.end();
