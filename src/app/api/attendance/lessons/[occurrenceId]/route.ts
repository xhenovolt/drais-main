/**
 * GET  /api/attendance/lessons/:occurrenceId          — the automatic roster for one lesson.
 * POST /api/attendance/lessons/:occurrenceId          — correct one learner:
 *        { personId, status: present|late|absent|excused|auto, reason }
 * Every correction needs a reason and is written to the audit log.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireLessonAccess, isResponse } from '@/lib/attendance/lessons/access';
import { buildRoster, correctLessonAttendance, getOccurrence } from '@/lib/attendance/lessons/service';

export const runtime = 'nodejs';
export const maxDuration = 60;
type Ctx = { params: Promise<{ occurrenceId: string }> };

const parseId = (v: string) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

export async function GET(req: NextRequest, ctx: Ctx) {
  const s = await requireLessonAccess(req, 'view');
  if (isResponse(s)) return s;
  const id = parseId((await ctx.params).occurrenceId);
  if (!id) return NextResponse.json({ error: 'Invalid lesson' }, { status: 400 });

  const occ = await getOccurrence(s.schoolId, id);
  if (!occ || (!s.seesAll && occ.teacherId !== s.staffId)) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
  const roster = await buildRoster(s.schoolId, id);
  if (!roster) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
  return NextResponse.json({ success: true, ...roster });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const s = await requireLessonAccess(req, 'correct');
  if (isResponse(s)) return s;
  const id = parseId((await ctx.params).occurrenceId);
  if (!id) return NextResponse.json({ error: 'Invalid lesson' }, { status: 400 });

  const occ = await getOccurrence(s.schoolId, id);
  if (!occ || (!s.seesAll && occ.teacherId !== s.staffId)) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });

  const body = await req.json().catch(() => null) as any;
  const personId = Number(body?.personId);
  if (!Number.isInteger(personId) || personId <= 0 || typeof body?.status !== 'string') {
    return NextResponse.json({ error: 'personId and status are required' }, { status: 400 });
  }
  const r = await correctLessonAttendance({
    schoolId: s.schoolId, userId: s.userId, occurrenceId: id, personId,
    status: body.status, reason: typeof body.reason === 'string' ? body.reason : '',
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ success: true });
}
