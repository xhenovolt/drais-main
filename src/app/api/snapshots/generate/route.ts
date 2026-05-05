import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { generateSnapshot, SnapshotInFlightError } from '@/lib/snapshots/generator';
import type { SnapshotType } from '@/lib/snapshots/types';

const VALID_TYPES: SnapshotType[] = ['theology', 'secular', 'mixed'];

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const type         = body?.type;
  const termId       = Number(body?.termId);
  const yearId       = Number(body?.yearId);
  const resultTypeId = body?.resultTypeId === null || body?.resultTypeId === undefined
    ? null
    : Number(body.resultTypeId);
  const classIds     = Array.isArray(body?.classIds)
    ? body.classIds.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n))
    : undefined;

  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Invalid `type`. Expected theology|secular|mixed' }, { status: 400 });
  }
  if (!Number.isFinite(termId) || termId <= 0) {
    return NextResponse.json({ error: 'Invalid `termId`' }, { status: 400 });
  }
  if (!Number.isFinite(yearId) || yearId <= 0) {
    return NextResponse.json({ error: 'Invalid `yearId`' }, { status: 400 });
  }
  if (resultTypeId !== null && (!Number.isFinite(resultTypeId) || resultTypeId <= 0)) {
    return NextResponse.json({ error: 'Invalid `resultTypeId`' }, { status: 400 });
  }

  try {
    const result = await generateSnapshot(
      { type, termId, yearId, resultTypeId, classIds },
      { schoolId: session.schoolId, generatedBy: session.userId },
    );
    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    if (e instanceof SnapshotInFlightError) {
      return NextResponse.json(
        { error: 'GENERATION_IN_PROGRESS', message: e.message },
        { status: 409 },
      );
    }
    console.error('[snapshots/generate] Failed:', e);
    return NextResponse.json(
      { error: 'GENERATION_FAILED', message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
