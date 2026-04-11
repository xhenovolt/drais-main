import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/attendance/settings
 * Fetch the active attendance rule for the current school.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const rows = await query(
      `SELECT * FROM attendance_rules
       WHERE school_id = ? AND is_active = 1
       ORDER BY priority ASC
       LIMIT 1`,
      [session.schoolId],
    );

    const rule = (rows as any[])?.[0] || null;
    return NextResponse.json({ success: true, rule });
  } catch (err: any) {
    console.error('[attendance/settings GET]', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch settings' }, { status: 500 });
  }
}

/**
 * POST /api/attendance/settings
 * Create or update attendance rule for the current school.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      rule_name = 'Default',
      rule_description = '',
      arrival_start_time,
      arrival_end_time,
      late_threshold_minutes = 15,
      absence_cutoff_time,
      closing_time,
      applies_to = 'students',
      applies_to_classes,
      ignore_duplicate_scans_within_minutes = 2,
    } = body;

    // Validate time formats (HH:MM or HH:MM:SS)
    const timeRe = /^\d{2}:\d{2}(:\d{2})?$/;
    if (arrival_start_time && !timeRe.test(arrival_start_time)) {
      return NextResponse.json({ error: 'Invalid arrival_start_time format' }, { status: 400 });
    }
    if (arrival_end_time && !timeRe.test(arrival_end_time)) {
      return NextResponse.json({ error: 'Invalid arrival_end_time format' }, { status: 400 });
    }
    if (absence_cutoff_time && !timeRe.test(absence_cutoff_time)) {
      return NextResponse.json({ error: 'Invalid absence_cutoff_time format' }, { status: 400 });
    }
    if (closing_time && !timeRe.test(closing_time)) {
      return NextResponse.json({ error: 'Invalid closing_time format' }, { status: 400 });
    }

    // Deactivate existing rules for this school
    await query(
      `UPDATE attendance_rules SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE school_id = ? AND is_active = 1`,
      [session.schoolId],
    );

    // Insert new rule
    const result: any = await query(
      `INSERT INTO attendance_rules
         (school_id, rule_name, rule_description, arrival_start_time, arrival_end_time,
          late_threshold_minutes, absence_cutoff_time, closing_time, applies_to,
          applies_to_classes, ignore_duplicate_scans_within_minutes, is_active,
          effective_date, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURDATE(), 100)`,
      [
        session.schoolId,
        rule_name,
        rule_description || null,
        arrival_start_time || null,
        arrival_end_time || null,
        late_threshold_minutes,
        absence_cutoff_time || null,
        closing_time || null,
        applies_to,
        applies_to_classes || null,
        ignore_duplicate_scans_within_minutes,
      ],
    );

    return NextResponse.json({
      success: true,
      rule_id: result?.insertId,
      message: 'Attendance settings saved',
    });
  } catch (err: any) {
    console.error('[attendance/settings POST]', err);
    return NextResponse.json({ error: err.message || 'Failed to save settings' }, { status: 500 });
  }
}
