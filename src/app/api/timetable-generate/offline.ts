import { NextResponse } from 'next/server';

/**
 * local-sqlite branch — Phase 7 sub-effort 44, same §25a pattern. The
 * greedy placement algorithm itself does no DB I/O (pure in-memory once
 * the three initial reads are done), so it's copied here verbatim rather
 * than extracted into a shared module the online route.ts would also have
 * to import — §25a's own rule is that online code stays byte-for-byte
 * unchanged unless there's an unrelated reason to touch it, and refactoring
 * it to be shared would touch the online file for no reason but this one.
 * Real duplication, same accepted tradeoff this whole offline layer already
 * makes everywhere else business logic isn't pure SQL.
 */
interface SubjectReq {
  subject_id: number;
  subject_name: string;
  teacher_id: number | null;
  periods_per_week: number;
}

interface PlacedEntry {
  day_of_week: number;
  period_id: number;
  class_id: number;
  stream_id: number | null;
  subject_id: number;
  teacher_id: number | null;
  subject_name: string;
}

async function db() {
  const { getSqliteDb } = await import('@/lib/repo/sqlite/singleton');
  return getSqliteDb();
}

export async function generatePreview(schoolId: number, class_id: number, stream_id: number | null) {
  const sdb = await db();

  const periods = sdb.prepare(
    `SELECT id, name, period_order FROM timetable_periods WHERE school_id = ? AND is_break = 0 ORDER BY period_order`
  ).all(schoolId) as any[];
  if (!periods.length) {
    return NextResponse.json({ error: 'No periods defined. Please create timetable periods first.' }, { status: 400 });
  }

  // The online route's own JOIN also ANDs `cs.school_id = swp.school_id` —
  // the real online class_subjects table has a school_id column (added by
  // database/production_init.sql, outside the canonical migration set),
  // but the local one deliberately doesn't (sub-effort 16: ownership is
  // scoped via class_id -> classes.school_id instead). Dropped here, not
  // missed: swp.class_id is already filtered to this school via
  // `swp.school_id = ?` below, so any class_subjects row joining on that
  // same class_id is automatically the right school's row too — the
  // online predicate is redundant given the join, not load-bearing.
  let subjectReqs: SubjectReq[] = (sdb.prepare(
    `SELECT swp.subject_id, s.name as subject_name, swp.periods_per_week, cs.teacher_id
       FROM subject_weekly_periods swp
       JOIN subjects s ON swp.subject_id = s.id
       LEFT JOIN class_subjects cs ON cs.class_id = swp.class_id AND cs.subject_id = swp.subject_id
      WHERE swp.class_id = ? AND swp.school_id = ?
      ORDER BY swp.periods_per_week DESC`
  ).all(class_id, schoolId) as any[]).map((r) => ({
    subject_id: r.subject_id,
    subject_name: r.subject_name,
    teacher_id: r.teacher_id || null,
    periods_per_week: r.periods_per_week,
  }));

  if (subjectReqs.length === 0) {
    subjectReqs = (sdb.prepare(
      `SELECT cs.subject_id, s.name as subject_name, cs.teacher_id
         FROM class_subjects cs
         JOIN subjects s ON cs.subject_id = s.id
        WHERE cs.class_id = ?`
    ).all(class_id) as any[]).map((r) => ({
      subject_id: r.subject_id,
      subject_name: r.subject_name,
      teacher_id: r.teacher_id || null,
      periods_per_week: 3,
    }));
  }

  if (subjectReqs.length === 0) {
    return NextResponse.json({
      error: 'No subjects assigned to this class. Please assign subjects first (via Class Subjects or Subject Weekly Periods).',
    }, { status: 400 });
  }

  const existingRaw = sdb.prepare(
    `SELECT teacher_id, day_of_week, period_id FROM timetable_entries WHERE school_id = ? AND class_id != ?`
  ).all(schoolId, class_id) as any[];
  const teacherBusy = new Set<string>();
  for (const e of existingRaw) {
    if (e.teacher_id) teacherBusy.add(`${e.teacher_id}-${e.day_of_week}-${e.period_id}`);
  }

  const DAYS = [1, 2, 3, 4, 5];
  const totalSlots = DAYS.length * periods.length;
  const placed: PlacedEntry[] = [];
  const occupied = new Set<string>();
  const subjectLastDay = new Map<number, number>();
  const subjectLastPeriodOrder = new Map<number, number>();
  const unplaced: { subject_name: string; remaining: number }[] = [];

  subjectReqs.sort((a, b) => b.periods_per_week - a.periods_per_week);

  for (const subj of subjectReqs) {
    let remaining = subj.periods_per_week;
    const dayOrder = [...DAYS];
    const offset = subj.subject_id % DAYS.length;
    const rotatedDays = [...dayOrder.slice(offset), ...dayOrder.slice(0, offset)];

    for (let pass = 0; pass < Math.ceil(subj.periods_per_week / DAYS.length) + 1 && remaining > 0; pass++) {
      for (const day of rotatedDays) {
        if (remaining <= 0) break;

        for (const period of periods) {
          const slotKey = `${day}-${period.id}`;
          if (occupied.has(slotKey)) continue;

          if (subj.teacher_id) {
            const teacherKey = `${subj.teacher_id}-${day}-${period.id}`;
            if (teacherBusy.has(teacherKey)) continue;
          }

          const lastOrder = subjectLastPeriodOrder.get(subj.subject_id);
          const lastDay = subjectLastDay.get(subj.subject_id);
          if (lastDay === day && lastOrder !== undefined && Math.abs(period.period_order - lastOrder) === 1) {
            if (remaining > 1) continue;
          }

          occupied.add(slotKey);
          if (subj.teacher_id) teacherBusy.add(`${subj.teacher_id}-${day}-${period.id}`);
          subjectLastDay.set(subj.subject_id, day);
          subjectLastPeriodOrder.set(subj.subject_id, period.period_order);

          placed.push({
            day_of_week: day,
            period_id: period.id,
            class_id,
            stream_id: stream_id || null,
            subject_id: subj.subject_id,
            teacher_id: subj.teacher_id,
            subject_name: subj.subject_name,
          });

          remaining--;
          break;
        }
      }
    }

    if (remaining > 0) unplaced.push({ subject_name: subj.subject_name, remaining });
  }

  return NextResponse.json({
    success: true,
    preview: true,
    data: placed,
    summary: {
      total_placed: placed.length,
      total_slots: totalSlots,
      unplaced: unplaced.length > 0 ? unplaced : undefined,
    },
  });
}

export async function generateSave(schoolId: number, entries: any[], class_id: number | undefined, stream_id: number | undefined, clear_existing: boolean | undefined) {
  const sdb = await db();

  if (clear_existing && class_id) {
    let delSql = 'DELETE FROM timetable_entries WHERE school_id = ? AND class_id = ?';
    const delParams: any[] = [schoolId, class_id];
    if (stream_id) { delSql += ' AND stream_id = ?'; delParams.push(stream_id); }
    sdb.prepare(delSql).run(...delParams);
  }

  let inserted = 0;
  const errors: string[] = [];

  const upsert = sdb.prepare(
    `INSERT INTO timetable_entries (school_id, day_of_week, period_id, class_id, stream_id, subject_id, teacher_id, room)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(school_id, day_of_week, period_id, class_id, stream_id)
     DO UPDATE SET subject_id = excluded.subject_id, teacher_id = excluded.teacher_id, room = excluded.room`
  );

  for (const entry of entries) {
    try {
      upsert.run(schoolId, entry.day_of_week, entry.period_id, entry.class_id, entry.stream_id || null, entry.subject_id, entry.teacher_id || null, entry.room || null);
      inserted++;
    } catch (e: any) {
      errors.push(`Failed to insert day ${entry.day_of_week} period ${entry.period_id}: ${e.message}`);
    }
  }

  return NextResponse.json({ success: true, inserted, errors: errors.length > 0 ? errors : undefined });
}
