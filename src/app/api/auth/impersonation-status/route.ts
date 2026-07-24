/**
 * GET /api/auth/impersonation-status — is the current school session a control
 * impersonation? Drives the persistent "operating as [school]" banner. Cheap,
 * public (reads only the caller's own session cookie).
 */
import { NextRequest, NextResponse } from 'next/server';
import { impersonationStatus } from '@/lib/control/impersonation';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('drais_session')?.value;
  const status = await impersonationStatus(token).catch(() => ({ impersonating: false }));
  return NextResponse.json({ success: true, ...status });
}
