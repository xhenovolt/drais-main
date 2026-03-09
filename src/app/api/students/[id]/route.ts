import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const resolvedParams = await params;
    const { id } = resolvedParams;

    if (!id) {
      return NextResponse.json({ success: false, message: 'Student ID is required.' }, { status: 400 });
    }

    const connection = await getConnection();

    // Fetch student details
    const [student] = await connection.execute(
      `SELECT s.id, s.admission_no, s.status, s.admission_date, s.notes,
              p.first_name, p.last_name, p.other_name, p.gender, p.date_of_birth, p.phone, p.email, p.address, p.photo_url,
              e.class_id, e.theology_class_id, e.stream_id, e.academic_year_id, e.term_id, c.name AS class_name,
              d.name AS district_name, v.name AS village_name,
              h.no_of_juzus_memorized, h.previous_school, h.previous_school_year, h.previous_class_theology, h.previous_class_secular
       FROM students s
       JOIN people p ON s.person_id = p.id
       LEFT JOIN enrollments e ON e.student_id = s.id
       LEFT JOIN villages v ON v.id = s.village_id
       LEFT JOIN districts d ON d.id = p.school_id
       LEFT JOIN classes c ON c.id = e.class_id
       LEFT JOIN student_history h ON h.student_id = s.id
       WHERE s.id = ? AND s.school_id = ?`,
      [id, schoolId]
    );

    await connection.end();

    if (!student.length) {
      return NextResponse.json({ success: false, message: 'Student not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: student[0] });
  } catch (error: any) {
    console.error('Error fetching student data:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch student data.', error: error.message }, { status: 500 });
  }
}