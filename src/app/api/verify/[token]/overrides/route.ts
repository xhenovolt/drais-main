/**
 * GET /api/verify/[token]/overrides
 *
 * Public overrides read for the verify-PDF path. Same token-as-proof
 * gating as /api/verify/[token]/snapshot.
 *
 * Returns the unified override list for the snapshot id baked into
 * the token. We do NOT filter to a single student because the
 * override schema doesn't carry studentDbId at the entry level
 * uniformly — applyOverrides + selectOverridesForStudent already
 * filter per render. Surface area is still gated by HMAC.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyVerifyToken } from '@/lib/snapshots/verify-token';
import { listOverrides } from '@/lib/snapshots/overrides';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = verifyVerifyToken(token);
  if (!payload) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!payload.c) {
    // Older tokens without a school claim — can't safely scope a query
    return NextResponse.json({ success: true, overrides: [] });
  }
  const overrides = await listOverrides({ snapshotId: payload.s, schoolId: payload.c });
  return NextResponse.json({ success: true, overrides });
}
