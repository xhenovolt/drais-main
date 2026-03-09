import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
/**
 * GET /api/tahfiz/reports/comprehensive
 * Fetch comprehensive Tahfiz reports using REAL class_results data
 * This replaces static/manual data with actual database records
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  // school_id derived from session below
  const termId = searchParams.get('term_id');
  const classId = searchParams.get('class_id');
  const groupId = searchParams.get('group_id');
  const studentId = searchParams.get('student_id');

  let connection: any;
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(request);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    connection = await getConnection();

    // Fetch students with their REAL Tahfiz results from class_results
    let sql = `
      SELECT 
        s.id as student_id,
        s.admission_no,
        p.first_name,
        p.last_name,
        p.gender,
        p.photo_url,
        c.id as class_id,
        c.name as class_name,
        st.name as stream_name,
        tg.id as group_id,
        tg.name as group_name,
        CONCAT(COALESCE(tp.first_name, ''), ' ', COALESCE(tp.last_name, '')) as teacher_name,
        t.id as term_id,
        t.name as term_name,
        ay.name as academic_year,
        
        -- REAL aggregated scores from class_results
        COUNT(DISTINCT cr.id) as total_records,
        AVG(CASE WHEN subj.subject_type = 'tahfiz' THEN cr.score END) as avg_tahfiz_score,
        AVG(CASE WHEN subj.name LIKE '%Retention%' OR subj.code LIKE '%RETENTION%'
            THEN cr.score END) as avg_retention_score,
        AVG(CASE WHEN subj.name LIKE '%Tajweed%' OR subj.code LIKE '%TAJWEED%'
            THEN cr.score END) as avg_tajweed_score,
        AVG(CASE WHEN subj.name LIKE '%Recitation%' OR subj.name LIKE '%Voice%' 
            OR subj.code LIKE '%VOICE%' OR subj.code LIKE '%RECIT%'
            THEN cr.score END) as avg_voice_score,
        COUNT(DISTINCT CASE WHEN cr.score >= 50 THEN cr.id END) as completed_portions,
        
        -- Attendance data
        COUNT(DISTINCT ta.id) as total_attendance_records,
        SUM(CASE WHEN ta.status = 'present' THEN 1 ELSE 0 END) as present_days,
        
        -- Portion progress
        COUNT(DISTINCT tp_assigned.id) as total_portions_assigned,
        SUM(CASE WHEN tp_assigned.status = 'completed' THEN 1 ELSE 0 END) as portions_completed,
        SUM(CASE WHEN tp_assigned.status = 'in_progress' THEN 1 ELSE 0 END) as portions_in_progress
        
      FROM students s
      INNER JOIN people p ON s.person_id = p.id AND p.deleted_at IS NULL
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN streams st ON e.stream_id = st.id
      LEFT JOIN tahfiz_group_members tgm ON s.id = tgm.student_id
      LEFT JOIN tahfiz_groups tg ON tgm.group_id = tg.id
      LEFT JOIN staff teacher_staff ON tg.teacher_id = teacher_staff.id
      LEFT JOIN people tp ON teacher_staff.person_id = tp.id AND tp.deleted_at IS NULL
      
      -- JOIN with REAL class_results for Tahfiz subjects
      LEFT JOIN class_results cr ON s.id = cr.student_id
      LEFT JOIN subjects subj ON cr.subject_id = subj.id AND subj.subject_type = 'tahfiz'
      LEFT JOIN terms t ON cr.term_id = t.id
      LEFT JOIN academic_years ay ON t.academic_year_id = ay.id
      
      -- Attendance records
      LEFT JOIN tahfiz_attendance ta ON s.id = ta.student_id
      
      -- Portion assignments
      LEFT JOIN tahfiz_portions tp_assigned ON s.id = tp_assigned.student_id
      
      WHERE s.school_id = ?
        AND s.deleted_at IS NULL
        ${termId ? 'AND cr.term_id = ?' : ''}
        ${classId ? 'AND c.id = ?' : ''}
        ${groupId ? 'AND tg.id = ?' : ''}
        ${studentId ? 'AND s.id = ?' : ''}
      
      GROUP BY s.id, s.admission_no, p.first_name, p.last_name, p.gender, p.photo_url,
               c.id, c.name, st.name, tg.id, tg.name, tp.first_name, tp.last_name,
               t.id, t.name, ay.name
      
      ORDER BY c.name, p.last_name, p.first_name
    `;

    const params: any[] = [schoolId];
    if (termId) params.push(termId);
    if (classId) params.push(classId);
    if (groupId) params.push(groupId);
    if (studentId) params.push(studentId);

    const [students] = await connection.execute(sql, params);

    // Fetch detailed results for each student
    const studentsWithDetails = await Promise.all(
      (students as any[]).map(async (student) => {
        // Get individual subject results
        const [results] = await connection.execute(
          `SELECT 
            subj.id as subject_id,
            subj.name as subject_name,
            subj.code as subject_code,
            cr.score,
            cr.grade,
            cr.remarks,
            CONCAT(COALESCE(teacher_p.first_name, ''), ' ', COALESCE(teacher_p.last_name, '')) as teacher_name,
            t.name as term_name
          FROM class_results cr
          INNER JOIN subjects subj ON cr.subject_id = subj.id
          INNER JOIN terms t ON cr.term_id = t.id
          LEFT JOIN class_subjects cs ON cr.class_id = cs.class_id AND cr.subject_id = cs.subject_id
          LEFT JOIN staff teacher_staff ON cs.teacher_id = teacher_staff.id
          LEFT JOIN people teacher_p ON teacher_staff.person_id = teacher_p.id AND teacher_p.deleted_at IS NULL
          WHERE cr.student_id = ?
            AND subj.subject_type = 'tahfiz'
            ${termId ? 'AND cr.term_id = ?' : ''}
          ORDER BY subj.name`,
          termId ? [student.student_id, termId] : [student.student_id]
        );

        // Get evaluation records
        const [evaluations] = await connection.execute(
          `SELECT 
            te.id,
            te.type,
            te.retention_score,
            te.tajweed_score,
            te.voice_score,
            te.discipline_score,
            te.remarks,
            te.evaluated_at,
            CONCAT(COALESCE(evaluator_p.first_name, ''), ' ', COALESCE(evaluator_p.last_name, '')) as evaluator_name
          FROM tahfiz_evaluations te
          LEFT JOIN staff evaluator_staff ON te.evaluator_id = evaluator_staff.id
          LEFT JOIN people evaluator_p ON evaluator_staff.person_id = evaluator_p.id AND evaluator_p.deleted_at IS NULL
          WHERE te.student_id = ? 
          ORDER BY te.evaluated_at DESC 
          LIMIT 5`,
          [student.student_id]
        );

        // Get portion details
        const [portions] = await connection.execute(
          `SELECT 
            tp.id,
            tp.portion_name,
            tp.surah_name,
            tp.ayah_from,
            tp.ayah_to,
            tp.juz_number,
            tp.page_from,
            tp.page_to,
            tp.status,
            tp.difficulty_level,
            tp.estimated_days,
            tp.notes,
            tp.assigned_at,
            tp.started_at,
            tp.completed_at,
            tb.title as book_name,
            tb.total_units as total_pages
          FROM tahfiz_portions tp
          LEFT JOIN tahfiz_books tb ON tp.book_id = tb.id
          WHERE tp.student_id = ?
          ORDER BY tp.assigned_at DESC`,
          [student.student_id]
        );

        // Get attendance details
        const [attendance] = await connection.execute(
          `SELECT * FROM tahfiz_attendance 
          WHERE student_id = ?
          ORDER BY date DESC LIMIT 30`,
          [student.student_id]
        );

        return {
          ...student,
          results,
          evaluations,
          portions,
          attendance,
          // Calculate overall performance metrics
          avg_marks: student.avg_tahfiz_score || 0,
          eval_retention_score: student.avg_retention_score || 0,
          eval_tajweed_score: student.avg_tajweed_score || 0,
          eval_voice_score: student.avg_voice_score || 0,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: studentsWithDetails,
      count: studentsWithDetails.length,
    });
  } catch (error: any) {
    console.error('Error fetching comprehensive Tahfiz reports:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}
