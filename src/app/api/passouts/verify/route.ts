/**
 * POST /api/passouts/verify — learner identity verification (Phase 4).
 * Body: { method: 'fingerprint'|'card'|'manual', pin?, admission_no?, student_id? }
 *
 * fingerprint / card → any user with gate or slip permission.
 * manual → requires slip.create (manual lookup is permission-dependent).
 *
 * Returns the full operator panel: photo, name, class, guardian, history,
 * active pass, outstanding return. Logs an identity_verified event.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission, userCan } from '@/lib/rbac';
import { verifyLearner } from '@/lib/passouts/identity';
import { logPassoutEvent } from '@/lib/passouts/store';

export const runtime = 'nodejs';

const clientIp = (req: NextRequest) =>
  (req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || '').trim() || null;

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const b = await req.json().catch(() => null);
  const method = b?.method as string;
  if (!['fingerprint', 'card', 'manual'].includes(method)) {
    return NextResponse.json({ error: 'method must be fingerprint | card | manual' }, { status: 400 });
  }

  // Gate officers may verify by fingerprint/card; manual search needs the
  // slip permission (it can find any learner without physical presence).
  try {
    if (method === 'manual') {
      await requirePermission(session.userId, session.schoolId, 'passouts.slip.create', session.isSuperAdmin);
    } else {
      const ok = session.isSuperAdmin
        || await userCan(session.userId, session.schoolId, 'passouts.gate.verify')
        || await userCan(session.userId, session.schoolId, 'passouts.slip.create');
      if (!ok) throw new Error('Missing permission: passouts.gate.verify');
    }
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }

  try {
    const result = await verifyLearner(session.schoolId, {
      method: method as any, pin: b.pin, admission_no: b.admission_no, student_id: b.student_id,
    });
    if (result.verified) {
      await logPassoutEvent({
        schoolId: session.schoolId, studentId: result.student.id, eventType: 'identity_verified',
        decision: 'allowed', reason: method, userId: session.userId, ip: clientIp(req), verifyMethod: method,
      });
    }
    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Verification failed' }, { status: 500 });
  }
}
