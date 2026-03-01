import { NextResponse } from 'next/server';
import mysql, { RowDataPacket } from 'mysql2/promise';
import { getSchoolInfo } from '@/lib/schoolConfig';

const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'drais_school',
};

export async function GET() {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);

    // Fetch school info from centralized configuration (single source of truth)
    const schoolCfg = getSchoolInfo();
    const schoolInfo = {
      name: schoolCfg.name || 'Ibun Baz Girls Secondary School',
      address: schoolCfg.address || 'Busei, Iganga along Iganga-Tororo highway'
    };

    // Fetch class results grouped by student
    const [results] = await connection.execute<RowDataPacket[]>(
      `SELECT 
        students.id AS student_id,
        CONCAT(people.first_name, ' ', people.last_name) AS student_name,
        people.email,
        people.phone,
        students.status,
        branches.name AS branch_name,
        subjects.name AS subject_name,
        class_results.score,
        class_results.grade,
        class_results.remarks
      FROM class_results
      JOIN students ON class_results.student_id = students.id
      JOIN people ON students.person_id = people.id
      LEFT JOIN branches ON students.village_id = branches.id
      JOIN subjects ON class_results.subject_id = subjects.id
      WHERE students.deleted_at IS NULL
      ORDER BY students.id`
    );

    // Map results to custom type and group by student
    const learners = results.reduce((acc: Record<number, any>, row: RowDataPacket) => {
      const studentId = row.student_id;
      if (!acc[studentId]) {
        acc[studentId] = {
          id: studentId,
          name: row.student_name,
          email: row.email,
          phone: row.phone,
          status: row.status,
          branch_name: row.branch_name,
          grades: [],
        };
      }
      acc[studentId].grades.push({
        subject: row.subject_name,
        score: row.score,
        grade: row.grade,
        remarks: row.remarks,
      });
      return acc;
    }, {});

    return NextResponse.json({
      schoolInfo,
      learners: Object.values(learners),
      labels: {
        name: 'Name',
        email: 'Email',
        phone: 'Phone',
        status: 'Status',
        branch: 'Branch',
        grades: 'Grades',
        subject: 'Subject',
        score: 'Score',
        remarks: 'Remarks',
      },
    });
  } catch (error) {
    console.error('Error fetching class results:', error);
    return NextResponse.json({ error: 'Failed to fetch class results' }, { status: 500 });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}