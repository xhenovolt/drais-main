/**
 * GET /api/verify/[token]/snapshot
 *
 * PUBLIC snapshot read gated by an HMAC-signed verification token.
 * No session required — the token IS the access proof.
 *
 * Returns the snapshot JSON PRUNED to the (classIdx, studentDbId)
 * claims baked into the token, so a token bearer can never harvest
 * peer-learner data even if they tampered with the URL.
 *
 * Used by the print-snapshot page when navigated with
 * `?verify_token=<token>` so the verify-PDF puppeteer path can
 * fetch the same data the parent / staff paths use, just without
 * session auth.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyVerifyToken } from '@/lib/snapshots/verify-token';
import { query } from '@/lib/db';

interface SnapshotShape {
  classes?:        Array<{ students?: Array<{ studentDbId?: number }> }>;
  customValues?:   Record<string, unknown>;
  genericSkills?:  Record<string, unknown>;
  projects?:       Record<string, unknown>;
  [k: string]:     unknown;
}

/** Same prune logic as /api/portal/snapshots/[id] — keep only the
 *  studentDbId claimed by the token. When `u` is absent, the whole
 *  snapshot is allowed (class transcripts use case). */
function pruneSnapshotForVerify(snapshot: SnapshotShape, studentDbId: number | undefined): void {
  if (typeof studentDbId !== 'number') return;
  if (Array.isArray(snapshot.classes)) {
    const kept = snapshot.classes
      .map(cls => {
        const students = Array.isArray(cls.students) ? cls.students : [];
        const filtered = students.filter(s => Number(s.studentDbId) === studentDbId);
        return filtered.length > 0 ? { ...cls, students: filtered } : null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
    snapshot.classes = kept;
  }
  for (const key of ['customValues', 'genericSkills', 'projects'] as const) {
    const m = snapshot[key];
    if (m && typeof m === 'object') {
      const pruned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(m)) {
        if (Number(k) === studentDbId) pruned[k] = v;
      }
      snapshot[key] = pruned;
    }
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = verifyVerifyToken(token);
  if (!payload) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const rows = (await query(
    `SELECT snapshot_json FROM report_snapshots
      WHERE snapshot_id = ? AND status = 'ready'
        ${payload.c ? 'AND school_id = ?' : ''}
      LIMIT 1`,
    payload.c ? [payload.s, payload.c] : [payload.s],
  )) as Array<{ snapshot_json: string | null }>;
  if (rows.length === 0 || !rows[0].snapshot_json) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const snapshot = JSON.parse(rows[0].snapshot_json) as SnapshotShape;
  pruneSnapshotForVerify(snapshot, payload.u);
  if (Array.isArray(snapshot.classes) && snapshot.classes.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ snapshot });
}
