import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import {
  validateAllocationInput as validateInput,
  checkDuplicateAssignment,
  validateOwnership,
  ensureAllocationBelongsToSchool,
} from '@/lib/allocation-validation';
import { resolveTeacherInitials } from '@/lib/reports/canonical-report-engine';
import { checkModule } from '@/lib/auth/requireModule';

// ============================================================================
// GET: Fetch all allocations with optional filters
// ============================================================================

export async function GET(req: Request) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const classId   = searchParams.get('class_id');
    const subjectId = searchParams.get('subject_id');
    const teacherId = searchParams.get('teacher_id');
    const asOfTerm  = searchParams.get('as_of_term');
    const asOfDate  = searchParams.get('as_of_date');

    connection = await getConnection();

    const showHistory = searchParams.get('history') === '1';

    const whereClauses: string[] = ['c.school_id = ?'];
    const params: any[] = [session.schoolId];

    // Phase D filtering modes:
    //   default     → current active rows (valid_to IS NULL)
    //   ?history=1  → every row (full timeline)
    //   ?as_of_term=<id> or ?as_of_date=YYYY-MM-DD → time-travel to that date
    let resolvedAsOf: string | null = null;
    if (asOfTerm) {
      const [tRows]: any = await connection.execute(
        `SELECT start_date FROM terms WHERE id = ? AND school_id = ?`,
        [asOfTerm, session.schoolId]
      );
      if (tRows.length) resolvedAsOf = tRows[0].start_date;
    } else if (asOfDate) {
      resolvedAsOf = asOfDate;
    }

    if (resolvedAsOf) {
      // Pick the row that was active on this date: started on or before it
      // AND either still open or ended after it.
      whereClauses.push('cs.valid_from <= ?');
      whereClauses.push('(cs.valid_to IS NULL OR cs.valid_to > ?)');
      params.push(resolvedAsOf, resolvedAsOf);
    } else if (!showHistory) {
      whereClauses.push('cs.valid_to IS NULL');
    }

    if (classId) {
      whereClauses.push('cs.class_id = ?');
      params.push(classId);
    }
    if (subjectId) {
      whereClauses.push('cs.subject_id = ?');
      params.push(subjectId);
    }
    if (teacherId) {
      whereClauses.push('cs.teacher_id = ?');
      params.push(teacherId);
    }

    const whereClause = whereClauses.join(' AND ');

    const query = `
      SELECT
        cs.id,
        cs.class_id,
        cs.subject_id,
        cs.teacher_id,
        cs.custom_initials,
        cs.valid_from,
        cs.valid_to,
        cs.term_id,
        c.name  AS class_name,
        sub.name AS subject_name,
        sub.code AS subject_code,
        CONCAT(UPPER(LEFT(p.first_name, 1)), UPPER(LEFT(p.last_name, 1))) AS auto_generated_initials,
        CONCAT(p.first_name, ' ', p.last_name) AS teacher_name
      FROM class_subjects cs
      JOIN classes c ON cs.class_id = c.id
      JOIN subjects sub ON cs.subject_id = sub.id
      LEFT JOIN staff s ON cs.teacher_id = s.id
      LEFT JOIN people p ON s.person_id = p.id
      WHERE ${whereClause}
      ORDER BY c.name ASC, sub.name ASC, cs.valid_from DESC
    `;

    const [rows] = await connection.execute(query, params);

    const allocations = rows.map((r: any) => {
      const displayInitials = resolveTeacherInitials({
        allocationInitials: r.custom_initials,
        teacherName: r.teacher_name,
        teacherInitials: r.auto_generated_initials,
      });

      return {
        id: r.id,
        class_id: r.class_id,
        subject_id: r.subject_id,
        teacher_id: r.teacher_id,
        custom_initials: r.custom_initials,
        class_name: r.class_name,
        subject_name: r.subject_name,
        subject_code: r.subject_code,
        teacher_name: r.teacher_name || 'Unassigned',
        display_initials: displayInitials === 'N/A' ? '' : displayInitials,
      };
    });

    await connection.end();

    return NextResponse.json({ success: true, data: allocations, count: allocations.length });
  } catch (error) {
    if (connection) await connection.end();
    console.error('Error fetching allocations:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// ============================================================================
// POST: Create new allocation
// ============================================================================

export async function POST(req: Request) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { class_id, subject_id, teacher_id, custom_initials } = validateInput(body);

    connection = await getConnection();
    await validateOwnership(connection, session.schoolId, { class_id, subject_id, teacher_id });

    // Phase D: supersede the current active allocation (if any) and create a
    // new time-bounded row. The unique constraint was dropped; history is
    // preserved by setting valid_to on the old row.
    await connection.execute(
      `UPDATE class_subjects
          SET valid_to = CURDATE()
        WHERE class_id   = ?
          AND subject_id = ?
          AND valid_to   IS NULL`,
      [class_id, subject_id]
    );

    const [result] = await connection.execute(
      `INSERT INTO class_subjects (class_id, subject_id, teacher_id, custom_initials, valid_from, valid_to)
       VALUES (?, ?, ?, ?, CURDATE(), NULL)`,
      [class_id, subject_id, teacher_id, custom_initials]
    );

    const newId = (result as any).insertId;

    // Fetch created record
    const [rows] = await connection.execute(
      `SELECT
         cs.id, cs.class_id, cs.subject_id, cs.teacher_id, cs.custom_initials,
         c.name AS class_name, sub.name AS subject_name,
         CONCAT(UPPER(LEFT(p.first_name, 1)), UPPER(LEFT(p.last_name, 1))) AS auto_generated_initials,
         CONCAT(p.first_name, ' ', p.last_name) AS teacher_name
       FROM class_subjects cs
       JOIN classes c ON cs.class_id = c.id
       JOIN subjects sub ON cs.subject_id = sub.id
       LEFT JOIN staff s ON cs.teacher_id = s.id
       LEFT JOIN people p ON s.person_id = p.id
       WHERE cs.id = ?`,
      [newId]
    );

    await connection.end();

    if (rows.length === 0) {
      throw new Error('Failed to create allocation.');
    }

    const record = rows[0];
    const resolvedInitials = resolveTeacherInitials({
      allocationInitials: record.custom_initials,
      teacherName: record.teacher_name,
      teacherInitials: record.auto_generated_initials,
    });
    const allocation = {
      id: record.id,
      class_id: record.class_id,
      subject_id: record.subject_id,
      teacher_id: record.teacher_id,
      custom_initials: record.custom_initials,
      class_name: record.class_name,
      subject_name: record.subject_name,
      teacher_name: record.teacher_name || 'Unassigned',
      display_initials: resolvedInitials === 'N/A' ? '' : resolvedInitials,
    };

    return NextResponse.json({ success: true, data: allocation }, { status: 201 });
  } catch (error) {
    if (connection) await connection.end();
    console.error('Error creating allocation:', error);
    const status = error.message.includes('already exists') ? 409 : 400;
    return NextResponse.json({ success: false, message: error.message }, { status });
  }
}

// ============================================================================
// PUT: Update existing allocation
// ============================================================================

export async function PUT(req: Request) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { id, class_id, subject_id, teacher_id, custom_initials } = validateInput(body);

    if (!id) {
      throw new Error('Allocation ID is required.');
    }

    connection = await getConnection();
    await ensureAllocationBelongsToSchool(connection, session.schoolId, id);
    await validateOwnership(connection, session.schoolId, { class_id, subject_id, teacher_id });

    // Phase D: updating = supersede the targeted row + open a fresh one.
    // This preserves history rather than overwriting.
    await connection.execute(
      `UPDATE class_subjects SET valid_to = CURDATE() WHERE id = ?`,
      [id]
    );

    const [result2] = await connection.execute(
      `INSERT INTO class_subjects (class_id, subject_id, teacher_id, custom_initials, valid_from, valid_to)
       VALUES (?, ?, ?, ?, CURDATE(), NULL)`,
      [class_id, subject_id, teacher_id, custom_initials]
    );
    const newId2 = (result2 as any).insertId;

    // Fetch updated record
    const [rows] = await connection.execute(
      `SELECT
         cs.id, cs.class_id, cs.subject_id, cs.teacher_id, cs.custom_initials,
         c.name AS class_name, sub.name AS subject_name,
         CONCAT(UPPER(LEFT(p.first_name, 1)), UPPER(LEFT(p.last_name, 1))) AS auto_generated_initials,
         CONCAT(p.first_name, ' ', p.last_name) AS teacher_name
       FROM class_subjects cs
       JOIN classes c ON cs.class_id = c.id
       JOIN subjects sub ON cs.subject_id = sub.id
       LEFT JOIN staff s ON cs.teacher_id = s.id
       LEFT JOIN people p ON s.person_id = p.id
       WHERE cs.id = ?`,
      [newId2]
    );

    await connection.end();

    if (rows.length === 0) {
      throw new Error('Failed to update allocation.');
    }

    const record = rows[0];
    const resolvedInitials = resolveTeacherInitials({
      allocationInitials: record.custom_initials,
      teacherName: record.teacher_name,
      teacherInitials: record.auto_generated_initials,
    });
    const allocation = {
      id: record.id,
      class_id: record.class_id,
      subject_id: record.subject_id,
      teacher_id: record.teacher_id,
      custom_initials: record.custom_initials,
      class_name: record.class_name,
      subject_name: record.subject_name,
      teacher_name: record.teacher_name || 'Unassigned',
      display_initials: resolvedInitials === 'N/A' ? '' : resolvedInitials,
    };

    return NextResponse.json({ success: true, data: allocation });
  } catch (error) {
    if (connection) await connection.end();
    console.error('Error updating allocation:', error);
    const status = error.message.includes('not found') ? 404 : 400;
    return NextResponse.json({ success: false, message: error.message }, { status });
  }
}

// ============================================================================
// DELETE: Remove allocation
// ============================================================================

export async function DELETE(req: Request) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      throw new Error('Allocation ID is required.');
    }

    connection = await getConnection();
    await ensureAllocationBelongsToSchool(connection, session.schoolId, Number(id));

    await connection.execute('DELETE FROM class_subjects WHERE id = ?', [id]);

    await connection.end();

    return NextResponse.json({ success: true, message: 'Allocation deleted successfully.' });
  } catch (error) {
    if (connection) await connection.end();
    console.error('Error deleting allocation:', error);
    const status = error.message.includes('not found') ? 404 : 400;
    return NextResponse.json({ success: false, message: error.message }, { status });
  }
}
