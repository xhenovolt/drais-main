import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import {
  listClassTeachers,
  assignClassTeacher,
} from '@/lib/services/class-teachers';

/**
 * Phase E — Class-teacher assignment endpoint.
 *
 *   GET  /api/admin/classes/[id]/teacher  → history for this class
 *   POST /api/admin/classes/[id]/teacher  → assign a new class teacher
 *           body: { staff_id, term_id, stream_id?, notes? }
 *
 * School scoping handled by the service layer.
 */

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const classId = Number(id);
  if (!Number.isFinite(classId) || classId <= 0) {
    return NextResponse.json({ error: 'Invalid class id' }, { status: 400 });
  }
  const assignments = await listClassTeachers({
    classId,
    schoolId: session.schoolId,
  });
  return NextResponse.json({ success: true, assignments });
}

interface PostBody {
  staff_id:   number;
  term_id:    number;
  stream_id?: number | null;
  notes?:     string | null;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const classId = Number(id);
  if (!Number.isFinite(classId) || classId <= 0) {
    return NextResponse.json({ error: 'Invalid class id' }, { status: 400 });
  }

  let body: PostBody;
  try {
    body = await req.json() as PostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const staffId = Number(body.staff_id);
  const termId  = Number(body.term_id);
  if (!Number.isFinite(staffId) || staffId <= 0) {
    return NextResponse.json({ error: 'Invalid staff_id' }, { status: 400 });
  }
  if (!Number.isFinite(termId) || termId <= 0) {
    return NextResponse.json({ error: 'Invalid term_id' }, { status: 400 });
  }
  const streamId = body.stream_id === undefined || body.stream_id === null
    ? null
    : Number(body.stream_id);
  if (streamId !== null && !Number.isFinite(streamId)) {
    return NextResponse.json({ error: 'Invalid stream_id' }, { status: 400 });
  }

  try {
    const newId = await assignClassTeacher({
      classId,
      streamId,
      termId,
      staffId,
      schoolId:   session.schoolId,
      assignedBy: session.userId,
      notes:      body.notes ?? null,
    });
    return NextResponse.json({ success: true, id: newId });
  } catch (e: unknown) {
    const status = (e as { statusCode?: number })?.statusCode ?? 500;
    const message = e instanceof Error ? e.message : 'Failed to assign class teacher';
    return NextResponse.json({ error: message }, { status });
  }
}
