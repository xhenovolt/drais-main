import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const conn = await mysql.createConnection({
  host: process.env.TIDB_HOST, port: parseInt(process.env.TIDB_PORT || '4000', 10),
  user: process.env.TIDB_USER, password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DB || 'drais', ssl: { rejectUnauthorized: false },
});
const [r] = await conn.execute(`SELECT COUNT(*) n, SUM(CASE WHEN type='debit' THEN amount ELSE 0 END) debit, SUM(CASE WHEN type='credit' THEN amount ELSE 0 END) credit FROM student_ledger WHERE school_id=8002`);
console.log(JSON.stringify(r, null, 2));
await conn.end();
