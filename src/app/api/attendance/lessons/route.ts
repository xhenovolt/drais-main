/**
 * GET /api/attendance/lessons?date=YYYY-MM-DD[&classId=n]
 * The day's scheduled lessons (from the timetable) with per-status counts.
 * Teachers see only their own lessons; configure-level users see everyone's.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireLessonAccess, isResponse } from '@/lib/attendance/lessons/access';
import { getLessonPolicy, listLessonsForDay } from '@/lib/attendance/lessons/service';
import { resolveTimePolicy } from '@/lib/attendance/device-clock';
import { localDateOf } from '@/lib/attendance/lessons/engine';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const s = await requireLessonAccess(req, 'view');
  if (isResponse(s)) return s;

  const tp = await resolveTimePolicy(s.schoolId);
  const q = req.nextUrl.searchParams.get('date');
  const date = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : localDateOf(Date.now(), tp.offsetMinutes);
  const classId = Number(req.nextUrl.searchParams.get('classId')) || undefined;

  const policy = await getLessonPolicy(s.schoolId);
  if (!policy.enabled) return NextResponse.json({ success: true, enabled: false, date, lessons: [] });

  const mineOnly = !s.seesAll;
  if (mineOnly && s.staffId == null) return NextResponse.json({ success: true, enabled: true, date, lessons: [], note: 'Your account is not linked to a staff record.' });
  const lessons = await listLessonsForDay(s.schoolId, date, { teacherStaffId: mineOnly ? s.staffId : null, classId });
  return NextResponse.json({ success: true, enabled: true, date, scope: mineOnly ? 'mine' : 'all', lessons });
}
