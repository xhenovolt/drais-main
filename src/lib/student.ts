import mysql from 'mysql2/promise';
import { pool } from './db';

export async function generateAdmissionNo(schoolId: number = 1): Promise<string> {
  if (!pool) {
    throw new Error('Database pool not initialized');
  }
  const year = new Date().getFullYear();
  
  // Get the highest admission number for this school and year (XHN/####/year format)
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT admission_no FROM students 
     WHERE school_id = ? AND admission_no LIKE ? 
     ORDER BY CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(admission_no, '/', 2), '/', -1) AS UNSIGNED) DESC 
     LIMIT 1`,
    [schoolId, `XHN/%/${year}`]
  );
  
  let seq = 1;
  if (rows.length && rows[0].admission_no) {
    const last: string = rows[0].admission_no;
    const parts = last.split('/');
    const num = parseInt(parts[1] || '0', 10);
    seq = num + 1;
  }
  
  // Ensure we stay below 1000
  if (seq > 999) {
    throw new Error(`Admission number sequence exceeded limit for school ${schoolId} in year ${year}`);
  }
  
  const padded = String(seq).padStart(4, '0');
  return `XHN/${padded}/${year}`;
}
