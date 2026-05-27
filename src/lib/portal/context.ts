/**
 * Shared request guard for parent-portal read routes. Resolves the parent
 * session, requires an active school context, and (for single-learner routes)
 * enforces the isolation gate. Returns a typed result or a ready NextResponse
 * error so routes stay one-liners.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getParentSession, type ParentSession } from './session';
import { assertCanViewStudent, PortalForbiddenError, PortalNoSchoolContextError } from './guard';

export interface PortalContext {
  session:  ParentSession;
  schoolId: number;
}

export async function requirePortalContext(
  req: NextRequest,
): Promise<{ ctx: PortalContext } | { error: NextResponse }> {
  const session = await getParentSession(req);
  if (!session) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  if (session.activeSchoolId == null) {
    return { error: NextResponse.json({ error: 'No active school selected', code: 'NO_SCHOOL_CONTEXT' }, { status: 409 }) };
  }
  return { ctx: { session, schoolId: session.activeSchoolId } };
}

/** Context + gate check for a specific learner. 403 if the learner isn't linked. */
export async function requireLinkedLearner(
  req: NextRequest,
  studentId: number,
): Promise<{ ctx: PortalContext } | { error: NextResponse }> {
  const res = await requirePortalContext(req);
  if ('error' in res) return res;
  try {
    await assertCanViewStudent(res.ctx.session.parentAccountId, res.ctx.schoolId, studentId);
  } catch (e) {
    if (e instanceof PortalForbiddenError)
      return { error: NextResponse.json({ error: 'Not authorized for this learner' }, { status: 403 }) };
    if (e instanceof PortalNoSchoolContextError)
      return { error: NextResponse.json({ error: 'No active school selected', code: 'NO_SCHOOL_CONTEXT' }, { status: 409 }) };
    throw e;
  }
  return res;
}
