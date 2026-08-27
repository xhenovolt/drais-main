import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const conn = await mysql.createConnection({
  host: process.env.TIDB_HOST, port: parseInt(process.env.TIDB_PORT || '4000', 10),
  user: process.env.TIDB_USER, password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DB || 'drais', ssl: { rejectUnauthorized: false },
});
const [rows] = await conn.execute(`SELECT id, student_id, type, amount, reference, term_id, notes FROM student_ledger WHERE school_id = 8002 ORDER BY id DESC LIMIT 20`);
console.log('LAST 20 LEDGER ROWS:', JSON.stringify(rows, null, 2));
const [cnt] = await conn.execute(`SELECT COUNT(*) n, SUM(amount) total FROM student_ledger WHERE school_id=8002 AND reference='MASTORAH Import 2026-08'`);
console.log('MASTORAH ROWS:', JSON.stringify(cnt, null, 2));
const [balSample] = await conn.execute(`
  SELECT sl.student_id, TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) name,
    SUM(CASE WHEN sl.type='debit' THEN sl.amount ELSE 0 END) - SUM(CASE WHEN sl.type='credit' THEN sl.amount ELSE 0 END) AS balance
  FROM student_ledger sl
  JOIN students s ON s.id = sl.student_id
  LEFT JOIN people p ON p.id = s.person_id
  WHERE sl.school_id = 8002 AND sl.reference = 'MASTORAH Import 2026-08'
  GROUP BY sl.student_id, name
  ORDER BY sl.student_id
  LIMIT 15
`);
console.log('SAMPLE BALANCES FROM MASTORAH IMPORT:', JSON.stringify(balSample, null, 2));
await conn.end();
