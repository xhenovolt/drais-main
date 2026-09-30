import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { getCommSettings, updateCommSettings } from '@/lib/comm';
import { listProviders } from '@/lib/comm';
import { logAudit, AuditAction } from '@/lib/audit';
import { planForSchool } from '@/lib/sms/school-routing';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'comm.settings.view', session.isSuperAdmin);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const settings  = await getCommSettings(session.schoolId);
  const providers = listProviders();
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
  let effectiveRoute: { kind: string; providerName: string | null } = { kind: 'legacy', providerName: null };
  try {
    const plan = await planForSchool(session.schoolId);
    if (plan.kind === 'central') {
      const p = ((await query(`SELECT display_name FROM sms_provider_configs WHERE id = ? LIMIT 1`, [plan.providerId]).catch(() => [])) as any[])[0];
      effectiveRoute = { kind: 'central', providerName: p?.display_name ?? `Provider #${plan.providerId}` };
    } else if (plan.kind === 'own') {
      effectiveRoute = { kind: 'own', providerName: "Africa's Talking (this school's own account)" };
    } else if (plan.kind === 'error') {
      effectiveRoute = { kind: 'error', providerName: null };
    } else {
      effectiveRoute = { kind: 'legacy', providerName: null };
    }
  } catch { /* best-effort — settings still load without it */ }

  return NextResponse.json({ success: true, settings: masked, providers, effectiveRoute });
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
