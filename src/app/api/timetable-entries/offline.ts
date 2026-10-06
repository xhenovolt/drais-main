import { NextResponse } from 'next/server';

/**
 * local-sqlite branch — Phase 7 sub-effort 44, same §25a pattern. The three
 * conflict rules (teacher/stream/room) and the PUT route's two different
 * null-handling behaviors (COALESCE-to-existing for day/period/class/subject
 * vs explicit-null-clears for stream/teacher/room, resolved in JS before the
 * query either way) are ported literally — these must stay byte-for-byte
 * equivalent to the online route's own behavior, not "improved."
 */
async function db() {
  const { getSqliteDb } = await import('@/lib/repo/sqlite/singleton');
  return getSqliteDb();
}

function checkConflicts(
  sdb: any,
  schoolId: number,
  dayOfWeek: number,
  periodId: number,
  teacherId: number | null,
  streamId: number | null,
  room: string | null,
  excludeId?: number,
): string[] {
  const conflicts: string[] = [];
  // The online route's own exclude clause is a bare, unqualified
  // `AND id != ?` across a JOIN where timetable_entries/subjects/classes
  // all have their own `id` column — ambiguous SQL by the standard, and
  // SQLite (rightly) refuses it with "ambiguous column name: id" rather
  // than silently guessing. Qualified here as `te.id`, the clearly
  // intended table (excluding the entry's OWN row, not a subject's or
  // class's row that happens to share the id value). Not changed online
  // per §25a — worth checking against real TiDB separately, since TiDB's
  // optimizer may resolve this ambiguity differently than strict MySQL/
  // SQLite do, which would explain why this was never caught in production.
  const excludeClause = excludeId ? ' AND te.id != ?' : '';
  const withExclude = (extra: any[]) => (excludeId ? [...extra, excludeId] : extra);

  if (teacherId) {
    const r = sdb.prepare(
      `SELECT te.id, s.name as subject_name, c.name as class_name
         FROM timetable_entries te
         JOIN subjects s ON te.subject_id = s.id
         JOIN classes c ON te.class_id = c.id
        WHERE te.school_id = ? AND te.teacher_id = ? AND te.day_of_week = ? AND te.period_id = ?${excludeClause}`
    ).get(...withExclude([schoolId, teacherId, dayOfWeek, periodId])) as any;
    if (r) conflicts.push(`Teacher already scheduled for ${r.subject_name} in ${r.class_name} during this period.`);
  }

  if (streamId) {
    const r = sdb.prepare(
      `SELECT te.id, s.name as subject_name
         FROM timetable_entries te
         JOIN subjects s ON te.subject_id = s.id
        WHERE te.school_id = ? AND te.stream_id = ? AND te.day_of_week = ? AND te.period_id = ?${excludeClause}`
    ).get(...withExclude([schoolId, streamId, dayOfWeek, periodId])) as any;
    if (r) conflicts.push(`Stream already has ${r.subject_name} scheduled in this period.`);
  }

  if (room) {
    const r = sdb.prepare(
      `SELECT te.id, s.name as subject_name, c.name as class_name
         FROM timetable_entries te
         JOIN subjects s ON te.subject_id = s.id
         JOIN classes c ON te.class_id = c.id
        WHERE te.school_id = ? AND te.room = ? AND te.day_of_week = ? AND te.period_id = ?${excludeClause}`
    ).get(...withExclude([schoolId, room, dayOfWeek, periodId])) as any;
    if (r) conflicts.push(`Room "${room}" already in use by ${r.class_name} (${r.subject_name}) during this period.`);
  }

  return conflicts;
}

export async function getEntries(schoolId: number, classId: string | null, streamId: string | null, teacherId: string | null) {
  const sdb = await db();
  let sql = `
    SELECT
      te.id, te.day_of_week, te.period_id, te.class_id, te.stream_id,
      te.subject_id, te.teacher_id, te.room,
      tp.name as period_name, tp.short_name as period_short, tp.start_time, tp.end_time, tp.period_order,
      c.name as class_name,
      st.name as stream_name,
      sub.name as subject_name, sub.code as subject_code,
      COALESCE(p.first_name || ' ' || p.last_name, 'Staff ' || stf.id) as teacher_name
    FROM timetable_entries te
    JOIN timetable_periods tp ON te.period_id = tp.id
    JOIN classes c ON te.class_id = c.id
    JOIN subjects sub ON te.subject_id = sub.id
    LEFT JOIN streams st ON te.stream_id = st.id
    LEFT JOIN staff stf ON te.teacher_id = stf.id
    LEFT JOIN people p ON stf.person_id = p.id
    WHERE te.school_id = ?
  `;
  const params: any[] = [schoolId];
  if (classId) { sql += ' AND te.class_id = ?'; params.push(classId); }
  if (streamId) { sql += ' AND te.stream_id = ?'; params.push(streamId); }
  if (teacherId) { sql += ' AND te.teacher_id = ?'; params.push(teacherId); }
  sql += ' ORDER BY te.day_of_week, tp.period_order';

  const rows = sdb.prepare(sql).all(...params);
  return NextResponse.json({ success: true, data: rows });
}

export async function createEntry(schoolId: number, body: any) {
  const sdb = await db();
  const { day_of_week, period_id, class_id, subject_id, stream_id, teacher_id, room } = body;

  const conflicts = checkConflicts(sdb, schoolId, day_of_week, period_id, teacher_id || null, stream_id || null, room || null);
  if (conflicts.length > 0) {
    return NextResponse.json({ error: 'Scheduling conflict detected.', conflicts }, { status: 409 });
  }

  try {
    const result = sdb.prepare(
      `INSERT INTO timetable_entries (school_id, day_of_week, period_id, class_id, stream_id, subject_id, teacher_id, room)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(schoolId, day_of_week, period_id, class_id, stream_id || null, subject_id, teacher_id || null, room || null);
    return NextResponse.json({ success: true, id: result.lastInsertRowid }, { status: 201 });
  } catch (e: any) {
    if (typeof e.code === 'string' && e.code.startsWith('SQLITE_CONSTRAINT')) {
      return NextResponse.json({ error: 'Duplicate entry: this slot is already filled.' }, { status: 409 });
    }
    throw e;
  }
}

export async function updateEntry(schoolId: number, body: any) {
  const sdb = await db();
  const existing = sdb.prepare(`SELECT * FROM timetable_entries WHERE id = ? AND school_id = ?`).get(body.id, schoolId) as any;
  if (!existing) return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });

  const dayOfWeek = body.day_of_week || existing.day_of_week;
  const periodId = body.period_id || existing.period_id;
  const resolvedStreamId = body.stream_id !== undefined ? body.stream_id : existing.stream_id;
  const resolvedTeacherId = body.teacher_id !== undefined ? body.teacher_id : existing.teacher_id;
  const resolvedRoom = body.room !== undefined ? body.room : existing.room;

  const conflicts = checkConflicts(sdb, schoolId, dayOfWeek, periodId, resolvedTeacherId, resolvedStreamId, resolvedRoom, body.id);
  if (conflicts.length > 0) {
    return NextResponse.json({ error: 'Scheduling conflict detected.', conflicts }, { status: 409 });
  }

  sdb.prepare(
    `UPDATE timetable_entries SET
       day_of_week = COALESCE(?, day_of_week),
       period_id   = COALESCE(?, period_id),
       class_id    = COALESCE(?, class_id),
       stream_id   = ?,
       subject_id  = COALESCE(?, subject_id),
       teacher_id  = ?,
       room        = ?
     WHERE id = ? AND school_id = ?`
  ).run(
    body.day_of_week || null, body.period_id || null, body.class_id || null,
    resolvedStreamId, body.subject_id || null, resolvedTeacherId, resolvedRoom,
    body.id, schoolId,
  );
  return NextResponse.json({ success: true });
}

export async function deleteEntry(schoolId: number, id: string) {
  const sdb = await db();
  sdb.prepare(`DELETE FROM timetable_entries WHERE id = ? AND school_id = ?`).run(id, schoolId);
  return NextResponse.json({ success: true });
}

export async function checkConflictsOnly(schoolId: number, body: any) {
  const sdb = await db();
  const { day_of_week, period_id, teacher_id, stream_id, room, exclude_id } = body;

  const conflicts = checkConflicts(sdb, schoolId, day_of_week, period_id, teacher_id || null, stream_id || null, room || null, exclude_id);

  let teacherAvailability: any[] = [];
  if (teacher_id && conflicts.some((c) => c.includes('Teacher'))) {
    teacherAvailability = sdb.prepare(
      `SELECT tp.id, tp.name, tp.start_time, tp.end_time
         FROM timetable_periods tp
        WHERE tp.school_id = ?
          AND tp.is_break = 0
          AND tp.id NOT IN (
            SELECT period_id FROM timetable_entries
             WHERE school_id = ? AND teacher_id = ? AND day_of_week = ?
          )
        ORDER BY tp.period_order`
    ).all(schoolId, schoolId, teacher_id, day_of_week);
  }

  return NextResponse.json({
    success: true,
    conflicts,
    has_conflict: conflicts.length > 0,
    suggestions: teacherAvailability.length > 0 ? { available_periods: teacherAvailability } : undefined,
  });
}
