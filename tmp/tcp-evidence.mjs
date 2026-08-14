import 'dotenv/config';
import mysql from 'mysql2/promise';
const conn = await mysql.createConnection({
  host: process.env.TIDB_HOST, port: 4000, user: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD, database: process.env.TIDB_DB || 'drais',
  ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }, timezone: 'Z',
});
// 1. Source + time_source distribution
const [dist] = await conn.query(`
  SELECT source, time_source, time_confidence, COUNT(*) c
    FROM attendance_raw_events GROUP BY source, time_source, time_confidence ORDER BY c DESC LIMIT 20`);
console.log('── source/time_source distribution:'); for (const r of dist) console.log(JSON.stringify(r));
// 2. Wall-clock delta: punch_at(+3h wall) vs device_reported_time, bucketed, per source
const [delta] = await conn.query(`
  SELECT source,
         ROUND(TIMESTAMPDIFF(SECOND, STR_TO_DATE(device_reported_time, '%Y-%m-%d %H:%i:%s'),
               DATE_ADD(punch_at, INTERVAL 180 MINUTE)) / 3600, 1) AS delta_hours,
         COUNT(*) c
    FROM attendance_raw_events
   WHERE device_reported_time IS NOT NULL
   GROUP BY source, delta_hours ORDER BY c DESC LIMIT 25`);
console.log('── wall delta hours (punch_at_wall − device_reported), per source:');
for (const r of delta) console.log(JSON.stringify(r));
// 3. Device clock state
const [devs] = await conn.query(`
  SELECT sn, school_id, clock_offset_seconds, tz_offset_minutes, clock_last_synced_at
    FROM devices ORDER BY school_id LIMIT 20`);
console.log('── devices clock state:'); for (const r of devs) console.log(JSON.stringify(r));
await conn.end();
