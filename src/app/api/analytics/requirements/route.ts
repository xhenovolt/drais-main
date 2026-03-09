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
    
    const connection = await getConnection();
    
    // Requirements compliance overview
    const complianceOverview = await connection.execute(`
      SELECT 
        tri.name as requirement_name,
        tri.description,
        tri.mandatory,
        COUNT(DISTINCT e.student_id) as total_students,
        COUNT(DISTINCT tsrs.student_id) as submitted_students,
        COUNT(DISTINCT CASE WHEN tsrs.brought = 1 THEN tsrs.student_id END) as compliant_students,
        ROUND(
          COUNT(DISTINCT CASE WHEN tsrs.brought = 1 THEN tsrs.student_id END) / 
          NULLIF(COUNT(DISTINCT e.student_id), 0) * 100, 
          2
        ) as compliance_rate
      FROM term_requirement_items tri
      CROSS JOIN enrollments e
      LEFT JOIN term_student_requirement_status tsrs ON tri.id = tsrs.item_id AND e.student_id = tsrs.student_id
      JOIN students s ON e.student_id = s.id AND s.deleted_at IS NULL
      WHERE s.school_id = ? AND s.status = 'active'
      ${termId ? 'AND tri.term_id = ?' : ''}
      GROUP BY tri.id, tri.name, tri.description, tri.mandatory
      ORDER BY compliance_rate ASC
    `, termId ? [schoolId, termId] : [schoolId]);

    // Class-wise compliance
    const classCompliance = await connection.execute(`
      SELECT 
        c.name as class_name,
        COUNT(DISTINCT e.student_id) as total_students,
        COUNT(DISTINCT tsrs.student_id) as students_with_submissions,
        ROUND(AVG(CASE WHEN tsrs.brought = 1 THEN 100 ELSE 0 END), 2) as avg_compliance_rate,
        COUNT(DISTINCT CASE WHEN tsrs.brought = 1 THEN tsrs.student_id END) as fully_compliant_students
      FROM classes c
      JOIN enrollments e ON c.id = e.class_id AND e.status = 'active'
      JOIN students s ON e.student_id = s.id AND s.deleted_at IS NULL
      LEFT JOIN term_student_requirement_status tsrs ON s.id = tsrs.student_id
        ${termId ? 'AND tsrs.term_id = ?' : ''}
      WHERE s.school_id = ? AND s.status = 'active'
      GROUP BY c.id, c.name
      ORDER BY avg_compliance_rate DESC
    `, termId ? [termId, schoolId] : [schoolId]);

    // Non-compliant students
    const nonCompliantStudents = await connection.execute(`
      SELECT 
        s.id as student_id,
        CONCAT(p.first_name, ' ', p.last_name) as student_name,
        s.admission_no,
        c.name as class_name,
        COUNT(tri.id) as total_requirements,
        COUNT(CASE WHEN tsrs.brought = 1 THEN 1 END) as completed_requirements,
        COUNT(tri.id) - COUNT(CASE WHEN tsrs.brought = 1 THEN 1 END) as pending_requirements,
        GROUP_CONCAT(CASE WHEN tsrs.brought = 0 OR tsrs.brought IS NULL THEN tri.name END SEPARATOR ', ') as missing_items
      FROM students s
      JOIN people p ON s.person_id = p.id AND p.deleted_at IS NULL
      JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      JOIN classes c ON e.class_id = c.id
      CROSS JOIN term_requirement_items tri
      LEFT JOIN term_student_requirement_status tsrs ON s.id = tsrs.student_id AND tri.id = tsrs.item_id
      WHERE s.school_id = ? AND s.status = 'active' AND s.deleted_at IS NULL
      ${termId ? 'AND tri.term_id = ?' : ''}
      GROUP BY s.id, p.first_name, p.last_name, s.admission_no, c.name
      HAVING pending_requirements > 0
      ORDER BY pending_requirements DESC, s.admission_no
      LIMIT 50
    `, termId ? [schoolId, termId] : [schoolId]);

    // Requirements timeline
    const requirementsTimeline = await connection.execute(`
      SELECT 
        tri.name as requirement_name,
        tri.mandatory,
        COUNT(tsrs.id) as total_submissions,
        DATE(tsrs.created_at) as submission_date
      FROM term_requirement_items tri
      LEFT JOIN term_student_requirement_status tsrs ON tri.id = tsrs.item_id
        AND tsrs.created_at IS NOT NULL
        AND DATE(tsrs.created_at) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      WHERE tri.term_id IN (
        SELECT id FROM terms WHERE school_id = ?
        ${termId ? 'AND id = ?' : ''}
      )
      GROUP BY tri.id, tri.name, tri.mandatory, DATE(tsrs.created_at)
      HAVING submission_date IS NOT NULL
      ORDER BY submission_date DESC
    `, termId ? [schoolId, termId] : [schoolId]);

    // Outstanding items summary
    const outstandingItems = await connection.execute(`
      SELECT 
        tri.name as requirement_name,
        tri.description,
        tri.mandatory,
        COUNT(DISTINCT s.id) as total_students,
        COUNT(DISTINCT CASE WHEN tsrs.brought = 0 OR tsrs.brought IS NULL THEN s.id END) as students_missing,
        ROUND(
          COUNT(DISTINCT CASE WHEN tsrs.brought = 0 OR tsrs.brought IS NULL THEN s.id END) / 
          NULLIF(COUNT(DISTINCT s.id), 0) * 100,
          2
        ) as missing_percentage
      FROM term_requirement_items tri
      CROSS JOIN students s
      JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN term_student_requirement_status tsrs ON tri.id = tsrs.item_id AND s.id = tsrs.student_id
      WHERE s.school_id = ? AND s.status = 'active' AND s.deleted_at IS NULL
      ${termId ? 'AND tri.term_id = ?' : ''}
      GROUP BY tri.id, tri.name, tri.description, tri.mandatory
      HAVING students_missing > 0
      ORDER BY missing_percentage DESC, students_missing DESC
    `, [schoolId, ...(termId ? [termId] : [])]);

    await connection.end();

    return NextResponse.json({
      success: true,
      data: {
        complianceOverview: complianceOverview[0],
        classCompliance: classCompliance[0],
        nonCompliantStudents: nonCompliantStudents[0],
        requirementsTimeline: requirementsTimeline[0],
        outstandingItems: outstandingItems[0]
      }
    });
  } catch (error: any) {
    console.error('Error fetching requirements analytics:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}
