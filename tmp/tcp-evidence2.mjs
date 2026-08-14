import 'dotenv/config';
import mysql from 'mysql2/promise';
const conn = await mysql.createConnection({
  host: process.env.TIDB_HOST, port: 4000, user: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD, database: process.env.TIDB_DB || 'drais',
  ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }, timezone: 'Z',
});
const [m] = await conn.query(`
  SELECT school_id, device_sn, COUNT(*) c, MIN(created_at) first_seen, MAX(created_at) last_seen,
         MIN(punch_at) min_punch, MAX(punch_at) max_punch
    FROM attendance_raw_events WHERE source='manual' GROUP BY school_id, device_sn`);
console.log('── manual (TCP pull) rows by device:'); for (const r of m) console.log(JSON.stringify(r));
const [s] = await conn.query(`
  SELECT device_reported_time, punch_at, time_source, time_confidence, clock_skew_seconds, created_at
    FROM attendance_raw_events WHERE source='manual' ORDER BY id DESC LIMIT 6`);
console.log('── sample manual rows:'); for (const r of s) console.log(JSON.stringify(r));
await conn.end();
