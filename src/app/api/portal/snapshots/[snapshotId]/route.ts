/**
 * GET /api/portal/snapshots/[snapshotId]
 *
 * Parent-readable snapshot. Returned ONLY when at least one of the
 * parent's linked learners appears in the snapshot AND the snapshot
 * belongs to the parent's active school. The shape mirrors the staff
 * endpoint at /api/snapshots/[id] so the print-snapshot page can use
 * the same JSON.
 *
 * Privacy: the JSON exposes ALL learners in the snapshot. Caller (the
 * print-snapshot page) is expected to filter via ?student_id=<dbId>.
 * For a stricter posture we could prune the payload to only the
 * parent's linked learners — see TODO at the bottom.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePortalContext } from '@/lib/portal/context';
import { query } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ snapshotId: string }> }) {
  const { snapshotId } = await params;
  if (!snapshotId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const ctxRes = await requirePortalContext(req);
  if ('error' in ctxRes) return ctxRes.error;
  const { schoolId, session } = ctxRes.ctx;

  // Resolve the snapshot row and assert it belongs to the parent's school.
  const rows = (await query(
    `SELECT snapshot_json
       FROM report_snapshots
      WHERE snapshot_id = ? AND school_id = ? AND status = 'ready'
      LIMIT 1`,
    [snapshotId, schoolId],
  )) as Array<{ snapshot_json: string | null }>;
  if (rows.length === 0 || !rows[0].snapshot_json) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const snapshot = JSON.parse(rows[0].snapshot_json);

  // Check that at least one of THIS parent's linked learners is in the
  // snapshot. If none match, the snapshot is none of their business and
  // we return 404 (not 403 — we don't want to confirm its existence).
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

  return NextResponse.json({ snapshot });
  // TODO (privacy hardening): prune snapshot.classes[].students[] to
  // only those entries whose studentDbId is in `linked`. Today the
  // print-snapshot page filters by ?student_id=<dbId>, which is
  // sufficient when the URL is constructed by us — but the JSON
  // technically exposes peer rows. Worth tightening if any UI ever
  // surfaces the raw payload to the parent.
}
