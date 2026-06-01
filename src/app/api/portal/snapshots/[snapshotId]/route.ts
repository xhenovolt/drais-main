/**
 * GET /api/portal/snapshots/[snapshotId]
 *
 * Parent-readable snapshot. Returned ONLY when at least one of the
 * parent's linked learners appears in the snapshot AND the snapshot
 * belongs to the parent's active school. The shape mirrors the staff
 * endpoint at /api/snapshots/[id] so the print-snapshot page can use
 * the same JSON.
 *
 * Privacy hardening: the response is PRUNED so the parent only ever
 * sees rows for their own linked learners. Peer learner names, marks,
 * comments, photo URLs, custom fields, generic skills and project
 * outcomes are stripped before the bytes leave the server. The page
 * filter by ?student_id=<dbId> remains as defence in depth — the
 * server no longer relies on it for confidentiality.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePortalContext } from '@/lib/portal/context';
import { query } from '@/lib/db';

interface SnapshotShape {
  classes?:        Array<{ students?: Array<{ studentDbId?: number }> }>;
  customValues?:   Record<string, unknown>;
  genericSkills?:  Record<string, unknown>;
  projects?:       Record<string, unknown>;
  [k: string]:     unknown;
}

/**
 * Remove every peer-learner row from the snapshot so the JSON contains
 * only the parent's own linked children. Mutates in place — caller has
 * already JSON.parsed a private copy.
 *
 * What gets pruned:
 *   - classes[].students[] → only entries whose studentDbId is linked
 *   - classes[] entirely removed when no linked students remain in it
 *     (a parent should not even learn that a peer class exists)
 *   - customValues / genericSkills / projects — top-level maps keyed
 *     by studentDbId; non-linked keys are deleted
 *
 * What is NOT pruned (intentionally):
 *   - classes[].subjects — subjects taught in a class aren't private
 *     and are needed to render columns for the linked learner
 *   - meta.* — school + term + year + branding are the same for the
 *     whole snapshot and don't leak peer info
 *   - meta.dataHash — left as-is; consumers that recompute should
 *     understand this is a parent-pruned view (we DON'T pretend it
 *     re-hashes to match)
 */
function pruneSnapshotForParent(snapshot: SnapshotShape, linked: ReadonlySet<number>): void {
  if (Array.isArray(snapshot.classes)) {
    const keptClasses: typeof snapshot.classes = [];
    for (const cls of snapshot.classes) {
      const allStudents = Array.isArray(cls.students) ? cls.students : [];
      const keptStudents = allStudents.filter(s => linked.has(Number(s.studentDbId)));
      if (keptStudents.length === 0) continue;
      // Drop peers; keep everything else on the class (className, stream,
      // subjects, classTeacher, etc.). Re-assign students after filter.
      keptClasses.push({ ...cls, students: keptStudents });
    }
    snapshot.classes = keptClasses;
  }

  for (const key of ['customValues', 'genericSkills', 'projects'] as const) {
    const m = snapshot[key];
    if (m && typeof m === 'object') {
      const pruned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(m)) {
        if (linked.has(Number(k))) pruned[k] = v;
      }
      snapshot[key] = pruned;
    }
  }
}

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
  const snapshot = JSON.parse(rows[0].snapshot_json) as SnapshotShape;

  // Look up this parent's active links — the authoritative allow-list.
  const linkedRows = (await query(
    `SELECT student_id
       FROM parent_student_links
      WHERE parent_account_id = ? AND school_id = ? AND status = 'active'`,
    [session.parentAccountId, schoolId],
  )) as Array<{ student_id: number }>;
  const linked = new Set(linkedRows.map(r => Number(r.student_id)));

  // Prune BEFORE the overlap check so a parent with zero overlap gets a
  // 404 rather than an empty-classes payload.
  pruneSnapshotForParent(snapshot, linked);
  const survivingClasses = Array.isArray(snapshot.classes) ? snapshot.classes : [];
  if (survivingClasses.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ snapshot });
}
