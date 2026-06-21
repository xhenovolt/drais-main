/**
 * GET /api/parent/learners/[learnerAccessId]/reports
 * Gated. PUBLISHED report snapshots (status='ready') that include this learner.
 * Never exposes drafts/unpublished. Filtered server-side against the snapshot
 * JSON so only snapshots actually containing this learner are listed.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireLearnerAccess } from '@/lib/parent/context';
import { query } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ learnerAccessId: string }> }) {
  const { learnerAccessId } = await params;
  const res = await requireLearnerAccess(req, learnerAccessId);
  if ('error' in res) return res.error;
  const { student_id, school_id } = res.access;

  const rows = (await query(
    `SELECT rs.snapshot_id, rs.type, rs.snapshot_json,
            t.name AS term_name, ay.name AS year_name, rs.generated_at AS created_at
       FROM report_snapshots rs
       LEFT JOIN terms t ON t.id = rs.term_id
       LEFT JOIN academic_years ay ON ay.id = rs.year_id
      WHERE rs.school_id = ? AND rs.status = 'ready'
      ORDER BY rs.generated_at DESC LIMIT 50`,
    [school_id],
  )) as Array<{ snapshot_id: string; type: string; snapshot_json: string; term_name: string | null; year_name: string | null; created_at: string }>;

  const reports: Array<{ id: string; type: string; term: string | null; year: string | null; createdAt: string }> = [];
  for (const r of rows) {
    try {
      const data = JSON.parse(r.snapshot_json);
      const classes = Array.isArray(data?.classes) ? data.classes : [];
      const has = classes.some((c: { students?: Array<{ studentDbId?: number }> }) =>
        Array.isArray(c.students) && c.students.some(st => Number(st.studentDbId) === student_id));
      if (!has) continue;
      reports.push({ id: r.snapshot_id, type: r.type, term: r.term_name, year: r.year_name, createdAt: r.created_at });
    } catch { /* skip corrupt */ }
  }

  return NextResponse.json({ success: true, published_only: true, reports });
}
