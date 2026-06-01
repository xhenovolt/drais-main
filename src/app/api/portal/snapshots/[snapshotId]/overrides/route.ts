/**
 * GET /api/portal/snapshots/[snapshotId]/overrides
 *
 * Parent-readable override list for a snapshot the parent is allowed
 * to view. Mirrors the staff /api/snapshots/[id]/overrides shape so
 * the print-snapshot page can use the same JSON.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePortalContext } from '@/lib/portal/context';
import { listOverrides } from '@/lib/snapshots/overrides';
import { query } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ snapshotId: string }> }) {
  const { snapshotId } = await params;
  if (!snapshotId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const ctxRes = await requirePortalContext(req);
  if ('error' in ctxRes) return ctxRes.error;
  const { schoolId, session } = ctxRes.ctx;

  // Same overlap check as the parent snapshot read: at least one of
  // the parent's linked learners must be in this snapshot.
  const snapRows = (await query(
    `SELECT snapshot_json
       FROM report_snapshots
      WHERE snapshot_id = ? AND school_id = ? AND status = 'ready'
      LIMIT 1`,
    [snapshotId, schoolId],
  )) as Array<{ snapshot_json: string | null }>;
  if (snapRows.length === 0 || !snapRows[0].snapshot_json) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const snapshot = JSON.parse(snapRows[0].snapshot_json);

  const linkedRows = (await query(
    `SELECT student_id
       FROM parent_student_links
      WHERE parent_account_id = ? AND school_id = ? AND status = 'active'`,
    [session.parentAccountId, schoolId],
  )) as Array<{ student_id: number }>;
  const linked = new Set(linkedRows.map(r => Number(r.student_id)));
  const classes = Array.isArray(snapshot?.classes) ? snapshot.classes : [];
  const hasOverlap = classes.some((c: { students?: Array<{ studentDbId?: number }> }) =>
    Array.isArray(c.students) && c.students.some(s => linked.has(Number(s.studentDbId))),
  );
  if (!hasOverlap) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const overrides = await listOverrides({ snapshotId, schoolId });
  return NextResponse.json({ success: true, overrides });
}
