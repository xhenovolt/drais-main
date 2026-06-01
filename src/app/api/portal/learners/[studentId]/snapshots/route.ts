/**
 * GET /api/portal/learners/[studentId]/snapshots
 *
 * Lists report snapshots that:
 *   - belong to this parent's active school
 *   - are status = 'ready'
 *   - include this learner in their classes/students payload
 *
 * Parent isolation is enforced via requireLinkedLearner BEFORE any data
 * is returned. The snapshot JSON is then filtered server-side so a
 * parent can never see a row whose learner set doesn't intersect their
 * own.
 *
 * Result shape:
 *   { success, snapshots: [{ id, type, term, year, createdAt }] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireLinkedLearner } from '@/lib/portal/context';
import { query } from '@/lib/db';

interface SnapshotRow {
  snapshot_id:   string;
  type:          string;
  snapshot_json: string;
  term_name:     string | null;
  year_name:     string | null;
  created_at:    string;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ studentId: string }> }) {
  const studentId = Number((await params).studentId);
  if (!studentId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const ctxRes = await requireLinkedLearner(req, studentId);
  if ('error' in ctxRes) return ctxRes.error;
  const { schoolId } = ctxRes.ctx;

  const rows = (await query(
    `SELECT rs.snapshot_id,
            rs.type,
            rs.snapshot_json,
            t.name  AS term_name,
            ay.name AS year_name,
            rs.created_at
       FROM report_snapshots rs
       LEFT JOIN terms          t  ON t.id  = rs.term_id
       LEFT JOIN academic_years ay ON ay.id = rs.year_id
      WHERE rs.school_id = ? AND rs.status = 'ready'
      ORDER BY rs.created_at DESC
      LIMIT 50`,
    [schoolId],
  )) as SnapshotRow[];

  // Filter snapshots whose JSON includes this student. Done in Node
  // rather than via SQL because the payload is a LONGTEXT blob — for the
  // typical low-volume parent dashboard (≤ 20 snapshots per term) the
  // parse cost is trivial. If volume ever grows past a few dozen, we'd
  // add a (snapshot_id, student_db_id) join table populated at save.
  const out: Array<{ id: string; type: string; term: string | null; year: string | null; createdAt: string }> = [];
  for (const r of rows) {
    try {
      const data = JSON.parse(r.snapshot_json);
      const classes = Array.isArray(data?.classes) ? data.classes : [];
      const hasLearner = classes.some((c: { students?: Array<{ studentDbId?: number }> }) =>
        Array.isArray(c.students) && c.students.some(s => Number(s.studentDbId) === studentId),
      );
      if (!hasLearner) continue;
      out.push({
        id:        r.snapshot_id,
        type:      r.type,
        term:      r.term_name,
        year:      r.year_name,
        createdAt: r.created_at,
      });
    } catch { /* corrupt JSON — skip */ }
  }

  return NextResponse.json({ success: true, snapshots: out });
}
