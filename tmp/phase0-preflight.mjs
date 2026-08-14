import 'dotenv/config';
import mysql from 'mysql2/promise';
const conn = await mysql.createConnection({
  host: process.env.TIDB_HOST, port: 4000, user: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD, database: process.env.TIDB_DB || 'drais',
  ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }, timezone: 'Z',
});
// 1. column type of device_reported_time + dedup key
const [cols] = await conn.query(`SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='attendance_raw_events' AND COLUMN_NAME IN ('device_reported_time','punch_at','source')`);
console.log('── column types:', JSON.stringify(cols));
const [idx] = await conn.query(`SHOW INDEX FROM attendance_raw_events WHERE Key_name LIKE 'uk%'`);
console.log('── unique keys:', [...new Set(idx.map(i=>i.Key_name))].map(k=>`${k}(${idx.filter(i=>i.Key_name===k).map(i=>i.Column_name).join(',')})`).join(' '));

// 2. CRITICAL: do the 206 manual rows duplicate zkteco_push rows? (same sn+pin+punch_at exact, and ±90s window)
const [dupExact] = await conn.query(`
  SELECT COUNT(*) c FROM attendance_raw_events m
  JOIN attendance_raw_events p
    ON p.device_sn = m.device_sn AND p.device_user_id = m.device_user_id
   AND p.punch_at = m.punch_at AND p.source = 'zkteco_push'
  WHERE m.source = 'manual'`);
const [dupNear] = await conn.query(`
  SELECT COUNT(DISTINCT m.id) c FROM attendance_raw_events m
  JOIN attendance_raw_events p
    ON p.device_sn = m.device_sn AND p.device_user_id = m.device_user_id
   AND p.source = 'zkteco_push'
   AND ABS(TIMESTAMPDIFF(SECOND, p.punch_at, m.punch_at)) <= 90
  WHERE m.source = 'manual'`);
console.log(`── manual rows duplicating push: exact=${dupExact[0].c} within90s=${dupNear[0].c} of 206`);

// 3. what data exists under school 12011 for this sn (tenancy fix blast radius)
for (const [label, sql] of [
  ['raw_events@12011', `SELECT COUNT(*) c FROM attendance_raw_events WHERE device_sn='GED7254601154' AND school_id=12011`],
  ['raw_events@12004', `SELECT COUNT(*) c FROM attendance_raw_events WHERE device_sn='GED7254601154' AND school_id=12004`],
  ['zk_commands sn', `SELECT school_id, COUNT(*) c FROM zk_device_commands WHERE device_sn='GED7254601154' GROUP BY school_id`],
  ['devices rows', `SELECT id, sn, school_id, lan_ip FROM devices WHERE sn='GED7254601154'`],
]) {
  try { const [r] = await conn.query(sql); console.log(`── ${label}:`, JSON.stringify(r)); } catch(e){ console.log(`── ${label}: ${e.message.split('\n')[0]}`); }
}
// 4. were the manual punches on Jul-17 morning also captured by push that day?
const [jul17] = await conn.query(`
  SELECT source, COUNT(*) c FROM attendance_raw_events
  WHERE device_sn='GED7254601154' AND punch_at >= '2026-07-17 00:00:00' AND punch_at < '2026-07-18 00:00:00'
  GROUP BY source`);
console.log('── Jul-17 rows for this device by source:', JSON.stringify(jul17));
await conn.end();
