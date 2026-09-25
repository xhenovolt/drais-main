/**
 * GET /api/sms/topups/:id — the purchase's current state. While it is still open this asks MarzPay for the
 * truth (authenticated lookup) and credits the SMS if it was really paid, so the page works even when the
 * payment callback cannot reach us. A school can only see its own purchases (others look like "not found").
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { canAny } from '@/lib/rbac/fallback';
import { query } from '@/lib/db';
import { syncTopup } from '@/lib/sms/topup';
import { getSmsPosition } from '@/lib/sms/usage';

export const runtime = 'nodejs';
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const s = await getSessionSchoolId(req);
  if (!s) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const g = { userId: s.userId, schoolId: s.schoolId, isSuperAdmin: !!s.isSuperAdmin };
  if (!(await canAny(g, ['comm.settings.manage', 'comm.dispatch.send'], ['admin']))) {
    return NextResponse.json({ error: 'Only a school administrator can view purchases' }, { status: 403 });
  }
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const own = ((await query(`SELECT id FROM sms_topups WHERE id = ? AND school_id = ? LIMIT 1`, [id, s.schoolId])) as any[])[0];
  if (!own) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const r = await syncTopup(id);
  const row = ((await query(`SELECT amount_ugx, sms_units, status, failure_reason, credited_at FROM sms_topups WHERE id = ?`, [id])) as any[])[0];
  const pos = await getSmsPosition(s.schoolId);
  return NextResponse.json({
    success: true, id, status: row?.status ?? r.status, credited: row?.status === 'credited',
    sms: Number(row?.sms_units ?? 0), amountUgx: Number(row?.amount_ugx ?? 0), reason: row?.failure_reason ?? r.failureReason,
    balance: { remaining: pos.remaining, quota: pos.quota },
  });
}
