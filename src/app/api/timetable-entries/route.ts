import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

// ─── Conflict checking helper ───────────────────────────────────────
async function checkConflicts(
  connection: any,
  schoolId: number,
  dayOfWeek: number,
  periodId: number,
  teacherId: number | null,
  streamId: number | null,
  room: string | null,
  excludeId?: number
) {
  const conflicts: string[] = [];
  const excludeClause = excludeId ? ' AND id != ?' : '';
  const baseParams = (extra: any[]) => excludeId ? [...extra, excludeId] : extra;

  // Rule 1: Teacher conflict
  if (teacherId) {
    const [rows] = await connection.execute(
      `SELECT te.id, s.name as subject_name, c.name as class_name 
       FROM timetable_entries te 
       JOIN subjects s ON te.subject_id = s.id
       JOIN classes c ON te.class_id = c.id
       WHERE te.school_id = ? AND te.teacher_id = ? AND te.day_of_week = ? AND te.period_id = ?${excludeClause}`,
      baseParams([schoolId, teacherId, dayOfWeek, periodId])
    );
    if ((rows as any[]).length > 0) {
      const r = (rows as any[])[0];
      conflicts.push(`Teacher already scheduled for ${r.subject_name} in ${r.class_name} during this period.`);
    }
  }

  // Rule 2: Stream conflict
  if (streamId) {
    const [rows] = await connection.execute(
      `SELECT te.id, s.name as subject_name 
       FROM timetable_entries te 
       JOIN subjects s ON te.subject_id = s.id
       WHERE te.school_id = ? AND te.stream_id = ? AND te.day_of_week = ? AND te.period_id = ?${excludeClause}`,
      baseParams([schoolId, streamId, dayOfWeek, periodId])
    );
    if ((rows as any[]).length > 0) {
      const r = (rows as any[])[0];
      conflicts.push(`Stream already has ${r.subject_name} scheduled in this period.`);
    }
  }

  // Rule 3: Room conflict
  if (room) {
    const [rows] = await connection.execute(
      `SELECT te.id, s.name as subject_name, c.name as class_name 
       FROM timetable_entries te 
       JOIN subjects s ON te.subject_id = s.id
       JOIN classes c ON te.class_id = c.id
       WHERE te.school_id = ? AND te.room = ? AND te.day_of_week = ? AND te.period_id = ?${excludeClause}`,
      baseParams([schoolId, room, dayOfWeek, periodId])
    );
    if ((rows as any[]).length > 0) {
      const r = (rows as any[])[0];
      conflicts.push(`Room "${room}" already in use by ${r.class_name} (${r.subject_name}) during this period.`);
    }
  }

  return conflicts;
}

// ─── GET - Fetch timetable entries ──────────────────────────────────
export async function GET(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get('class_id');
    const streamId = searchParams.get('stream_id');
    const teacherId = searchParams.get('teacher_id');

    connection = await getConnection();

    let sql = `
      SELECT 
        te.id, te.day_of_week, te.period_id, te.class_id, te.stream_id, 
        te.subject_id, te.teacher_id, te.room,
        tp.name as period_name, tp.short_name as period_short, tp.start_time, tp.end_time, tp.period_order,
        c.name as class_name,
        st.name as stream_name,
        sub.name as subject_name, sub.code as subject_code,
        COALESCE(CONCAT(p.first_name, ' ', p.last_name), CONCAT('Staff ', stf.id)) as teacher_name
      FROM timetable_entries te
      JOIN timetable_periods tp ON te.period_id = tp.id
      JOIN classes c ON te.class_id = c.id
      JOIN subjects sub ON te.subject_id = sub.id
      LEFT JOIN streams st ON te.stream_id = st.id
      LEFT JOIN staff stf ON te.teacher_id = stf.id
      LEFT JOIN people p ON stf.person_id = p.id
      WHERE te.school_id = ?
    `;
    const params: any[] = [session.schoolId];

    if (classId) { sql += ' AND te.class_id = ?'; params.push(classId); }
    if (streamId) { sql += ' AND te.stream_id = ?'; params.push(streamId); }
    if (teacherId) { sql += ' AND te.teacher_id = ?'; params.push(teacherId); }

    sql += ' ORDER BY te.day_of_week, tp.period_order';
    const [rows] = await connection.execute(sql, params);
    return NextResponse.json({ success: true, data: rows });
  } catch (e: any) {
    console.error('Timetable entries GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

// ─── POST - Create entry with conflict detection ────────────────────
export async function POST(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json();
    const { day_of_week, period_id, class_id, subject_id, stream_id, teacher_id, room } = body;

    if (!day_of_week || !period_id || !class_id || !subject_id) {
      return NextResponse.json({ error: 'day_of_week, period_id, class_id, and subject_id are required.' }, { status: 400 });
    }
    if (day_of_week < 1 || day_of_week > 7) {
      return NextResponse.json({ error: 'day_of_week must be between 1 (Monday) and 7 (Sunday).' }, { status: 400 });
    }

    connection = await getConnection();

    // Conflict detection
    const conflicts = await checkConflicts(
      connection, session.schoolId, day_of_week, period_id,
      teacher_id || null, stream_id || null, room || null
    );

    if (conflicts.length > 0) {
      return NextResponse.json({ error: 'Scheduling conflict detected.', conflicts }, { status: 409 });
    }

    const [result] = await connection.execute(
      `INSERT INTO timetable_entries (school_id, day_of_week, period_id, class_id, stream_id, subject_id, teacher_id, room)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [session.schoolId, day_of_week, period_id, class_id, stream_id || null, subject_id, teacher_id || null, room || null]
    );
    return NextResponse.json({ success: true, id: (result as any).insertId }, { status: 201 });
  } catch (e: any) {
    console.error('Timetable entries POST error:', e);
    if (e.code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ error: 'Duplicate entry: this slot is already filled.' }, { status: 409 });
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

// ─── PUT - Update entry with conflict detection ─────────────────────
export async function PUT(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

    connection = await getConnection();

    // Get current entry
    const [existing] = await connection.execute(
      'SELECT * FROM timetable_entries WHERE id = ? AND school_id = ?',
      [body.id, session.schoolId]
    );
    if (!(existing as any[]).length) {
      return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
    }

    const dayOfWeek = body.day_of_week || (existing as any[])[0].day_of_week;
    const periodId = body.period_id || (existing as any[])[0].period_id;

    // Conflict detection (exclude self)
    const conflicts = await checkConflicts(
      connection, session.schoolId, dayOfWeek, periodId,
      body.teacher_id !== undefined ? body.teacher_id : (existing as any[])[0].teacher_id,
      body.stream_id !== undefined ? body.stream_id : (existing as any[])[0].stream_id,
      body.room !== undefined ? body.room : (existing as any[])[0].room,
      body.id
    );

    if (conflicts.length > 0) {
      return NextResponse.json({ error: 'Scheduling conflict detected.', conflicts }, { status: 409 });
    }

    await connection.execute(
      `UPDATE timetable_entries SET 
        day_of_week = COALESCE(?, day_of_week),
        period_id = COALESCE(?, period_id),
        class_id = COALESCE(?, class_id),
        stream_id = ?,
        subject_id = COALESCE(?, subject_id),
        teacher_id = ?,
        room = ?
       WHERE id = ? AND school_id = ?`,
      [
        body.day_of_week || null, body.period_id || null, body.class_id || null,
        body.stream_id !== undefined ? body.stream_id : (existing as any[])[0].stream_id,
        body.subject_id || null,
        body.teacher_id !== undefined ? body.teacher_id : (existing as any[])[0].teacher_id,
        body.room !== undefined ? body.room : (existing as any[])[0].room,
        body.id, session.schoolId
      ]
    );
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('Timetable entries PUT error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

// ─── DELETE ─────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 });

    connection = await getConnection();
    await connection.execute('DELETE FROM timetable_entries WHERE id = ? AND school_id = ?', [id, session.schoolId]);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

// ─── PATCH - Check conflicts without saving ─────────────────────────
export async function PATCH(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json();
    const { day_of_week, period_id, teacher_id, stream_id, room, exclude_id } = body;

    if (!day_of_week || !period_id) {
      return NextResponse.json({ error: 'day_of_week and period_id required.' }, { status: 400 });
    }

    connection = await getConnection();
    const conflicts = await checkConflicts(
      connection, session.schoolId, day_of_week, period_id,
      teacher_id || null, stream_id || null, room || null,
      exclude_id
    );

    // Also get teacher availability for suggestions
    let teacherAvailability: any[] = [];
    if (teacher_id && conflicts.some(c => c.includes('Teacher'))) {
      const [avail] = await connection.execute(
        `SELECT tp.id, tp.name, tp.start_time, tp.end_time
         FROM timetable_periods tp
         WHERE tp.school_id = ?
           AND tp.is_break = FALSE
           AND tp.id NOT IN (
             SELECT period_id FROM timetable_entries
             WHERE school_id = ? AND teacher_id = ? AND day_of_week = ?
           )
         ORDER BY tp.period_order`,
        [session.schoolId, session.schoolId, teacher_id, day_of_week]
      );
      teacherAvailability = avail as any[];
    }

    return NextResponse.json({
      success: true,
      conflicts,
      has_conflict: conflicts.length > 0,
      suggestions: teacherAvailability.length > 0
        ? { available_periods: teacherAvailability }
        : undefined
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
