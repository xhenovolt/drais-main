import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const pool = mysql.createPool({
  host: process.env.DATABASE_HOST || process.env.MYSQL_HOST || 'localhost',
  user: process.env.DATABASE_USER || process.env.MYSQL_USER || 'root',
  password: process.env.DATABASE_PASSWORD || process.env.MYSQL_PASSWORD || '',
  database: process.env.DATABASE_NAME || process.env.MYSQL_DB || 'ibunbaz_drais',
});

const connection = await pool.getConnection();
const [students] = await connection.execute('SELECT id, person_id, school_id, admission_no FROM students ORDER BY id ASC LIMIT 50');
console.log(`Total students in first 50: ${students.length}\n`);
students.forEach(s => {
  console.log(`student_id: ${s.id}, person_id: ${s.person_id}, school_id: ${s.school_id}, admission_no: ${s.admission_no}`);
});
connection.release();
await pool.end();
