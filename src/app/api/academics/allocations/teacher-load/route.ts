import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { checkModule } from '@/lib/auth/requireModule';

// ─────────────────────────────────────────────────────────────────────────────
// GET: Teacher workload statistics
// Returns teacher load: subjects taught, classes handled, total assignments
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const teacherId = searchParams.get('teacher_id');

    connection = await getConnection();

    if (teacherId) {
      // Get workload for specific teacher
      const [rows] = await connection.execute(
        `SELECT
           cs.teacher_id,
           COUNT(DISTINCT cs.class_id) AS classes_count,
           COUNT(DISTINCT cs.subject_id) AS subjects_count,
           COUNT(*) AS total_assignments,
           CONCAT(p.first_name, ' ', p.last_name) AS teacher_name,
           s.staff_no
         FROM class_subjects cs
         JOIN classes c ON cs.class_id = c.id
         JOIN staff s ON cs.teacher_id = s.id
         JOIN people p ON s.person_id = p.id
         WHERE cs.teacher_id = ? AND c.school_id = ?
         GROUP BY cs.teacher_id`,
        [teacherId, session.schoolId]
      );

      if (rows.length === 0) {
        await connection.end();
        return NextResponse.json({ success: false, message: 'Teacher not found or no assignments.' }, { status: 404 });
      }

      const teacher = rows[0];
      await connection.end();

      return NextResponse.json({
        success: true,
        data: {
          teacher_id: teacher.teacher_id,
          teacher_name: teacher.teacher_name,
          staff_no: teacher.staff_no,
          classes_count: teacher.classes_count,
          subjects_count: teacher.subjects_count,
          total_assignments: teacher.total_assignments,
        },
      });
    } else {
      // Get workload for all teachers in the school
      const [rows] = await connection.execute(
        `SELECT
           cs.teacher_id,
           COUNT(DISTINCT cs.class_id) AS classes_count,
           COUNT(DISTINCT cs.subject_id) AS subjects_count,
           COUNT(*) AS total_assignments,
           CONCAT(p.first_name, ' ', p.last_name) AS teacher_name,
           s.staff_no
         FROM class_subjects cs
         JOIN classes c ON cs.class_id = c.id
         JOIN staff s ON cs.teacher_id = s.id
         JOIN people p ON s.person_id = p.id
         WHERE c.school_id = ? AND cs.teacher_id IS NOT NULL
         GROUP BY cs.teacher_id
         ORDER BY teacher_name ASC`,
        [session.schoolId]
      );

      await connection.end();

      return NextResponse.json({
        success: true,
        data: rows.map((r: any) => ({
          teacher_id: r.teacher_id,
          teacher_name: r.teacher_name,
          staff_no: r.staff_no,
          classes_count: r.classes_count,
          subjects_count: r.subjects_count,
          total_assignments: r.total_assignments,
        })),
        count: rows.length,
      });
    }
  } catch (error) {
    if (connection) await connection.end();
    console.error('Error fetching teacher workload:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
