import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { issuePlatformKey, listPlatformKeys, revokePlatformKey } from '@/lib/platform/keys';
import { PLATFORM_SCOPES, type PlatformScope } from '@/lib/platform/scopes';

function gate(session: any) {
  if (!session)             return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!session.isSuperAdmin) return NextResponse.json({ error: 'Super admin only' }, { status: 403 });
  return null;
}

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  const block = gate(session); if (block) return block;
  const keys = await listPlatformKeys();
  return NextResponse.json({ success: true, keys, available_scopes: PLATFORM_SCOPES });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  const block = gate(session); if (block) return block;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const consumer = String(body.consumer ?? '').trim();
  const scopes   = Array.isArray(body.scopes) ? body.scopes as PlatformScope[] : null;
  if (!consumer) return NextResponse.json({ error: 'consumer is required' }, { status: 400 });
  if (!scopes || !scopes.length) return NextResponse.json({ error: 'scopes[] required' }, { status: 400 });
  for (const s of scopes) {
    if (!PLATFORM_SCOPES.includes(s)) return NextResponse.json({ error: `Unknown scope: ${s}` }, { status: 400 });
  }

  const issued = await issuePlatformKey({
    consumer,
    label:           body.label,
    scopes,
    allowedIps:      body.allowed_ips,
    rateLimitPerMin: body.rate_limit_per_min,
    expiresAt:       body.expires_at ? new Date(body.expires_at) : null,
    createdBy:       session!.userId,
    environment:     body.environment === 'test' ? 'test' : 'live',
  });

  return NextResponse.json({
    success: true,
    key_id:   issued.keyId,
    token:    issued.token,
    note:     'Store this token now — it will not be shown again.',
    consumer: issued.consumer,
    scopes:   issued.scopes,
    expires_at: issued.expiresAt,
  });
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  const block = gate(session); if (block) return block;
  const keyId = new URL(req.url).searchParams.get('key_id');
  if (!keyId) return NextResponse.json({ error: 'key_id required' }, { status: 400 });
  await revokePlatformKey(keyId, session!.userId);
  return NextResponse.json({ success: true, key_id: keyId, revoked: true });
}
