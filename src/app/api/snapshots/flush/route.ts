import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import {
  flushSnapshots,
  cancelInflightForKey,
  type FlushCriteria,
} from '@/lib/snapshots/lifecycle';
import type { SnapshotType } from '@/lib/snapshots/types';

const VALID_TYPES: SnapshotType[] = ['theology', 'secular', 'mixed'];
const VALID_TERMINAL_STATUSES = ['ready', 'failed', 'cancelled', 'stale'] as const;
type TerminalStatus = typeof VALID_TERMINAL_STATUSES[number];

/**
 * Hard-delete snapshot rows matching the supplied criteria. Reserved for
 * super-admin (matches the existing DELETE /api/snapshots/[id] policy).
 *
 * Body:
 *   {
 *     type?:         SnapshotType,
 *     termId?:       number,
 *     yearId?:       number,
 *     resultTypeId?: number | null,
 *     status?:       Array<'ready'|'failed'|'cancelled'|'stale'>,
 *     cancelInflight?: boolean    // also clear in-flight rows for matching key
 *   }
 *
 * If no narrowing fields are provided the request is rejected — flushing an
 * entire school's snapshot history requires at least one filter.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!session.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden — super-admin only' }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }

  const type         = VALID_TYPES.includes(body?.type) ? (body.type as SnapshotType) : undefined;
  const termId       = body?.termId !== undefined && body.termId !== null
    ? Number(body.termId) : undefined;
  const yearId       = body?.yearId !== undefined && body.yearId !== null
    ? Number(body.yearId) : undefined;
  const resultTypeId = body?.resultTypeId === undefined
    ? undefined
    : (body.resultTypeId === null ? null : Number(body.resultTypeId));
  const cancelInflight = body?.cancelInflight === true;

  const status: TerminalStatus[] | undefined = Array.isArray(body?.status)
    ? body.status.filter((s: string): s is TerminalStatus =>
        (VALID_TERMINAL_STATUSES as readonly string[]).includes(s))
    : undefined;

  if (
    type === undefined &&
    termId === undefined &&
    yearId === undefined &&
    resultTypeId === undefined
  ) {
    return NextResponse.json(
      { error: 'At least one of type/termId/yearId/resultTypeId is required' },
      { status: 400 },
    );
  }

  const criteria: FlushCriteria = {
    schoolId: session.schoolId,
    type,
    termId,
    yearId,
    resultTypeId,
    status,
  };

  let cancelled = 0;
  if (cancelInflight && type && termId !== undefined && yearId !== undefined) {
    cancelled = await cancelInflightForKey({
      schoolId:    session.schoolId,
      type,
      termId,
      yearId,
      cancelledBy: session.userId,
    });
  }

  const removed = await flushSnapshots(criteria);

  return NextResponse.json({
    success:           true,
    removed,
    cancelledInflight: cancelled,
    criteria,
  });
}
