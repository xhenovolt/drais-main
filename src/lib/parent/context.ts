/**
 * Request guards for /api/parent/* routes. Pure-OTP session, cross-school
 * (NOT pinned to one active school). Detail routes resolve a learnerAccessId
 * to a server-side student via the resolver gate.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getParentSession, type ParentSession } from '@/lib/portal/session';
import { resolveAccessId, type ResolvedAccess } from './parent-access-resolver';

export async function requireParent(
  req: NextRequest,
): Promise<{ session: ParentSession } | { error: NextResponse }> {
  const session = await getParentSession(req);
  if (!session) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  return { session };
}

/** Auth + resolve learnerAccessId → student (scoped to this parent, active only). */
export async function requireLearnerAccess(
  req: NextRequest,
  learnerAccessId: string,
): Promise<{ session: ParentSession; access: ResolvedAccess } | { error: NextResponse }> {
  const res = await requireParent(req);
  if ('error' in res) return res;
  const access = await resolveAccessId(res.session.parentAccountId, learnerAccessId);
  if (!access) return { error: NextResponse.json({ error: 'Learner not found' }, { status: 404 }) };
  return { session: res.session, access };
}
