/**
 * POST /api/admin/devices/[sn]/acquire
 *
 * The caller's school picks up a previously-released device. Requires
 * the device to be in status='released'. Updates devices.school_id,
 * wipes any unclaimed fingerprint_orphans for the SN, closes the open
 * device_transfers row.
 *
 * Auth
 * ----
 * Any authenticated school admin can acquire a released device into
 * their own school. Super-admin can acquire into any school by
 * passing schoolId in the body.
 *
 * Request body
 * ------------
 *   { reason?: string, schoolId?: number }   // schoolId super-admin only
 *
 * Response
 * --------
 *   200 { success: true, impact: TransferImpact }
 *   400 / 403 / 404 on invalid state
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { acquireDevice, TransferStateError } from '@/lib/devices/transfer-service';
import { assertClaimSecret, ClaimSecretError } from '@/lib/devices/claim-secret';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ sn: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { sn } = await ctx.params;
  if (!sn) {
    return NextResponse.json({ error: 'Missing device sn' }, { status: 400 });
  }

  let body: { reason?: string; schoolId?: number; secret?: string } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  // Ownership-ceremony secret gate (DEVICE_CLAIM_SECRET). Super-admins are
  // founder-independent: they may acquire any released device without the
  // secret (accountability via device_transfers + audit_logs).
  if (!session.isSuperAdmin) {
    try {
      assertClaimSecret(body.secret);
    } catch (err) {
      if (err instanceof ClaimSecretError) {
        return NextResponse.json({ error: err.message }, { status: 403 });
      }
      throw err;
    }
  }

  // Cross-school acquire requires super-admin.
  const toSchoolId = body.schoolId ?? session.schoolId;
  if (toSchoolId !== session.schoolId && !session.isSuperAdmin) {
    return NextResponse.json(
      { error: 'Cross-school acquire requires super-admin' },
      { status: 403 },
    );
  }

  try {
    const impact = await acquireDevice(sn, toSchoolId, {
      userId: session.userId,
      schoolId: toSchoolId,
      ip: req.headers.get('x-forwarded-for') ?? null,
      userAgent: req.headers.get('user-agent') ?? null,
      fromSuperAdmin: session.isSuperAdmin,
    }, body.reason ?? null);
    return NextResponse.json({ success: true, impact });
  } catch (err: unknown) {
    if (err instanceof TransferStateError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg || 'Acquire failed' }, { status: 500 });
  }
}
