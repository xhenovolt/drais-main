/**
 * POST /api/passouts/gate — verify a learner at the gate (Phase 7).
 * Body: { student_id? | admission_no? | pin?, device_sn?, apply? }
 *   student_id    manual lookup (authorized users)
 *   admission_no  Student ID card verification
 *   pin           fingerprint device PIN
 *   apply:false → decision only (preview); apply:true (default) → record exit/return.
 * The live-scan popup uses the same engine on the automatic fingerprint path.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { decideGate, applyGate } from '@/lib/passouts/engine';
import { verifyLearner } from '@/lib/passouts/identity';

export const runtime = 'nodejs';

const clientIp = (req: NextRequest) =>
  (req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || '').trim() || null;

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'passouts.gate.verify', session.isSuperAdmin);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }

  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  // Resolve identity first — the gate never decides on an unverified learner.
  let studentId: number | null = null;
  let method: 'fingerprint' | 'card' | 'manual' = 'manual';
  let learner: any = null;
  try {
    if (b.pin != null && b.pin !== '') method = 'fingerprint';
    else if (b.admission_no) method = 'card';
    else if (!b.student_id) return NextResponse.json({ error: 'student_id, admission_no or pin is required' }, { status: 400 });

    const v = await verifyLearner(session.schoolId, {
      method, pin: b.pin, admission_no: b.admission_no, student_id: b.student_id,
    });
    if (!v.verified) return NextResponse.json({ success: true, decision: 'denied', outcome: 'identity_failed', title: 'NOT AUTHORIZED', reason: v.reason });
    studentId = v.student.id;
    learner = v.student;
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Verification failed' }, { status: 500 });
  }

  try {
    const result = b.apply === false
      ? await decideGate(session.schoolId, studentId)
      : await applyGate(session.schoolId, studentId, b.device_sn ?? null, b.raw_event_id ?? null, session.userId, method, clientIp(req));
    // Approved-by name for the guard's display.
    let approvedByName: string | null = null;
    if (result.passout?.approved_by) {
      const { query } = await import('@/lib/db');
      const u = (await query(
        `SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), username, email) AS name
           FROM users WHERE id = ? LIMIT 1`,
        [result.passout.approved_by],
      ).catch(() => [])) as any[];
      approvedByName = u[0]?.name ?? null;
    }
    return NextResponse.json({ success: true, learner, verify_method: method, approved_by_name: approvedByName, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
  }
}
