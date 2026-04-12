import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * GET /api/students/duplicates
 *
 * Detects potential duplicate student records within a school
 * using multi-factor matching:
 *   1. Exact first_name + last_name match
 *   2. Same admission_no (strong signal)
 *   3. Same class membership
 *
 * Returns grouped duplicates — each group is an array of students
 * that are potential duplicates of each other.
 *
 * Query params:
 *   - limit: Max groups to return (default 200)
 *
 * Response:
 * {
 *   success: true,
 *   total_students: number,
 *   groups: [...],
 *   total_groups: number,
 *   total_duplicates: number
 * }
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const conn = await getConnection();
  try {
    const schoolId = session.schoolId;
    const limit = Math.min(500, parseInt(req.nextUrl.searchParams.get('limit') || '200'));

    // Step 1: Find exact name duplicates via SQL GROUP BY (fast)
    const [exactGroups]: any = await conn.execute(`
      SELECT 
        LOWER(TRIM(p.first_name)) AS fn,
        LOWER(TRIM(p.last_name)) AS ln,
        COUNT(*) AS cnt
      FROM students s
      JOIN people p ON s.person_id = p.id
      WHERE s.school_id = ? AND s.deleted_at IS NULL
      GROUP BY LOWER(TRIM(p.first_name)), LOWER(TRIM(p.last_name))
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
      LIMIT ${Number(limit)}
    `, [schoolId]);

    // Step 2: For each duplicate group, fetch full details with relationship counts
    const groups: any[] = [];
    let groupId = 0;

    for (const grp of exactGroups) {
      const [students]: any = await conn.execute(`
        SELECT 
          s.id,
          p.first_name,
          p.last_name,
          s.admission_no,
          s.status,
          s.created_at,
          s.admission_date,
          ANY_VALUE(c.name) AS class_name,
          ANY_VALUE(e.class_id) AS class_id,
          (SELECT COUNT(*) FROM enrollments en WHERE en.student_id = s.id) AS enrollment_count,
          (SELECT COUNT(*) FROM student_attendance sa WHERE sa.student_id = s.id) AS attendance_count,
          (SELECT COUNT(*) FROM results r WHERE r.student_id = s.id) AS results_count
        FROM students s
        JOIN people p ON s.person_id = p.id
        LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
        LEFT JOIN classes c ON e.class_id = c.id
        WHERE s.school_id = ?
          AND s.deleted_at IS NULL
          AND LOWER(TRIM(p.first_name)) = ?
          AND LOWER(TRIM(p.last_name)) = ?
        GROUP BY s.id, p.first_name, p.last_name, s.admission_no, s.status, s.created_at, s.admission_date
        ORDER BY s.created_at ASC
      `, [schoolId, grp.fn, grp.ln]);

      if (students.length > 1) {
        groupId++;

        // Determine confidence
        const sameAdmissionNo = students.some((s: any, i: number) =>
          students.some((s2: any, j: number) => i !== j && s.admission_no && s2.admission_no && s.admission_no === s2.admission_no)
        );
        const sameClass = students.some((s: any, i: number) =>
          students.some((s2: any, j: number) => i !== j && s.class_id && s2.class_id && s.class_id === s2.class_id)
        );

        let confidence: 'high' | 'medium' | 'low' = 'medium';
        let matchReason = 'Exact name match';

        if (sameAdmissionNo) {
          confidence = 'high';
          matchReason = 'Same name + same admission number';
        } else if (sameClass) {
          confidence = 'high';
          matchReason = 'Same name + same class';
        }

        groups.push({
          group_id: groupId,
          match_reason: matchReason,
          confidence,
          students: students.map((s: any) => ({
            id: s.id,
            first_name: s.first_name,
            last_name: s.last_name,
            admission_no: s.admission_no,
            class_name: s.class_name,
            class_id: s.class_id,
            status: s.status,
            created_at: s.created_at,
            admission_date: s.admission_date,
            enrollment_count: s.enrollment_count,
            attendance_count: s.attendance_count,
            results_count: s.results_count,
          })),
        });
      }
    }

    // Step 3: Also find same admission_no duplicates (different names)
    const [admissionDups]: any = await conn.execute(`
      SELECT s.admission_no, COUNT(*) AS cnt
      FROM students s
      WHERE s.school_id = ? AND s.deleted_at IS NULL AND s.admission_no IS NOT NULL AND s.admission_no != ''
      GROUP BY s.admission_no
      HAVING COUNT(*) > 1
      LIMIT ${Number(limit)}
    `, [schoolId]);

    for (const dup of admissionDups) {
      // Check if this group already captured by name match
      const alreadyCaptured = groups.some(g =>
        g.students.some((s: any) => s.admission_no === dup.admission_no) &&
        g.students.filter((s: any) => s.admission_no === dup.admission_no).length > 1
      );
      if (alreadyCaptured) continue;

      const [students]: any = await conn.execute(`
        SELECT 
          s.id,
          p.first_name,
          p.last_name,
          s.admission_no,
          s.status,
          s.created_at,
          s.admission_date,
          ANY_VALUE(c.name) AS class_name,
          ANY_VALUE(e.class_id) AS class_id,
          (SELECT COUNT(*) FROM enrollments en WHERE en.student_id = s.id) AS enrollment_count,
          (SELECT COUNT(*) FROM student_attendance sa WHERE sa.student_id = s.id) AS attendance_count,
          (SELECT COUNT(*) FROM results r WHERE r.student_id = s.id) AS results_count
        FROM students s
        JOIN people p ON s.person_id = p.id
        LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
        LEFT JOIN classes c ON e.class_id = c.id
        WHERE s.school_id = ?
          AND s.deleted_at IS NULL
          AND s.admission_no = ?
        GROUP BY s.id, p.first_name, p.last_name, s.admission_no, s.status, s.created_at, s.admission_date
        ORDER BY s.created_at ASC
      `, [schoolId, dup.admission_no]);

      if (students.length > 1) {
        groupId++;
        groups.push({
          group_id: groupId,
          match_reason: 'Same admission number',
          confidence: 'high' as const,
          students: students.map((s: any) => ({
            id: s.id,
            first_name: s.first_name,
            last_name: s.last_name,
            admission_no: s.admission_no,
            class_name: s.class_name,
            class_id: s.class_id,
            status: s.status,
            created_at: s.created_at,
            admission_date: s.admission_date,
            enrollment_count: s.enrollment_count,
            attendance_count: s.attendance_count,
            results_count: s.results_count,
          })),
        });
      }
    }

    const totalDuplicates = groups.reduce((sum, g) => sum + g.students.length, 0);
    const [totalRows]: any = await conn.execute(
      'SELECT COUNT(*) as cnt FROM students WHERE school_id = ? AND deleted_at IS NULL',
      [schoolId]
    );

    return NextResponse.json({
      success: true,
      total_students: totalRows[0].cnt,
      groups,
      total_groups: groups.length,
      total_duplicates: totalDuplicates,
    });
  } catch (error) {
    console.error('Error detecting duplicates:', error);
    return NextResponse.json(
      { error: 'Failed to detect duplicates' },
      { status: 500 }
    );
  } finally {
    await conn.end();
  }
}
