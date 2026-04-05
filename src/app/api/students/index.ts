import type { NextApiRequest, NextApiResponse } from 'next';
import mysql from 'mysql2/promise';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'drais_school',
  });

  const { q = '', page = '1', size = '20', class_id = '' } = req.query;
  const pageNum = Math.max(1, parseInt(page as string, 10));
  const pageSize = Math.max(1, Math.min(100, parseInt(size as string, 10)));
  const offset = (pageNum - 1) * pageSize;
  let where = 'WHERE s.deleted_at IS NULL';
  let params: any[] = [];
  if (q) {
    where += ' AND (LOWER(p.first_name) LIKE ? OR LOWER(p.last_name) LIKE ? OR s.admission_no LIKE ?)';
    const likeQ = `%${String(q).toLowerCase()}%`;
    params.push(likeQ, likeQ, `%${q}%`);
  }
  if (class_id) {
    where += ' AND e.class_id = ?';
    params.push(class_id);
  }
  const sql = `SELECT s.id, s.admission_no, s.status, s.admission_date, p.first_name, p.last_name, e.class_id
    FROM students s
    JOIN people p ON p.id = s.person_id
    LEFT JOIN enrollments e ON e.student_id = s.id
    ${where}
    ORDER BY s.id DESC
    LIMIT ${pageSize} OFFSET ${offset}`;
  const [rows] = await connection.execute(sql, params);
  const [countRows] = await connection.execute(`SELECT COUNT(*) as total FROM students s JOIN people p ON p.id = s.person_id LEFT JOIN enrollments e ON e.student_id = s.id ${where}`, params);
  const total = (countRows as any)[0]?.total || 0;
  await connection.end();
  res.status(200).json({ data: rows, page: pageNum, size: pageSize, total });
}
