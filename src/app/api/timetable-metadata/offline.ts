import { NextResponse } from 'next/server';

/**
 * local-sqlite branch — Phase 7 sub-effort 44, same §25a pattern. Only
 * COALESCE/CONCAT needed translating to SQLite's `||`; every other clause
 * is identical to the online route's.
 */
export async function offlineMetadata(schoolId: number) {
  const { getSqliteDb } = await import('@/lib/repo/sqlite/singleton');
  const sdb = getSqliteDb();

  const classes = sdb.prepare(
    `SELECT id, name, class_level FROM classes WHERE school_id = ? ORDER BY class_level, name`
  ).all(schoolId);
  const streams = sdb.prepare(
    `SELECT id, name, class_id FROM streams WHERE school_id = ? ORDER BY name`
  ).all(schoolId);
  const subjects = sdb.prepare(
    `SELECT id, name, code, subject_type FROM subjects WHERE school_id = ? ORDER BY name`
  ).all(schoolId);
  const teachers = sdb.prepare(
    `SELECT s.id, s.staff_no, s.position,
            COALESCE(p.first_name || ' ' || p.last_name, 'Staff ' || s.id) as name
       FROM staff s
       LEFT JOIN people p ON s.person_id = p.id
      WHERE s.school_id = ? AND s.status = 'active'
      ORDER BY name`
  ).all(schoolId);
  const periods = sdb.prepare(
    `SELECT id, name, short_name, start_time, end_time, period_order, is_break FROM timetable_periods WHERE school_id = ? ORDER BY period_order`
  ).all(schoolId);

  return NextResponse.json({ success: true, data: { classes, streams, subjects, teachers, periods } });
}
