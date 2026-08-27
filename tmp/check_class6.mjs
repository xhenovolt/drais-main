import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const conn = await mysql.createConnection({
  host: process.env.TIDB_HOST, port: parseInt(process.env.TIDB_PORT || '4000', 10),
  user: process.env.TIDB_USER, password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DB || 'drais', ssl: { rejectUnauthorized: false },
});
const [rows] = await conn.execute(`
  SELECT s.id, TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) name, e.status
  FROM enrollments e
  JOIN students s ON s.id = e.student_id
  LEFT JOIN people p ON p.id = s.person_id
  WHERE e.school_id = 8002 AND e.class_id = 392010 AND e.deleted_at IS NULL
  ORDER BY e.status, name
`);
console.log('PRIMARY SIX (392010) enrollment rows:', rows.length);
console.log(JSON.stringify(rows, null, 2));
await conn.end();
