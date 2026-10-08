/**
 * GET /api/sms/quota — a school's own SMS position (P5 school-side visibility).
 *
 * Schools must SEE how many SMS they have left. Returns their allocation, used
 * (from audited SMS_SENT segments) and remaining, plus whether the platform
 * provider can currently send at all — WITHOUT exposing the platform's money
 * balance (that's Control Center only).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { getSchoolSmsPosition, getProviderBalanceCached, getSmsPricing } from '@/lib/control/sms-economics';
import { getDbMode } from '@/lib/db/db-mode';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // local-sqlite branch — Phase 7 sub-effort 39. SMS is an online-only
  // external service (same classification as every Cloudinary-backed
  // feature in this phase) — sending requires the same internet connection
  // offline mode simulates the absence of, so there's no real quota
  // position to report. Returns "unlimited, can't say" rather than
  // risking an uncaught throw from the pricing chain's own query() calls
  // (unlike the other two branches below, getSmsPricing() isn't wrapped
  // in a .catch() by this route).
  if (getDbMode() === 'local-sqlite') {
    return NextResponse.json({
      success: true,
      quota: null,
      used: 0,
      remaining: null,
      can_send: false,
      reason: 'OFFLINE',
    });
  }

  const [pos, bal, pricing] = await Promise.all([
    getSchoolSmsPosition(session.schoolId).catch(() => ({ quota: null as number | null, used: 0, remaining: Infinity })),
    getProviderBalanceCached().catch(() => null),
    getSmsPricing(),
  ]);

  const providerCanSend = !bal || !bal.ok || bal.amount >= pricing.internalCost; // unknown → assume ok
  const allocationExhausted = pos.quota != null && pos.remaining <= 0;

  return NextResponse.json({
    success: true,
    quota: pos.quota,                                   // null = unlimited
    used: pos.used,
    remaining: pos.remaining === Infinity ? null : pos.remaining,
    can_send: providerCanSend && !allocationExhausted,
    reason: !providerCanSend ? 'PLATFORM_BALANCE_DEPLETED'
      : allocationExhausted ? 'ALLOCATION_EXHAUSTED'
      : null,
  });
}
