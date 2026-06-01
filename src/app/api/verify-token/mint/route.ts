/**
 * GET /api/verify-token/mint?snapshot_id=&student_id=
 *
 * Mints a signed verification token for (snapshot, optional learner).
 * Accepts EITHER a staff session (getSessionSchoolId) or a parent
 * portal session — both are legitimate sources for printing a QR.
 *
 * For parents, the gating reuses the active-link rule: the requested
 * student_id must be one of the parent's linked learners. Without this
 * a parent could mint a verify URL for any peer learner in their
 * school.
 *
 * Returns: { token, url } where `url` is the absolute verify URL the
 * QR shape encodes. Caller passes the request origin so the URL is
 * dial-able from a scanner without extra rewriting.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { getParentSession } from '@/lib/portal/session';
import { signVerifyToken, buildVerifyUrl } from '@/lib/snapshots/verify-token';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const snapshotId = (sp.get('snapshot_id') ?? '').trim();
  const studentIdRaw = sp.get('student_id');
  const studentId = studentIdRaw ? Number(studentIdRaw) : undefined;
  if (!snapshotId) {
    return NextResponse.json({ error: 'snapshot_id required' }, { status: 400 });
  }

  // Staff path — easy: the staff session already proves school scope.
  const staff = await getSessionSchoolId(req);
  if (staff) {
    const schoolRows = (await query(
      `SELECT school_id FROM report_snapshots WHERE snapshot_id = ? LIMIT 1`,
      [snapshotId],
    )) as Array<{ school_id: number }>;
    if (schoolRows.length === 0) {
      return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
    }
    if (schoolRows[0].school_id !== staff.schoolId) {
      return NextResponse.json({ error: 'Snapshot not in your school' }, { status: 403 });
    }
    const payload = { s: snapshotId, c: staff.schoolId, ...(studentId ? { u: studentId } : {}), v: 1 as const };
    const url = buildVerifyUrl(req.nextUrl.origin, payload);
    return NextResponse.json({ success: true, token: signVerifyToken(payload), url });
  }

  // Parent path — must be linked to the requested student_id.
  const parent = await getParentSession(req);
  if (!parent) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!studentId) {
    return NextResponse.json({ error: 'student_id required for parent mint' }, { status: 400 });
  }
  // 1. snapshot must be in parent's active school context
  const ctxRows = (await query(
    `SELECT school_id FROM report_snapshots WHERE snapshot_id = ? LIMIT 1`,
    [snapshotId],
  )) as Array<{ school_id: number }>;
  if (ctxRows.length === 0) {
    return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
  }
  const snapshotSchool = ctxRows[0].school_id;

  // 2. parent must have an ACTIVE link to studentId in that school
  const linkRows = (await query(
    `SELECT 1 FROM parent_student_links
      WHERE parent_account_id = ? AND school_id = ? AND student_id = ? AND status = 'active'
      LIMIT 1`,
    [parent.parentAccountId, snapshotSchool, studentId],
  )) as Array<unknown>;
  if (linkRows.length === 0) {
    return NextResponse.json({ error: 'Not linked to this learner' }, { status: 403 });
  }

  const payload = { s: snapshotId, c: snapshotSchool, u: studentId, v: 1 as const };
  const url = buildVerifyUrl(req.nextUrl.origin, payload);
  return NextResponse.json({ success: true, token: signVerifyToken(payload), url });
}
