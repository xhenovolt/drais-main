/**
 * POST /api/admin/biometric/phase1-backfill
 *
 * Operator-driven Phase 1 backfill trigger. Copies legacy mapping rows
 * for a single school into biometric_enrollments. Run per school during
 * the migration window; safe to re-run (idempotent).
 *
 * Request body: {}  — backfills the caller's school.
 *                { schoolId: number } — super-admin can target any school.
 *
 * Response:
 *   200 { success: true, report: BackfillReport }
 *   401 / 403 on auth failure.
 *
 * Auth: requires an authenticated session. Cross-school backfill
 * requires session.isSuperAdmin === true.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { backfillSchool } from '@/lib/biometric/migrations/backfill-enrollments';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: { schoolId?: number } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  const targetSchoolId = body.schoolId ?? session.schoolId;

  if (targetSchoolId !== session.schoolId && !(session as any).isSuperAdmin) {
    return NextResponse.json(
      { error: 'Cross-school backfill requires super-admin' },
      { status: 403 },
    );
  }

  try {
    const report = await backfillSchool(targetSchoolId);
    return NextResponse.json({ success: true, report });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'backfill failed' },
      { status: 500 },
    );
  }
}
