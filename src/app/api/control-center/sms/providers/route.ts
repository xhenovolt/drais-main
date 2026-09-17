import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, controlAudit, clientIp } from '@/lib/control/auth';
import { controlCan } from '@/lib/control/permissions';
import { createSmsProvider, listSmsProviders } from '@/lib/control/sms-providers';
import { SMS_PROVIDER_ADAPTERS } from '@/lib/sms/providers';

export const runtime = 'nodejs';
const PROVIDER_LIST_TIMEOUT_MS = 10_000;

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user.role, 'sms.provider.view')) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
  const providers = await Promise.race([
    listSmsProviders(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Provider database request timed out')), PROVIDER_LIST_TIMEOUT_MS)),
  ]).catch((error: any) => {
    return NextResponse.json({ error: error?.message || 'Provider list unavailable' }, { status: 503 });
  });
  if (providers instanceof NextResponse) return providers;
  return NextResponse.json({ success: true, providers, supported: Object.values(SMS_PROVIDER_ADAPTERS).map((adapter) => ({ type: adapter.type, name: adapter.displayName, required_fields: adapter.requiredFields })) });
}

export async function POST(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user.role, 'sms.provider.create')) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body?.provider_type || !body?.config || typeof body.config !== 'object') return NextResponse.json({ error: 'provider_type and config are required' }, { status: 400 });
  const result = await createSmsProvider({ providerType: body.provider_type, displayName: body.display_name, config: body.config }, user.id);
  await controlAudit(user.id, 'sms_provider_create', `sms_provider:${body.provider_type}`, { ok: result.ok, error: result.ok ? null : result.error }, clientIp(req)).catch(() => {});
  return NextResponse.json(result, { status: result.ok ? 201 : 400 });
}
