/**
 * POST /api/passouts/gate — verify a learner at the gate (manual/tablet path).
 * Body: { student_id, device_sn?, apply? }
 *   apply:false → decision only (preview); apply:true (default) → record exit/return.
 * The live-scan popup uses the same engine on the automatic fingerprint path.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { decideGate, applyGate } from '@/lib/passouts/engine';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'passouts.gate.verify', session.isSuperAdmin);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }

  const b = await req.json().catch(() => null);
  if (!b?.student_id) return NextResponse.json({ error: 'student_id is required' }, { status: 400 });
  try {
    const result = b.apply === false
      ? await decideGate(session.schoolId, Number(b.student_id))
      : await applyGate(session.schoolId, Number(b.student_id), b.device_sn ?? null, b.raw_event_id ?? null, session.userId);
    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
  }
}
