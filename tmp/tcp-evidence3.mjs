import 'dotenv/config';
import mysql from 'mysql2/promise';
const conn = await mysql.createConnection({
  host: process.env.TIDB_HOST, port: 4000, user: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD, database: process.env.TIDB_DB || 'drais',
  ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }, timezone: 'Z',
});
const [cols] = await conn.query(`SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='attendance_raw_events' ORDER BY ordinal_position`);
console.log('columns:', cols.map(c=>c.COLUMN_NAME).join(', '));
const [m] = await conn.query(`
  SELECT school_id, device_sn, COUNT(*) c, MIN(ingested_at) first_seen, MAX(ingested_at) last_seen
    FROM attendance_raw_events WHERE source='manual' GROUP BY school_id, device_sn`).catch(async () => 
  conn.query(`SELECT school_id, device_sn, COUNT(*) c FROM attendance_raw_events WHERE source='manual' GROUP BY school_id, device_sn`));
for (const r of m) console.log(JSON.stringify(r));
const [s] = await conn.query(`
  SELECT id, device_reported_time, punch_at, time_source, time_confidence, clock_skew_seconds
    FROM attendance_raw_events WHERE source='manual' ORDER BY id DESC LIMIT 6`);
console.log('── sample manual rows:'); for (const r of s) console.log(JSON.stringify(r));
await conn.end();
