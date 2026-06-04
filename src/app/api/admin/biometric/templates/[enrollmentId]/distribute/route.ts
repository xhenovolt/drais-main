/**
 * POST /api/admin/biometric/templates/[enrollmentId]/distribute
 *
 * Manually re-queues template distributions for an enrollment. Use
 * cases:
 *   - A new device was added to the school after the original
 *     enrollment; queue the existing templates to it.
 *   - A previous distribution attempt failed; reset to 'queued'.
 *   - Operator wants to verify ops post-Phase 2 acquire.
 *
 * Auth
 * ----
 * Only the school that owns the enrollment can redistribute. Super-
 * admin can target any enrollment.
 *
 * Request body (optional)
 * -----------------------
 *   { resetFailed?: boolean }   // if true, flips any 'failed' rows
 *                               // back to 'queued' before re-queueing
 *
 * Response
 * --------
 *   200 { success: true, enrollmentId, templates: [{templateId, queued}] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';
import { queueDistributionsForSchool } from '@/lib/biometric/template-service';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ enrollmentId: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { enrollmentId: enrollmentIdRaw } = await ctx.params;
  const enrollmentId = Number(enrollmentIdRaw);
  if (!Number.isFinite(enrollmentId) || enrollmentId <= 0) {
    return NextResponse.json({ error: 'Invalid enrollmentId' }, { status: 400 });
  }

  // Ownership guard. Super-admin bypasses.
  const enrollmentRows = (await query(
    `SELECT id, school_id, origin_device_sn
       FROM biometric_enrollments
      WHERE id = ?
      LIMIT 1`,
    [enrollmentId],
  )) as Array<{ id: number; school_id: number; origin_device_sn: string | null }>;
  if (enrollmentRows.length === 0) {
    return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
  }
  const enrollment = enrollmentRows[0];
  if (enrollment.school_id !== session.schoolId && !session.isSuperAdmin) {
    return NextResponse.json(
      { error: 'Enrollment belongs to a different school' },
      { status: 403 },
    );
  }

  let body: { resetFailed?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  // Optional reset of failed distributions.
  if (body.resetFailed) {
    try {
      await query(
        `UPDATE template_distributions td
           JOIN biometric_templates bt ON bt.id = td.template_id
            SET td.status = 'queued',
                td.attempted_at = NULL,
                td.last_error = NULL
          WHERE bt.enrollment_id = ?
            AND td.status = 'failed'`,
        [enrollmentId],
      );
    } catch (err) {
      return NextResponse.json(
        { error: `Reset failed: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 },
      );
    }
  }

  // Re-queue per template owned by this enrollment.
  const templates = (await query(
    `SELECT id FROM biometric_templates WHERE enrollment_id = ?`,
    [enrollmentId],
  )) as Array<{ id: number }>;

  const report: Array<{ templateId: number; queued: number }> = [];
  for (const t of templates) {
    const queued = await queueDistributionsForSchool(
      t.id, enrollment.school_id, enrollment.origin_device_sn,
    );
    report.push({ templateId: t.id, queued });
  }

  return NextResponse.json({
    success: true,
    enrollmentId,
    templates: report,
  });
}
