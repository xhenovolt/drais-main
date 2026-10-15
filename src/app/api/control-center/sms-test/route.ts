import { NextRequest, NextResponse } from 'next/server';
import { checkTestLimit, normalizeUgPhone, sendThroughActiveProvider } from '@/lib/control/sms-limits';
import { getControlSession, controlAudit, clientIp } from '@/lib/control/auth';
import { controlCan } from '@/lib/control/permissions';

export const runtime = 'nodejs';

const MAX_MESSAGE_LENGTH = 160;

export async function POST(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user, 'sms.test')) return NextResponse.json({ error: 'You do not have permission to send SMS tests' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const phone = normalizeUgPhone(String(body?.phone || '').trim());
  const message = String(body?.message || '').trim();
  if (!phone) return NextResponse.json({ error: 'A valid Uganda phone number is required' }, { status: 400 });
  if (!message || message.length > MAX_MESSAGE_LENGTH) return NextResponse.json({ error: `Message must be 1-${MAX_MESSAGE_LENGTH} characters` }, { status: 400 });

  const limited = await checkTestLimit(user);
  if (limited) return NextResponse.json({ error: limited }, { status: 429 });

  // Through the ACTIVE provider — the one schools' messages use — so a test proves real delivery.
  const sent = await sendThroughActiveProvider([phone], message);
  const provider = sent.provider?.name ?? 'No active provider';
  const r = sent.results[0];
  const result = { success: r.ok, messageId: r.messageId, status: r.ok ? 'sent' : null, error: r.error };
  const safeProviderResponse = {
    provider,
    status: result.status || null,
    message_id: result.messageId || null,
    error: result.error || null,
  };
  await controlAudit(user.id, 'sms_test', 'sms', {
    recipient: phone, message_length: message.length, message_id: result.messageId || null,
    provider, provider_response: safeProviderResponse, delivery_status: result.status || null,
    result: result.success ? 'provider_accepted' : 'provider_rejected',
  }, clientIp(req));

  return NextResponse.json({
    success: result.success,
    accepted_by_provider: result.success,
    internal_message_id: result.messageId || null,
    provider,
    provider_response: safeProviderResponse,
    delivery_status: result.status || null,
    error: result.success ? null : result.error || 'Provider rejected the message',
  }, { status: result.success ? 200 : 502 });
}