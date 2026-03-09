import mysql from 'mysql2/promise';
import { getConnection } from '../db';

export async function getStudentsList() {
  const conn = await getConnection();
  try {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(`
      SELECT 
        s.id,
        s.admission_no,
        s.school_id,
        s.class_id,
        s.status,
        s.admission_date,
        p.first_name,
        p.last_name,
        p.gender,
        p.date_of_birth,
        p.photo_url,
        c.name as class_name,
        st.name as stream_name
      FROM students s
      JOIN people p ON s.person_id = p.id
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN streams st ON e.stream_id = st.id
      ORDER BY s.admission_no
    `);
    return rows;
  } finally {
    await conn.end();
  }
}

export async function getStudentById(id: number) {
  const conn = await getConnection();
  try {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(`
      SELECT 
        s.id,
        s.admission_no,
        s.school_id,
        s.class_id,
        s.status,
        s.admission_date,
        p.first_name,
        p.last_name,
        p.gender,
        p.date_of_birth,
        p.photo_url,
        p.email,
        p.phone,
        c.name as class_name,
        st.name as stream_name
      FROM students s
      JOIN people p ON s.person_id = p.id
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN streams st ON e.stream_id = st.id
      WHERE s.id = ?
    `, [id]);
    return rows[0] || null;
  } finally {
    await conn.end();
  }
}
