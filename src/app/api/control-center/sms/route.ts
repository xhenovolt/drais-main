/**
 * Control Center — SMS Financial Control Center (P5).
 *   GET  → provider balance + per-school allocation / used / remaining + totals.
 *   POST { school_id, quota } → set a school's SMS allocation (canManage).
 * Control-session gated + audited.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, controlAudit, clientIp } from '@/lib/control/auth';
import { controlCan } from '@/lib/control/permissions';
import { query } from '@/lib/db';
import {
  fetchProviderBalance, getAllocations, getUsageBySchool, setAllocation,
  estimatedSms, remainingQuota,
} from '@/lib/control/sms-economics';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const [balance, allocations, usage, schools] = await Promise.all([
    fetchProviderBalance(),
    getAllocations(),
    getUsageBySchool(),
    query(`SELECT id, name FROM schools WHERE deleted_at IS NULL ORDER BY name ASC`).catch(() => []) as Promise<any[]>,
  ]);

  const rows = (schools as any[]).map((s) => {
    const id = Number(s.id);
    const quota = allocations[id]?.quota ?? null;
    const used = usage[id]?.segments ?? 0;
    return {
      school_id: id, name: s.name,
      quota, note: allocations[id]?.note ?? null,
      used, sends: usage[id]?.sends ?? 0,
      remaining: quota == null ? null : remainingQuota(quota, used),
    };
  });

  const totalAllocated = rows.reduce((a, r) => a + (r.quota ?? 0), 0);
  const totalUsed = rows.reduce((a, r) => a + r.used, 0);
  // Rough per-SMS cost for capacity estimate (UGX). Override via env if needed.
  const costPerSms = Number(process.env.SMS_UNIT_COST_UGX || 32);

  return NextResponse.json({
    success: true,
    provider: {
      ok: balance.ok, currency: balance.currency, amount: balance.amount, raw: balance.raw,
      error: balance.error ?? null,
      estimated_sms: balance.ok ? estimatedSms(balance.amount, costPerSms) : null,
      unit_cost: costPerSms,
    },
    totals: { allocated: totalAllocated, used: totalUsed, schools: rows.length },
    rows,
  });
}

export async function POST(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user.role, 'billing.manage')) {
    return NextResponse.json({ error: 'You do not have permission to manage SMS allocations' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const schoolId = Number(body?.school_id);
  const quota = Number(body?.quota);
  if (!Number.isFinite(schoolId) || schoolId <= 0) return NextResponse.json({ error: 'Valid school_id required' }, { status: 400 });
  if (!Number.isFinite(quota) || quota < 0) return NextResponse.json({ error: 'Valid quota (>= 0) required' }, { status: 400 });

  await setAllocation(schoolId, quota, user.id, body?.note ? String(body.note).slice(0, 255) : null);
  await controlAudit(user.id, 'set_sms_allocation', `schools:${schoolId}`, { quota }, clientIp(req)).catch(() => {});

  return NextResponse.json({ success: true, school_id: schoolId, quota: Math.max(0, Math.floor(quota)) });
}
