/**
 * POST /api/admin/comm/test-whatsapp — send a one-off test WhatsApp message
 * using THIS school's saved Infobip credentials + sender, to verify
 * delivery end-to-end. Body: { phone }
 *
 * Mirrors test-sms/route.ts exactly. Note the same caveat as
 * infobip-whatsapp.ts: a cold outbound message like this one only
 * delivers within Meta's 24h customer-service window (i.e. the test
 * phone number must have messaged the WhatsApp business number first) —
 * a REJECTED/undeliverable result here can mean "correctly configured,
 * but outside the messaging window" rather than "misconfigured."
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { getCommSettings } from '@/lib/comm';
import { normalizePhoneNumber } from '@/lib/africastalking';
import { sendWhatsAppMessage } from '@/lib/comm/providers/infobip-whatsapp';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try { await requirePermission(session.userId, session.schoolId, 'comm.settings.manage', session.isSuperAdmin); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const body = await req.json().catch(() => ({}));
  const phone = normalizePhoneNumber(String(body?.phone || '').trim());
  if (!phone) return NextResponse.json({ error: 'A valid phone number is required' }, { status: 400 });

  const s = await getCommSettings(session.schoolId);
  if (!s.whatsappSender) {
    return NextResponse.json({ error: 'Set a WhatsApp sender/business number in settings before testing.' }, { status: 400 });
  }

  const result = await sendWhatsAppMessage(
    phone,
    'DRAIS test message — your WhatsApp setup is working.',
    s.whatsappSender,
    { baseUrl: s.whatsappProviderBaseUrl, apiKey: s.whatsappProviderApiKey },
  );

  // Return the real provider result so the admin can see exactly what happened.
  return NextResponse.json(
    result.success
      ? { success: true, message: `Test WhatsApp message sent to ${phone}.` }
      : { success: false, error: result.error || 'Send failed', detail: result.details ?? null },
    { status: 200 },
  );
}
