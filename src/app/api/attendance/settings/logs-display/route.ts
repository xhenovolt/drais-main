/**
 * GET/PUT /api/attendance/settings/logs-display
 *
 * School-wide display density for the Attendance Logs table (compact /
 * comfortable / spacious) — every admin at the school sees the same
 * layout, rather than each browser guessing independently. Stored as a
 * single key in school_settings, matching the quiet-hours / digest-mode
 * pattern (no new table for one setting).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

export type LogsDensity = 'compact' | 'comfortable' | 'spacious';
const VALID: LogsDensity[] = ['compact', 'comfortable', 'spacious'];
const DEFAULT_DENSITY: LogsDensity = 'comfortable';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const rows = (await query(
    `SELECT value_text FROM school_settings WHERE school_id = ? AND key_name = 'attendance.logs_density' LIMIT 1`,
    [session.schoolId],
  ).catch(() => [])) as Array<{ value_text: string | null }>;
  const raw = rows[0]?.value_text;
  const density: LogsDensity = VALID.includes(raw as LogsDensity) ? (raw as LogsDensity) : DEFAULT_DENSITY;
  return NextResponse.json({ success: true, density });
}

export async function PUT(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await req.json().catch(() => null) as any;
  const density = body?.density;
  if (!VALID.includes(density)) return NextResponse.json({ error: `density must be one of ${VALID.join(', ')}` }, { status: 400 });
  const existing = (await query(
    `SELECT id FROM school_settings WHERE school_id = ? AND key_name = 'attendance.logs_density' LIMIT 1`,
    [session.schoolId],
  )) as Array<{ id: number }>;
  if (existing[0]) {
    await query(`UPDATE school_settings SET value_text = ? WHERE id = ?`, [density, existing[0].id]);
  } else {
    await query(`INSERT INTO school_settings (school_id, key_name, value_text) VALUES (?, 'attendance.logs_density', ?)`, [session.schoolId, density]);
  }
  return NextResponse.json({ success: true, density });
}
