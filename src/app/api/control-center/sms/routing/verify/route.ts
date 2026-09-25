/**
 * POST /api/control-center/sms/routing/verify { schoolId }
 * Checks that the account a school's route resolves to can authenticate — WITHOUT sending any SMS.
 * (Reads the account/balance endpoint only.) Never returns a secret.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession } from '@/lib/control/auth';
import { controlCan } from '@/lib/control/permissions';
import { query } from '@/lib/db';
import { decryptProviderConfig, SMS_PROVIDER_ADAPTERS, type SmsProviderType } from '@/lib/sms/providers';
import { getActiveCentralId, loadRoutes, resolveRoutePlan, schoolsWithOwnCreds } from '@/lib/sms/school-routing';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user.role, 'sms.route.view')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const body = await req.json().catch(() => null) as any;
  const schoolId = Number(body?.schoolId);
  if (!Number.isInteger(schoolId) || schoolId <= 0) return NextResponse.json({ error: 'schoolId required' }, { status: 400 });

  const [routes, creds, activeId] = await Promise.all([loadRoutes(), schoolsWithOwnCreds(), getActiveCentralId()]);
  const plan = resolveRoutePlan(schoolId, routes, (i) => creds.has(i), activeId);

  try {
    if (plan.kind === 'error') return NextResponse.json({ success: true, ok: false, message: plan.reason });
    if (plan.kind === 'legacy') {
      // Legacy: the school's own account if it has one, otherwise nothing school-specific to test.
      if (!creds.has(schoolId)) return NextResponse.json({ success: true, ok: true, message: 'No school-specific account; the platform provider is used.' });
      return verifyOwn(schoolId);
    }
    if (plan.kind === 'own') return verifyOwn(plan.schoolId);

    const row = ((await query(`SELECT provider_type, encrypted_config FROM sms_provider_configs WHERE id = ? LIMIT 1`, [plan.providerId])) as any[])[0];
    if (!row) return NextResponse.json({ success: true, ok: false, message: 'The chosen provider no longer exists.' });
    const type = row.provider_type as SmsProviderType;
    const v = await SMS_PROVIDER_ADAPTERS[type].validate(decryptProviderConfig(String(row.encrypted_config)));
    return NextResponse.json({ success: true, ok: v.ok, message: v.ok ? `Provider accepted the credentials (${v.status}).` : (v.message || v.status) });
  } catch (e: any) {
    return NextResponse.json({ success: true, ok: false, message: e?.message || 'Check failed' });
  }
}

async function verifyOwn(schoolId: number) {
  const r = ((await query(`SELECT provider_username u, provider_api_key k FROM comm_settings WHERE school_id = ? LIMIT 1`, [schoolId])) as any[])[0];
  if (!r?.u || !r?.k) return NextResponse.json({ success: true, ok: false, message: 'That school has no account credentials saved.' });
  const host = r.u === 'sandbox' ? 'https://api.sandbox.africastalking.com' : 'https://api.africastalking.com';
  const res = await fetch(`${host}/version1/user?username=${encodeURIComponent(r.u)}`, { headers: { apiKey: r.k, Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
  return NextResponse.json({ success: true, ok: res.ok, message: res.ok ? "Africa's Talking accepted the credentials." : `Africa's Talking rejected the credentials (HTTP ${res.status}).` });
}
