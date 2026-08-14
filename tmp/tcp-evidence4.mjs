import 'dotenv/config';
import mysql from 'mysql2/promise';
const conn = await mysql.createConnection({
  host: process.env.TIDB_HOST, port: 4000, user: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD, database: process.env.TIDB_DB || 'drais',
  ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }, timezone: 'Z',
});
const [d] = await conn.query(`SELECT sn, school_id, lan_ip, name FROM devices WHERE school_id IN (12004, 12011) OR sn='GED7254601154'`);
for (const r of d) console.log(JSON.stringify(r));
await conn.end();
