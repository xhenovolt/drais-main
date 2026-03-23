import mysql from 'mysql2/promise';
import { getConnection } from '../db';

export async function getStudentsList(schoolId?: number) {
  const conn = await getConnection();
  try {
    const where = schoolId ? 'WHERE s.deleted_at IS NULL AND s.school_id = ?' : 'WHERE s.deleted_at IS NULL';
    const params = schoolId ? [schoolId] : [];
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(`
      SELECT
        s.id,
        s.admission_no,
        s.school_id,
        s.status,
        s.admission_date,
        p.first_name,
        p.last_name,
        p.gender,
        p.date_of_birth,
        p.photo_url,
        e.class_id,
        c.name  AS class_name,
        st.name AS stream_name,
        e.term_id,
        t.name  AS term_name,
        e.academic_year_id,
        ay.name AS academic_year_name,
        e.enrollment_type,
        e.status AS enrollment_status
      FROM students s
      LEFT JOIN people p ON s.person_id = p.id
      LEFT JOIN enrollments e
             ON e.student_id = s.id
            AND e.status     = 'active'
            AND e.deleted_at IS NULL
      LEFT JOIN classes c         ON e.class_id         = c.id
      LEFT JOIN streams st        ON e.stream_id        = st.id
      LEFT JOIN terms t           ON e.term_id          = t.id
      LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
      ${where}
      ORDER BY COALESCE(p.last_name, '') ASC, COALESCE(p.first_name, '') ASC
    `, params);
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
      LEFT JOIN people p ON s.person_id = p.id
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
