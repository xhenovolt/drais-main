/**
 * POST /api/admin/devices/[sn]/release
 *
 * The current school relinquishes ownership of a device. Phase 2
 * ceremony — closes every active biometric_enrollment for this SN +
 * school, opens a device_transfers row in 'released' state, marks
 * devices.status='released', preserves historical raw events.
 *
 * Auth
 * ----
 * Only the school that currently owns the device can release it.
 * Super-admin can release on behalf of any school.
 *
 * Request body
 * ------------
 *   { reason?: string }
 *
 * Response
 * --------
 *   200 { success: true, impact: TransferImpact }
 *   400 / 403 / 404 on invalid state
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { releaseDevice, TransferStateError } from '@/lib/devices/transfer-service';
import { assertClaimSecret, ClaimSecretError } from '@/lib/devices/claim-secret';
import { query } from '@/lib/db';

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

  // Ownership guard. Super-admin bypasses.
  if (!session.isSuperAdmin) {
    const owner = (await query(
      `SELECT school_id FROM devices WHERE sn = ? LIMIT 1`,
      [sn],
    )) as Array<{ school_id: number }>;
    if (!owner[0]) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }
    if (owner[0].school_id !== session.schoolId) {
      return NextResponse.json(
        { error: 'Device belongs to a different school' },
        { status: 403 },
      );
    }
  }

  let body: { reason?: string; secret?: string } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  // Ownership-ceremony secret gate (DEVICE_CLAIM_SECRET).
  try {
    assertClaimSecret(body.secret);
  } catch (err) {
    if (err instanceof ClaimSecretError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  try {
    const impact = await releaseDevice(sn, {
      userId: session.userId,
      schoolId: session.schoolId,
      ip: req.headers.get('x-forwarded-for') ?? null,
      userAgent: req.headers.get('user-agent') ?? null,
    }, body.reason ?? null);
    return NextResponse.json({ success: true, impact });
  } catch (err: unknown) {
    if (err instanceof TransferStateError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg || 'Release failed' }, { status: 500 });
  }
}
