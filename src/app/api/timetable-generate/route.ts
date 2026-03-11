import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

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

// ─── POST - Auto-generate timetable ────────────────────────────────
export async function POST(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json();
    const { class_id, stream_id, clear_existing } = body;

    if (!class_id) {
      return NextResponse.json({ error: 'class_id is required.' }, { status: 400 });
    }

    connection = await getConnection();

    // 1. Get available periods (non-break)
    const [periodsRaw] = await connection.execute(
      'SELECT id, name, period_order FROM timetable_periods WHERE school_id = ? AND is_break = FALSE ORDER BY period_order',
      [session.schoolId]
    );
    const periods = periodsRaw as any[];
    if (!periods.length) {
      return NextResponse.json({ error: 'No periods defined. Please create timetable periods first.' }, { status: 400 });
    }

    // 2. Get subject requirements for this class
    const [reqsRaw] = await connection.execute(
      `SELECT swp.subject_id, s.name as subject_name, swp.periods_per_week,
              cs.teacher_id
       FROM subject_weekly_periods swp
       JOIN subjects s ON swp.subject_id = s.id
       LEFT JOIN class_subjects cs ON cs.class_id = swp.class_id AND cs.subject_id = swp.subject_id AND cs.school_id = swp.school_id
       WHERE swp.class_id = ? AND swp.school_id = ?
       ORDER BY swp.periods_per_week DESC`,
      [class_id, session.schoolId]
    );
    let subjectReqs: SubjectReq[] = (reqsRaw as any[]).map(r => ({
      subject_id: r.subject_id,
      subject_name: r.subject_name,
      teacher_id: r.teacher_id || null,
      periods_per_week: r.periods_per_week
    }));

    // If no subject_weekly_periods defined, fall back to class_subjects
    if (subjectReqs.length === 0) {
      const [csRaw] = await connection.execute(
        `SELECT cs.subject_id, s.name as subject_name, cs.teacher_id
         FROM class_subjects cs
         JOIN subjects s ON cs.subject_id = s.id
         WHERE cs.class_id = ? AND cs.school_id = ?`,
        [class_id, session.schoolId]
      );
      subjectReqs = (csRaw as any[]).map(r => ({
        subject_id: r.subject_id,
        subject_name: r.subject_name,
        teacher_id: r.teacher_id || null,
        periods_per_week: 3 // default 3 periods/week
      }));
    }

    if (subjectReqs.length === 0) {
      return NextResponse.json({
        error: 'No subjects assigned to this class. Please assign subjects first (via Class Subjects or Subject Weekly Periods).'
      }, { status: 400 });
    }

    // 3. Get existing teacher bookings (for other classes)
    const [existingRaw] = await connection.execute(
      `SELECT teacher_id, day_of_week, period_id FROM timetable_entries 
       WHERE school_id = ? AND class_id != ?`,
      [session.schoolId, class_id]
    );
    const teacherBusy = new Set<string>();
    for (const e of existingRaw as any[]) {
      if (e.teacher_id) {
        teacherBusy.add(`${e.teacher_id}-${e.day_of_week}-${e.period_id}`);
      }
    }

    // 4. Greedy placement algorithm
    const DAYS = [1, 2, 3, 4, 5]; // Monday-Friday
    const totalSlots = DAYS.length * periods.length;
    const placed: PlacedEntry[] = [];
    const occupied = new Set<string>(); // "day-periodId"
    const subjectLastDay = new Map<number, number>(); // last day a subject was placed
    const subjectLastPeriodOrder = new Map<number, number>();
    const unplaced: { subject_name: string; remaining: number }[] = [];

    // Sort by highest frequency first
    subjectReqs.sort((a, b) => b.periods_per_week - a.periods_per_week);

    for (const subj of subjectReqs) {
      let remaining = subj.periods_per_week;

      // Try to spread across days evenly
      const dayOrder = [...DAYS];
      // Shuffle starting point for variety
      const offset = subj.subject_id % DAYS.length;
      const rotatedDays = [...dayOrder.slice(offset), ...dayOrder.slice(0, offset)];

      // Multiple passes to fill required periods
      for (let pass = 0; pass < Math.ceil(subj.periods_per_week / DAYS.length) + 1 && remaining > 0; pass++) {
        for (const day of rotatedDays) {
          if (remaining <= 0) break;

          // Find best period for this day
          for (const period of periods) {
            const slotKey = `${day}-${period.id}`;
            if (occupied.has(slotKey)) continue;

            // Check teacher availability
            if (subj.teacher_id) {
              const teacherKey = `${subj.teacher_id}-${day}-${period.id}`;
              if (teacherBusy.has(teacherKey)) continue;
            }

            // Avoid consecutive same subject (check if previous period same day had this subject)
            const lastOrder = subjectLastPeriodOrder.get(subj.subject_id);
            const lastDay = subjectLastDay.get(subj.subject_id);
            if (lastDay === day && lastOrder !== undefined && Math.abs(period.period_order - lastOrder) === 1) {
              // Try to skip, but accept if no other option (handled by trying next period first)
              if (remaining > 1) continue; // only skip if we have slack
            }

            // Place it
            occupied.add(slotKey);
            if (subj.teacher_id) {
              teacherBusy.add(`${subj.teacher_id}-${day}-${period.id}`);
            }
            subjectLastDay.set(subj.subject_id, day);
            subjectLastPeriodOrder.set(subj.subject_id, period.period_order);

            placed.push({
              day_of_week: day,
              period_id: period.id,
              class_id: class_id,
              stream_id: stream_id || null,
              subject_id: subj.subject_id,
              teacher_id: subj.teacher_id,
              subject_name: subj.subject_name
            });

            remaining--;
            break; // Move to next day
          }
        }
      }

      if (remaining > 0) {
        unplaced.push({ subject_name: subj.subject_name, remaining });
      }
    }

    return NextResponse.json({
      success: true,
      preview: true,
      data: placed,
      summary: {
        total_placed: placed.length,
        total_slots: totalSlots,
        unplaced: unplaced.length > 0 ? unplaced : undefined,
      }
    });
  } catch (e: any) {
    console.error('Timetable generate error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

// ─── PUT - Confirm and save generated timetable ─────────────────────
export async function PUT(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json();
    const { entries, class_id, stream_id, clear_existing } = body;

    if (!entries?.length) {
      return NextResponse.json({ error: 'No entries to save.' }, { status: 400 });
    }

    connection = await getConnection();

    // Optionally clear existing entries for this class/stream
    if (clear_existing && class_id) {
      let delSql = 'DELETE FROM timetable_entries WHERE school_id = ? AND class_id = ?';
      const delParams: any[] = [session.schoolId, class_id];
      if (stream_id) {
        delSql += ' AND stream_id = ?';
        delParams.push(stream_id);
      }
      await connection.execute(delSql, delParams);
    }

    // Insert all entries
    let inserted = 0;
    const errors: string[] = [];

    for (const entry of entries) {
      try {
        await connection.execute(
          `INSERT INTO timetable_entries (school_id, day_of_week, period_id, class_id, stream_id, subject_id, teacher_id, room)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE subject_id = VALUES(subject_id), teacher_id = VALUES(teacher_id), room = VALUES(room)`,
          [session.schoolId, entry.day_of_week, entry.period_id, entry.class_id, entry.stream_id || null, entry.subject_id, entry.teacher_id || null, entry.room || null]
        );
        inserted++;
      } catch (e: any) {
        errors.push(`Failed to insert day ${entry.day_of_week} period ${entry.period_id}: ${e.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      inserted,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (e: any) {
    console.error('Timetable generate confirm error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
