import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
import { checkModule } from '@/lib/auth/requireModule';

/**
 * Stability-roadmap Phase 3: repoint at the real tables. This route
 * queried term_requirement_items / term_student_requirement_status,
 * which do not exist — every call here was a hard 500 (confirmed live:
 * SHOW TABLES has neither). The real tables are requirements_master
 * (school-scoped, NOT term-scoped — no mandatory column either) and
 * student_requirements (student_id, term_id, requirement_id, brought,
 * date_reported). Term-scoping moves from the requirement definition
 * onto the per-student status row, since that's genuinely where term_id
 * lives now. `mandatory` has no real column to source from yet, so it's
 * defaulted to true (1) rather than fabricated per-row — flagged below,
 * not silently invented as if it were real data.
 */
export async function GET(req: NextRequest) {
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const __denied = await checkModule(session.schoolId, 'analytics');
    if (__denied) return __denied;
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    // school_id derived from session below
    const termId = searchParams.get('term_id');

    const connection = await getConnection();

    // Requirements compliance overview
    const complianceOverview = await connection.execute(`
      SELECT
        rm.name as requirement_name,
        rm.description,
        1 as mandatory,
        COUNT(DISTINCT e.student_id) as total_students,
        COUNT(DISTINCT sr.student_id) as submitted_students,
        COUNT(DISTINCT CASE WHEN sr.brought = 1 THEN sr.student_id END) as compliant_students,
        ROUND(
          COUNT(DISTINCT CASE WHEN sr.brought = 1 THEN sr.student_id END) /
          NULLIF(COUNT(DISTINCT e.student_id), 0) * 100,
          2
        ) as compliance_rate
      FROM requirements_master rm
      CROSS JOIN enrollments e
      LEFT JOIN student_requirements sr ON rm.id = sr.requirement_id AND e.student_id = sr.student_id
        ${termId ? 'AND sr.term_id = ?' : ''}
      JOIN students s ON e.student_id = s.id AND s.deleted_at IS NULL
      WHERE rm.school_id = ? AND s.school_id = ? AND s.status = 'active'
      GROUP BY rm.id, rm.name, rm.description
      ORDER BY compliance_rate ASC
    `, termId ? [termId, schoolId, schoolId] : [schoolId, schoolId]);

    // Class-wise compliance
    const classCompliance = await connection.execute(`
      SELECT
        c.name as class_name,
        COUNT(DISTINCT e.student_id) as total_students,
        COUNT(DISTINCT sr.student_id) as students_with_submissions,
        ROUND(AVG(CASE WHEN sr.brought = 1 THEN 100 ELSE 0 END), 2) as avg_compliance_rate,
        COUNT(DISTINCT CASE WHEN sr.brought = 1 THEN sr.student_id END) as fully_compliant_students
      FROM classes c
      JOIN enrollments e ON c.id = e.class_id AND e.status = 'active'
      JOIN students s ON e.student_id = s.id AND s.deleted_at IS NULL
      LEFT JOIN student_requirements sr ON s.id = sr.student_id
        ${termId ? 'AND sr.term_id = ?' : ''}
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
        COUNT(rm.id) as total_requirements,
        COUNT(CASE WHEN sr.brought = 1 THEN 1 END) as completed_requirements,
        COUNT(rm.id) - COUNT(CASE WHEN sr.brought = 1 THEN 1 END) as pending_requirements,
        GROUP_CONCAT(CASE WHEN sr.brought = 0 OR sr.brought IS NULL THEN rm.name END SEPARATOR ', ') as missing_items
      FROM students s
      JOIN people p ON s.person_id = p.id AND p.deleted_at IS NULL
      JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      JOIN classes c ON e.class_id = c.id
      CROSS JOIN requirements_master rm
      LEFT JOIN student_requirements sr ON s.id = sr.student_id AND rm.id = sr.requirement_id
        ${termId ? 'AND sr.term_id = ?' : ''}
      WHERE s.school_id = ? AND rm.school_id = ? AND s.status = 'active' AND s.deleted_at IS NULL
      GROUP BY s.id, p.first_name, p.last_name, s.admission_no, c.name
      HAVING pending_requirements > 0
      ORDER BY pending_requirements DESC, s.admission_no
      LIMIT 50
    `, termId ? [termId, schoolId, schoolId] : [schoolId, schoolId]);

    // Requirements timeline (date_reported is already a DATE column, no
    // created_at exists on student_requirements)
    const requirementsTimeline = await connection.execute(`
      SELECT
        rm.name as requirement_name,
        1 as mandatory,
        COUNT(sr.id) as total_submissions,
        sr.date_reported as submission_date
      FROM requirements_master rm
      LEFT JOIN student_requirements sr ON rm.id = sr.requirement_id
        AND sr.date_reported IS NOT NULL
        AND sr.date_reported >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        ${termId ? 'AND sr.term_id = ?' : ''}
      WHERE rm.school_id = ?
      GROUP BY rm.id, rm.name, sr.date_reported
      HAVING submission_date IS NOT NULL
      ORDER BY submission_date DESC
    `, termId ? [termId, schoolId] : [schoolId]);

    // Outstanding items summary
    const outstandingItems = await connection.execute(`
      SELECT
        rm.name as requirement_name,
        rm.description,
        1 as mandatory,
        COUNT(DISTINCT s.id) as total_students,
        COUNT(DISTINCT CASE WHEN sr.brought = 0 OR sr.brought IS NULL THEN s.id END) as students_missing,
        ROUND(
          COUNT(DISTINCT CASE WHEN sr.brought = 0 OR sr.brought IS NULL THEN s.id END) /
          NULLIF(COUNT(DISTINCT s.id), 0) * 100,
          2
        ) as missing_percentage
      FROM requirements_master rm
      CROSS JOIN students s
      JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN student_requirements sr ON rm.id = sr.requirement_id AND s.id = sr.student_id
        ${termId ? 'AND sr.term_id = ?' : ''}
      WHERE rm.school_id = ? AND s.school_id = ? AND s.status = 'active' AND s.deleted_at IS NULL
      GROUP BY rm.id, rm.name, rm.description
      HAVING students_missing > 0
      ORDER BY missing_percentage DESC, students_missing DESC
    `, termId ? [termId, schoolId, schoolId] : [schoolId, schoolId]);

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
