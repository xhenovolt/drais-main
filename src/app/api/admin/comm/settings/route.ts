import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { getCommSettings, updateCommSettings } from '@/lib/comm';
import { logAudit, AuditAction } from '@/lib/audit';
import { planForSchool } from '@/lib/sms/school-routing';
import { query } from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/africastalking';
import { getSmsPricing } from '@/lib/control/sms-economics';
import { DELIVERY_ALERT_MODES, DELIVERY_ALERT_HOURLY_CAP } from '@/lib/sms/delivery-alerts';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'comm.settings.view', session.isSuperAdmin);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const settings  = await getCommSettings(session.schoolId);
  // SMS providers come from Control Center (sms_provider_configs), not the
  // static in-code registry — that list only ever showed africas_talking /
  // infobip_whatsapp / console regardless of what the platform actually uses.
  const providers = ((await query(
    `SELECT id, provider_type, display_name, is_active FROM sms_provider_configs WHERE enabled = 1 ORDER BY is_active DESC, display_name`, [],
  ).catch(() => [])) as any[]).map((p) => ({
    id: Number(p.id), name: String(p.display_name), type: String(p.provider_type), channel: 'sms', isActive: Number(p.is_active) === 1,
  }));
  // Never return raw API keys to the client; send a mask if one is set.
  const masked = {
    ...settings,
    providerApiKey: settings.providerApiKey ? '********' : null,
    hasApiKey: !!settings.providerApiKey,
    whatsappProviderApiKey: settings.whatsappProviderApiKey ? '********' : null,
    hasWhatsappApiKey: !!settings.whatsappProviderApiKey,
  };

  // What Control Center actually routes this school's SMS through right
  // now (src/lib/sms/school-routing.ts) — the school's own "Default
  // Provider"/credentials below only ever apply as a fallback (an
  // EXPLICIT mode:'own' route, or no active platform provider at all).
  // Surfaced so this page stops implying the school picks its own
  // provider when, for attendance/bulk SMS, Control Center's choice wins.
  let effectiveRoute: { kind: string; providerName: string | null; explicit?: boolean } = { kind: 'legacy', providerName: null };
  try {
    const plan = await planForSchool(session.schoolId);
    if (plan.kind === 'central') {
      const p = ((await query(`SELECT display_name FROM sms_provider_configs WHERE id = ? LIMIT 1`, [plan.providerId]).catch(() => [])) as any[])[0];
      const explicit = !!((await query(`SELECT 1 FROM school_sms_routes WHERE school_id = ? AND mode <> 'inherit' LIMIT 1`, [session.schoolId]).catch(() => [])) as any[])[0];
      effectiveRoute = { kind: 'central', providerName: p?.display_name ?? `Provider #${plan.providerId}`, explicit };
    } else if (plan.kind === 'own') {
      effectiveRoute = { kind: 'own', providerName: "Africa's Talking (this school's own account)" };
    } else if (plan.kind === 'error') {
      effectiveRoute = { kind: 'error', providerName: null };
    } else {
      effectiveRoute = { kind: 'legacy', providerName: "Africa's Talking (this school's own account)" };
    }
  } catch { /* best-effort — settings still load without it */ }

  // What one SMS costs THIS school (its own override, else the platform retail price) — shown in
  // the delivery-alert warning so the cost of each alert is a real number, not a vague caution.
  let smsPriceUgx: number | null = null;
  try {
    const own = ((await query(`SELECT price_ugx FROM sms_school_prices WHERE school_id = ? LIMIT 1`, [session.schoolId]).catch(() => [])) as any[])[0];
    smsPriceUgx = own?.price_ugx != null ? Number(own.price_ugx) : (await getSmsPricing()).retailPrice;
  } catch { /* the warning still shows, without a figure */ }

  return NextResponse.json({ success: true, settings: masked, providers, effectiveRoute, deliveryAlertHourlyCap: DELIVERY_ALERT_HOURLY_CAP, smsPriceUgx });
}

export async function PUT(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'comm.settings.manage', session.isSuperAdmin);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  if (body.senderName !== undefined && body.senderName !== null && String(body.senderName).length > 11) {
    return NextResponse.json({ error: 'Sender name must be 11 chars or fewer (SMS limit)' }, { status: 400 });
  }
  // Empty string → NULL (means "use provider default")
  if (body.senderName === '') body.senderName = null;

  // Delivery-status alert number: stored normalised (+256...), blank clears it.
  if (body.deliveryAlertPhone !== undefined) {
    const raw = String(body.deliveryAlertPhone ?? '').trim();
    if (!raw) body.deliveryAlertPhone = null;
    else {
      const phone = normalizePhoneNumber(raw);
      if (!phone) return NextResponse.json({ error: 'The delivery alert number is not a valid phone number' }, { status: 400 });
      body.deliveryAlertPhone = phone;
    }
  }
  if (body.deliveryAlertMode !== undefined && !DELIVERY_ALERT_MODES.includes(body.deliveryAlertMode)) {
    return NextResponse.json({ error: 'Invalid delivery alert mode' }, { status: 400 });
  }
  const settings = await updateCommSettings(session.schoolId, body);

  // Never log raw API keys — only whether each one changed.
  const { providerApiKey, whatsappProviderApiKey, ...safeBody } = body;
  await logAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: AuditAction.SETTINGS_CHANGED, entityType: 'comm_settings', entityId: session.schoolId,
    details: { ...safeBody, apiKeyChanged: providerApiKey !== undefined, whatsappApiKeyChanged: whatsappProviderApiKey !== undefined },
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  });

  return NextResponse.json({ success: true, settings });
}
