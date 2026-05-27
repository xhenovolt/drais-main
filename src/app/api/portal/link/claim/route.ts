/**
 * POST /api/portal/link/claim
 *
 * The parent claims their children. Uses the session's VERIFIED phone to find
 * learners whose on-file contact matches, then creates link rows (pending, or
 * active if the school auto-approves). No body needed — the phone is the
 * authenticated identity, already proven at registration.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getParentSession } from '@/lib/portal/session';
import { claimLearners } from '@/lib/portal/linking';
import { query } from '@/lib/db';

export async function POST(req: NextRequest) {
  const session = await getParentSession(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // Require a verified phone — the OTP-contact-match invariant.
  const acc = (await query(
    `SELECT phone_verified FROM parent_accounts WHERE id = ? LIMIT 1`,
    [session.parentAccountId],
  )) as any[];
  if (!acc.length || !acc[0].phone_verified) {
    return NextResponse.json({ error: 'Phone not verified' }, { status: 403 });
  }

  const result = await claimLearners(session.parentAccountId, session.phone);

  if (result.noMatch) {
    return NextResponse.json({
      success: true,
      matched: false,
      message: 'No learner records match your phone number. Ask the school to add your number to your child\'s contacts, then try again.',
      created: [],
    });
  }

  const pending = result.created.filter(c => c.status === 'pending').length;
  const active  = result.created.filter(c => c.status === 'active').length;

  return NextResponse.json({
    success: true,
    matched: true,
    created: result.created,
    already_linked: result.alreadyLinked,
    summary: {
      pending_approval: pending,
      activated:        active,
    },
    message:
      active && !pending ? 'Your child has been linked to your account.'
      : pending && !active ? 'Request sent. The school will approve your access shortly.'
      : pending && active ? 'Some links are active; others await school approval.'
      : 'No new links created.',
  });
}
