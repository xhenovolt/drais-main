import { NextRequest, NextResponse } from 'next/server';
import { sendSMS, normalizePhoneNumber } from '@/lib/africastalking';
import { getControlSession, controlAudit, clientIp } from '@/lib/control/auth';
import { controlCan } from '@/lib/control/permissions';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

const MAX_MESSAGE_LENGTH = 160;
const WINDOW_MINUTES = 10;

export async function POST(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user.role, 'sms.test')) return NextResponse.json({ error: 'You do not have permission to send SMS tests' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const phone = normalizePhoneNumber(String(body?.phone || '').trim());
  const message = String(body?.message || '').trim();
  if (!phone) return NextResponse.json({ error: 'A valid Uganda phone number is required' }, { status: 400 });
  if (!message || message.length > MAX_MESSAGE_LENGTH) return NextResponse.json({ error: `Message must be 1-${MAX_MESSAGE_LENGTH} characters` }, { status: 400 });

  const recent = (await query(
    `SELECT COUNT(*) AS count FROM control_audit_logs
      WHERE user_id = ? AND action = 'sms_test' AND created_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [user.id, WINDOW_MINUTES],
  )) as any[];
  if (Number(recent[0]?.count || 0) >= 1) {
    return NextResponse.json({ error: 'Only one SMS test is allowed per administrator every 10 minutes' }, { status: 429 });
  }

  const provider = process.env.AFRICASTALKING_USERNAME || process.env.AT_USERNAME ? "Africa's Talking" : 'Africa\'s Talking';
  const senderId = process.env.AT_SENDER_ID || process.env.AFRICASTALKING_SENDER_ID || undefined;
  const result = await sendSMS(phone, message, undefined, senderId);
  const safeProviderResponse = {
    provider,
    status: result.status || null,
    message_id: result.messageId || null,
    cost: result.cost || null,
    error: result.error || null,
    details: result.details ? { statusCode: result.details.statusCode || null, providerMessage: result.details.providerMessage || null } : null,
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