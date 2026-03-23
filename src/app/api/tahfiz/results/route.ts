import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * GET /api/tahfiz/results
 * Fetch Tahfiz results with proper filtering
 * Query params: class_id, term_id, student_id, subject_id
 */
export async function GET(request: NextRequest) {
  const session = await getSessionSchoolId(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  const { searchParams } = new URL(request.url);
  const classId = searchParams.get('class_id');
  const termId = searchParams.get('term_id');
  const studentId = searchParams.get('student_id');
  const subjectId = searchParams.get('subject_id');

  let connection;
  try {
    connection = await getConnection();

    let sql = `
      SELECT 
        cr.id,
        cr.student_id,
        cr.class_id,
        cr.subject_id,
        cr.term_id,
        cr.result_type_id,
        cr.score,
        cr.grade,
        cr.remarks,
        cr.created_at,
        cr.updated_at,
        CONCAT(p.first_name, ' ', p.last_name) as student_name,
        s.admission_no as student_admission_no,
        subj.name as subject_name,
        subj.code as subject_code,
        rt.name as result_type_name,
        t.name as term_name,
        c.name as class_name
      FROM class_results cr
      INNER JOIN students s ON cr.student_id = s.id
      INNER JOIN people p ON s.person_id = p.id
      INNER JOIN subjects subj ON cr.subject_id = subj.id
      LEFT JOIN result_types rt ON cr.result_type_id = rt.id
      LEFT JOIN terms t ON cr.term_id = t.id
      LEFT JOIN classes c ON cr.class_id = c.id
      WHERE subj.subject_type = 'tahfiz'
    `;

    const params: any[] = [];

    if (classId) {
      sql += ' AND cr.class_id = ?';
      params.push(classId);
    }

    if (termId) {
      sql += ' AND cr.term_id = ?';
      params.push(termId);
    }

    if (studentId) {
      sql += ' AND cr.student_id = ?';
      params.push(studentId);
    }

    if (subjectId) {
      sql += ' AND cr.subject_id = ?';
      params.push(subjectId);
    }

    sql += ' ORDER BY cr.created_at DESC, p.first_name ASC';

    const [rows] = await connection.execute(sql, params);
    
    return NextResponse.json({ 
      success: true, 
      data: rows,
      count: (rows as any[]).length 
    });
  } catch (error: any) {
    console.error('Error fetching tahfiz results:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch results', message: error.message },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * POST /api/tahfiz/results
 * Create new Tahfiz result(s) - supports both single and bulk entry
 */
export async function POST(request: NextRequest) {
  let connection;
  try {
    const body = await request.json();
    const { entries, mode = 'single' } = body;

    // Validate input
    if (!entries || (Array.isArray(entries) && entries.length === 0)) {
      return NextResponse.json(
        { success: false, error: 'No entries provided' },
        { status: 400 }
      );
    }

    connection = await getConnection();

    // Normalize to array
    const resultEntries = Array.isArray(entries) ? entries : [entries];
    const inserted: any[] = [];
    const errors: any[] = [];

    for (const entry of resultEntries) {
      const {
        student_id,
        class_id,
        subject_id,
        term_id,
        result_type_id,
        score,
        grade,
        remarks
      } = entry;

      // Validate required fields
      if (!student_id || !class_id || !subject_id || !result_type_id) {
        errors.push({
          student_id,
          error: 'Missing required fields: student_id, class_id, subject_id, result_type_id'
        });
        continue;
      }

      // Validate score if provided
      if (score !== null && score !== undefined) {
        const numScore = parseFloat(score);
        if (isNaN(numScore) || numScore < 0 || numScore > 100) {
          errors.push({
            student_id,
            error: 'Score must be between 0 and 100'
          });
          continue;
        }
      }

      // Verify student is enrolled in the class
      const [enrollment] = await connection.execute(
        `SELECT id FROM enrollments 
         WHERE student_id = ? AND class_id = ? AND status = 'active'
         LIMIT 1`,
        [student_id, class_id]
      );

      if ((enrollment as any[]).length === 0) {
        errors.push({
          student_id,
          error: 'Student not enrolled in this class'
        });
        continue;
      }

      // Verify subject is Tahfiz type
      const [subjectCheck] = await connection.execute(
        `SELECT id FROM subjects WHERE id = ? AND subject_type = 'tahfiz' LIMIT 1`,
        [subject_id]
      );

      if ((subjectCheck as any[]).length === 0) {
        errors.push({
          student_id,
          subject_id,
          error: 'Subject is not a Tahfiz subject'
        });
        continue;
      }

      // Check for duplicate entry
      const [existing] = await connection.execute(
        `SELECT id FROM class_results 
         WHERE student_id = ? AND class_id = ? AND subject_id = ? 
         AND term_id <=> ? AND result_type_id = ?`,
        [student_id, class_id, subject_id, term_id || null, result_type_id]
      );

      if ((existing as any[]).length > 0) {
        errors.push({
          student_id,
          subject_id,
          error: 'Result already exists for this student, subject, and term'
        });
        continue;
      }

      // Auto-calculate grade if not provided
      let finalGrade = grade;
      if (!finalGrade && score !== null && score !== undefined) {
        const numScore = parseFloat(score);
        if (numScore >= 90) finalGrade = 'A+';
        else if (numScore >= 80) finalGrade = 'A';
        else if (numScore >= 70) finalGrade = 'B';
        else if (numScore >= 60) finalGrade = 'C';
        else if (numScore >= 50) finalGrade = 'D';
        else finalGrade = 'F';
      }

      // Insert result
      const [result] = await connection.execute(
        `INSERT INTO class_results 
         (student_id, class_id, subject_id, term_id, result_type_id, score, grade, remarks, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          student_id,
          class_id,
          subject_id,
          term_id || null,
          result_type_id,
          score !== null && score !== undefined ? parseFloat(score) : null,
          finalGrade || null,
          remarks || null
        ]
      );

      inserted.push({
        id: (result as any).insertId,
        student_id,
        class_id,
        subject_id
      });
    }

    const response: any = {
      success: inserted.length > 0,
      inserted: inserted.length,
      errors: errors.length,
      data: inserted
    };

    if (errors.length > 0) {
      response.errorDetails = errors;
    }

    return NextResponse.json(response, {
      status: inserted.length > 0 ? 201 : 400
    });

  } catch (error: any) {
    console.error('Error creating tahfiz results:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create results', message: error.message },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * PUT /api/tahfiz/results
 * Update existing Tahfiz result
 */
export async function PUT(request: NextRequest) {
  let connection;
  try {
    const body = await request.json();
    const { id, score, grade, remarks } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Result ID is required' },
        { status: 400 }
      );
    }

    connection = await getConnection();

    // Verify the result exists and is for a Tahfiz subject
    const [existing] = await connection.execute(
      `SELECT cr.id FROM class_results cr
       INNER JOIN subjects s ON cr.subject_id = s.id
       WHERE cr.id = ? AND s.subject_type = 'tahfiz'`,
      [id]
    );

    if ((existing as any[]).length === 0) {
      return NextResponse.json(
        { success: false, error: 'Tahfiz result not found' },
        { status: 404 }
      );
    }

    // Build update query dynamically
    const updates: string[] = [];
    const params: any[] = [];

    if (score !== undefined && score !== null) {
      const numScore = parseFloat(score);
      if (isNaN(numScore) || numScore < 0 || numScore > 100) {
        return NextResponse.json(
          { success: false, error: 'Score must be between 0 and 100' },
          { status: 400 }
        );
      }
      updates.push('score = ?');
      params.push(numScore);
    }

    if (grade !== undefined) {
      updates.push('grade = ?');
      params.push(grade || null);
    }

    if (remarks !== undefined) {
      updates.push('remarks = ?');
      params.push(remarks || null);
    }

    updates.push('updated_at = NOW()');

    if (updates.length === 1) { // Only updated_at
      return NextResponse.json(
        { success: false, error: 'No fields to update' },
        { status: 400 }
      );
    }

    params.push(id);

    await connection.execute(
      `UPDATE class_results SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    return NextResponse.json({ success: true, message: 'Result updated successfully' });

  } catch (error: any) {
    console.error('Error updating tahfiz result:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update result', message: error.message },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * DELETE /api/tahfiz/results
 * Delete Tahfiz result
 */
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      { success: false, error: 'Result ID is required' },
      { status: 400 }
    );
  }

  let connection;
  try {
    connection = await getConnection();

    // Verify the result exists and is for a Tahfiz subject
    const [existing] = await connection.execute(
      `SELECT cr.id FROM class_results cr
       INNER JOIN subjects s ON cr.subject_id = s.id
       WHERE cr.id = ? AND s.subject_type = 'tahfiz'`,
      [id]
    );

    if ((existing as any[]).length === 0) {
      return NextResponse.json(
        { success: false, error: 'Tahfiz result not found' },
        { status: 404 }
      );
    }

    await connection.execute('DELETE FROM class_results WHERE id = ?', [id]);

    return NextResponse.json({ success: true, message: 'Result deleted successfully' });

  } catch (error: any) {
    console.error('Error deleting tahfiz result:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete result', message: error.message },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}
