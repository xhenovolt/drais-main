import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
export async function GET(req: NextRequest) {
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    // school_id derived from session below
    const termId = searchParams.get('term_id');
    const classId = searchParams.get('class_id');
    
    const connection = await getConnection();
    
    // Performance trends analysis
    const performanceTrends = await connection.execute(`
      SELECT 
        s.id as student_id,
        CONCAT(p.first_name, ' ', p.last_name) as student_name,
        c.name as class_name,
        cr.score,
        cr.grade,
        sub.name as subject_name,
        rt.name as result_type,
        cr.created_at,
        t.name as term_name,
        (
          SELECT cr2.score 
          FROM class_results cr2 
          WHERE cr2.student_id = s.id 
            AND cr2.subject_id = sub.id 
            AND cr2.created_at < cr.created_at
          ORDER BY cr2.created_at DESC 
          LIMIT 1
        ) as previous_score
      FROM class_results cr
      JOIN students s ON cr.student_id = s.id AND s.deleted_at IS NULL
      JOIN people p ON s.person_id = p.id AND p.deleted_at IS NULL
      JOIN classes c ON cr.class_id = c.id
      JOIN subjects sub ON cr.subject_id = sub.id
      JOIN result_types rt ON cr.result_type_id = rt.id
      LEFT JOIN terms t ON cr.term_id = t.id
      WHERE s.school_id = ?
      ${termId ? 'AND cr.term_id = ?' : ''}
      ${classId ? 'AND cr.class_id = ?' : ''}
      ORDER BY s.id, cr.created_at DESC
    `, [schoolId, ...(termId ? [termId] : []), ...(classId ? [classId] : [])]);

    // At-risk students (declining performance)
    const atRiskStudents = await connection.execute(`
      SELECT 
        s.id as student_id,
        CONCAT(p.first_name, ' ', p.last_name) as student_name,
        c.name as class_name,
        AVG(cr.score) as avg_score,
        COUNT(CASE WHEN cr.score < 50 THEN 1 END) as failing_subjects,
        COUNT(cr.id) as total_subjects,
        MAX(sa.date) as last_attendance_date,
        COUNT(CASE WHEN sa.status = 'present' THEN 1 END) as attendance_count,
        COUNT(sa.id) as total_attendance_records
      FROM students s
      JOIN people p ON s.person_id = p.id AND p.deleted_at IS NULL
      JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      JOIN classes c ON e.class_id = c.id
      LEFT JOIN class_results cr ON s.id = cr.student_id
      LEFT JOIN student_attendance sa ON s.id = sa.student_id
      WHERE s.school_id = ? AND s.status = 'active' AND s.deleted_at IS NULL
      GROUP BY s.id, p.first_name, p.last_name, c.name
      HAVING avg_score < 60 OR failing_subjects >= 2 OR 
             (attendance_count / NULLIF(total_attendance_records, 0)) < 0.8
      ORDER BY avg_score ASC, failing_subjects DESC
    `, [schoolId]);

    // Top performers
    const topPerformers = await connection.execute(`
      SELECT 
        s.id as student_id,
        CONCAT(p.first_name, ' ', p.last_name) as student_name,
        c.name as class_name,
        AVG(cr.score) as avg_score,
        COUNT(CASE WHEN cr.score >= 80 THEN 1 END) as excellent_subjects,
        COUNT(cr.id) as total_subjects
      FROM students s
      JOIN people p ON s.person_id = p.id AND p.deleted_at IS NULL
      JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      JOIN classes c ON e.class_id = c.id
      JOIN class_results cr ON s.id = cr.student_id
      WHERE s.school_id = ? AND s.status = 'active' AND s.deleted_at IS NULL
      GROUP BY s.id, p.first_name, p.last_name, c.name
      HAVING avg_score >= 75 AND excellent_subjects >= 3
      ORDER BY avg_score DESC
      LIMIT 20
    `, [schoolId]);

    // Subject performance analysis
    const subjectPerformance = await connection.execute(`
      SELECT 
        sub.name as subject_name,
        c.name as class_name,
        AVG(cr.score) as avg_score,
        MIN(cr.score) as min_score,
        MAX(cr.score) as max_score,
        COUNT(cr.id) as student_count,
        COUNT(CASE WHEN cr.score >= 75 THEN 1 END) as excellent_count,
        COUNT(CASE WHEN cr.score < 50 THEN 1 END) as failing_count
      FROM class_results cr
      JOIN subjects sub ON cr.subject_id = sub.id
      JOIN classes c ON cr.class_id = c.id
      JOIN students s ON cr.student_id = s.id AND s.deleted_at IS NULL
      WHERE s.school_id = ?
      ${termId ? 'AND cr.term_id = ?' : ''}
      GROUP BY sub.id, sub.name, c.id, c.name
      ORDER BY avg_score DESC
    `, [schoolId, ...(termId ? [termId] : [])]);

    await connection.end();

    return NextResponse.json({
      success: true,
      data: {
        performanceTrends: performanceTrends[0],
        atRiskStudents: atRiskStudents[0],
        topPerformers: topPerformers[0],
        subjectPerformance: subjectPerformance[0]
      }
    });
  } catch (error: any) {
    console.error('Error fetching student performance analytics:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}
