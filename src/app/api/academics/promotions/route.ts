import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
/**
 * GET /api/academics/promotions
 * Calculate promotions for 3rd term based on Division performance
 * Returns: Promoted, Expected to Improve, Advised to Repeat
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  // school_id derived from session below
  const classId = searchParams.get('class_id');
  const termId = searchParams.get('term_id');
  const academicYearId = searchParams.get('academic_year_id');

  let connection;
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(request);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    connection = await getConnection();

    // Verify it's 3rd term
    const [termInfo] = await connection.execute(
      `SELECT id, name, term_number, academic_year_id FROM terms WHERE id = ?`,
      [termId]
    );

    if (!termInfo || (termInfo as any[]).length === 0) {
      return NextResponse.json(
        { success: false, message: 'Invalid term ID' },
        { status: 400 }
      );
    }

    const term = (termInfo as any[])[0];
    const academicYearId = term.academic_year_id;
    const isThirdTerm = term.term_number === 3 || term.name.toLowerCase().includes('3');

    // Fetch all students with their results - PROPERLY FILTERED BY ACADEMIC YEAR
    const sql = `
      SELECT 
        s.id as student_id,
        s.admission_no,
        CONCAT(p.first_name, ' ', p.last_name) as student_name,
        c.id as class_id,
        c.name as class_name,
        c.level as class_level,
        
        -- Calculate total marks and average
        SUM(cr.score) as total_marks,
        COUNT(DISTINCT cr.subject_id) as subject_count,
        AVG(cr.score) as average_marks,
        
        -- Count grades for division calculation
        SUM(CASE WHEN cr.score >= 80 THEN 1 ELSE 0 END) as distinctions,
        SUM(CASE WHEN cr.score >= 60 AND cr.score < 80 THEN 1 ELSE 0 END) as credits,
        SUM(CASE WHEN cr.score >= 50 AND cr.score < 60 THEN 1 ELSE 0 END) as passes,
        SUM(CASE WHEN cr.score < 50 THEN 1 ELSE 0 END) as failures
        
      FROM students s
      INNER JOIN people p ON s.person_id = p.id
      INNER JOIN classes c ON s.class_id = c.id
      LEFT JOIN class_results cr ON s.id = cr.student_id 
        AND cr.term_id = ?
        AND cr.academic_year_id = ?
        ${classId ? 'AND cr.class_id = ?' : ''}
      WHERE s.school_id = ?
        AND s.deleted_at IS NULL
        ${classId ? 'AND s.class_id = ?' : ''}
      GROUP BY s.id, s.admission_no, p.first_name, p.last_name, c.id, c.name, c.level
      HAVING COUNT(cr.id) > 0
      ORDER BY c.name, average_marks DESC
    `;

    const params: any[] = [termId, academicYearId, schoolId];
    if (classId) {
      params.splice(2, 0, classId);
      params.push(classId);
    }

    const [students] = await connection.execute(sql, params);

    // Calculate divisions and categorize students
    const categorizedStudents = (students as any[]).map((student) => {
      const { distinctions, credits, passes, failures, subject_count, average_marks } = student;
      
      let division = null;
      let divisionName = '';
      let promotionStatus = '';
      let recommendation = '';

      // Division calculation logic (Uganda/East Africa system)
      if (failures === 0) {
        if (distinctions >= subject_count * 0.5) {
          division = 1;
          divisionName = 'Division I';
        } else if (distinctions + credits >= subject_count * 0.7) {
          division = 2;
          divisionName = 'Division II';
        } else if (average_marks >= 50) {
          division = 3;
          divisionName = 'Division III';
        } else {
          division = 4;
          divisionName = 'Division IV';
        }
      } else if (failures <= 2 && average_marks >= 45) {
        division = 4;
        divisionName = 'Division IV';
      } else {
        division = null;
        divisionName = 'Fail / U';
      }

      // Determine promotion status for 3rd term
      if (isThirdTerm) {
        if (division && division <= 3) {
          promotionStatus = 'promoted';
          recommendation = `Excellent performance! Promoted to ${getNextClass(student.class_name)}.`;
        } else if (division === 4) {
          promotionStatus = 'expected_to_improve';
          recommendation = `Promoted with conditions. Must improve performance in ${failures} subject(s).`;
        } else {
          promotionStatus = 'repeat';
          recommendation = `Performance below standard. Advised to repeat ${student.class_name} for better foundation.`;
        }
      } else {
        promotionStatus = 'not_applicable';
        recommendation = 'Promotion status determined at end of 3rd term.';
      }

      return {
        ...student,
        division,
        divisionName,
        promotionStatus,
        recommendation,
      };
    });

    // Group by promotion status
    const promoted = categorizedStudents.filter(s => s.promotionStatus === 'promoted');
    const expectedToImprove = categorizedStudents.filter(s => s.promotionStatus === 'expected_to_improve');
    const advisedToRepeat = categorizedStudents.filter(s => s.promotionStatus === 'repeat');
    const notApplicable = categorizedStudents.filter(s => s.promotionStatus === 'not_applicable');

    return NextResponse.json({
      success: true,
      data: {
        isThirdTerm,
        termName: term.name,
        summary: {
          total: categorizedStudents.length,
          promoted: promoted.length,
          expectedToImprove: expectedToImprove.length,
          advisedToRepeat: advisedToRepeat.length,
          promotionRate: ((promoted.length / categorizedStudents.length) * 100).toFixed(2),
        },
        students: {
          promoted,
          expectedToImprove,
          advisedToRepeat,
          notApplicable,
        },
      },
    });
  } catch (error: any) {
    console.error('Error calculating promotions:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * Helper function to determine next class level
 */
function getNextClass(currentClass: string): string {
  // Handle various naming conventions
  const classMatch = currentClass.match(/(\d+)/);
  if (classMatch) {
    const level = parseInt(classMatch[1], 10);
    if (level === 7) return 'S.1 (Secondary)';
    if (level < 7) return currentClass.replace(String(level), String(level + 1));
  }
  
  // Handle P1-P7 explicitly
  const primaryMatch = currentClass.match(/P(\d)/i);
  if (primaryMatch) {
    const level = parseInt(primaryMatch[1], 10);
    if (level === 7) return 'S.1';
    return `P${level + 1}`;
  }
  
  return 'Next Level';
}

/**
 * POST /api/academics/promotions
 * Execute bulk promotion for students
 */
export async function POST(request: NextRequest) {
  let connection;
  try {
    const body = await request.json();
    const { studentIds, newClassId, academicYearId, remarks } = body;

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Student IDs are required' },
        { status: 400 }
      );
    }

    connection = await getConnection();

    // Update students to new class
    const placeholders = studentIds.map(() => '?').join(',');
    const [result] = await connection.execute(
      `UPDATE students 
       SET class_id = ?, 
           updated_at = NOW()
       WHERE id IN (${placeholders})`,
      [newClassId, ...studentIds]
    );

    // Log promotion history
    for (const studentId of studentIds) {
      await connection.execute(
        `INSERT INTO student_history 
         (student_id, action_type, details, created_at)
         VALUES (?, 'promotion', ?, NOW())`,
        [studentId, remarks || 'Promoted based on 3rd term performance']
      );
    }

    return NextResponse.json({
      success: true,
      message: `Successfully promoted ${studentIds.length} student(s)`,
      affectedRows: (result as any).affectedRows,
    });
  } catch (error: any) {
    console.error('Error executing promotions:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}
