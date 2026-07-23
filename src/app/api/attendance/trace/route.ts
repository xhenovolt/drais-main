/**
 * Attendance Digital Twin API (Phase 2).
 *
 * GET ?event_id=123          → full stage-by-stage trace for one punch
 * GET ?q=&date=&limit=       → event explorer list with per-stage flags
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { buildPunchTrace, searchTraceEvents } from '@/lib/attendance/trace';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  try {
    if (sp.get('event_id')) {
      const trace = await buildPunchTrace(session.schoolId, Number(sp.get('event_id')));
      if (!trace) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
      return NextResponse.json({ success: true, ...trace });
    }
    const rows = await searchTraceEvents(session.schoolId, {
      q: sp.get('q') || undefined,
      date: sp.get('date') || undefined,
      limit: sp.get('limit') ? Number(sp.get('limit')) : undefined,
    });
    return NextResponse.json({ success: true, rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Trace failed' }, { status: 500 });
  }
}
